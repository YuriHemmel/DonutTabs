use crate::config::io::{load_from_path, save_atomic};
use crate::config::schema::{Config, Language, Profile, Tab, Theme};
use crate::errors::{AppError, AppResult};
use crate::launcher::{launch_tab, TauriOpener};
use crate::shortcut::ActiveShortcut;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, RwLock};
use tauri::{Emitter, Manager};
use uuid::Uuid;

pub const CONFIG_CHANGED_EVENT: &str = "config-changed";
pub const SETTINGS_INTENT_EVENT: &str = "settings-intent";

pub struct AppState {
    pub config: RwLock<Config>,
    pub config_path: PathBuf,
    /// Intent a ser consumido pela Settings na próxima montagem.
    pub pending_settings_intent: Mutex<Option<String>>,
    /// Atalho global atualmente registrado.
    pub active_shortcut: ActiveShortcut,
}

#[tauri::command]
pub fn get_config(state: tauri::State<'_, AppState>) -> Config {
    state.config.read().unwrap().clone()
}

#[tauri::command]
pub fn open_tab<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    tab_id: Uuid,
) -> Result<(), AppError> {
    let cfg = state.config.read().unwrap();
    let active = active_profile(&cfg)?;
    let tab = active
        .tabs
        .iter()
        .find(|t| t.id == tab_id)
        .ok_or_else(|| AppError::launcher("tab_not_found", &[("id", tab_id.to_string())]))?;
    let opener = TauriOpener::new(&app);
    launch_tab(tab, &opener)?;
    Ok(())
}

#[tauri::command]
pub fn hide_donut<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("donut") {
        window
            .hide()
            .map_err(|e| AppError::window("window_hide_failed", &[("reason", e.to_string())]))?;
    }
    Ok(())
}

#[tauri::command]
pub fn save_tab<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    tab: Tab,
    profile_id: Option<Uuid>,
) -> Result<Config, AppError> {
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        let target = profile_id.unwrap_or(cfg.active_profile_id);
        let profile = profile_by_id_mut(&mut cfg, target)?;
        apply_save_in_profile(profile, tab);
        save_with_rollback(&mut cfg, &state.config_path)?;
        cfg.clone()
    };
    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub fn delete_tab<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    tab_id: Uuid,
    profile_id: Option<Uuid>,
) -> Result<Config, AppError> {
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        let target = profile_id.unwrap_or(cfg.active_profile_id);
        let profile = profile_by_id_mut(&mut cfg, target)?;
        apply_delete_in_profile(profile, tab_id);
        save_with_rollback(&mut cfg, &state.config_path)?;
        cfg.clone()
    };
    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub fn open_settings<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    intent: Option<String>,
) -> Result<(), AppError> {
    if let Some(intent) = &intent {
        *state.pending_settings_intent.lock().unwrap() = Some(intent.clone());
    }
    crate::settings_window::show(&app)?;
    if let Some(intent) = intent {
        let _ = app.emit_to(
            crate::settings_window::SETTINGS_LABEL,
            SETTINGS_INTENT_EVENT,
            intent,
        );
    }
    Ok(())
}

#[tauri::command]
pub fn consume_settings_intent(state: tauri::State<'_, AppState>) -> Option<String> {
    state.pending_settings_intent.lock().unwrap().take()
}

#[tauri::command]
pub fn close_settings<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<(), AppError> {
    crate::settings_window::close(&app)
}

/// Atualiza o atalho de um perfil. Se o perfil for o ativo, re-registra o
/// atalho global de forma conflict-aware (Plano 4); para perfis inativos só
/// grava em disco.
#[tauri::command]
pub fn set_shortcut<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    combo: String,
    profile_id: Option<Uuid>,
) -> Result<Config, AppError> {
    let (target, is_active) = {
        let cfg = state.config.read().unwrap();
        let active = cfg.active_profile_id;
        let target = profile_id.unwrap_or(active);
        (target, target == active)
    };

    if is_active {
        // Tenta registrar o novo antes de mexer em qualquer estado em memória.
        crate::shortcut::set_from_config(&app, &state.active_shortcut, &combo)?;
    } else {
        // Perfil inativo: não toca o atalho global, mas valida o combo pra
        // evitar gravar lixo no disco que só falharia ao ativar o perfil.
        crate::shortcut::validate_combo(&combo)?;
    }

    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        let profile = profile_by_id_mut(&mut cfg, target)?;
        let old_combo = profile.shortcut.clone();
        profile.shortcut = combo.clone();
        if let Err(e) = save_atomic(&state.config_path, &cfg) {
            // Rollback: volta combo anterior em memória + re-registra atalho antigo se ativo.
            let profile = profile_by_id_mut(&mut cfg, target)?;
            profile.shortcut = old_combo.clone();
            if is_active {
                let _ = crate::shortcut::set_from_config(&app, &state.active_shortcut, &old_combo);
            }
            return Err(e);
        }
        cfg.clone()
    };

    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub fn set_theme<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    theme: Theme,
    profile_id: Option<Uuid>,
) -> Result<Config, AppError> {
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        let target = profile_id.unwrap_or(cfg.active_profile_id);
        let profile = profile_by_id_mut(&mut cfg, target)?;
        profile.theme = theme;
        save_with_rollback(&mut cfg, &state.config_path)?;
        cfg.clone()
    };
    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub fn set_language<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    language: Language,
) -> Result<Config, AppError> {
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        cfg.appearance.language = language;
        save_with_rollback(&mut cfg, &state.config_path)?;
        cfg.clone()
    };
    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub fn set_active_profile<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    profile_id: Uuid,
) -> Result<Config, AppError> {
    // Captura combo do novo perfil sem reter o read lock no register.
    let new_combo = {
        let cfg = state.config.read().unwrap();
        cfg.profiles
            .iter()
            .find(|p| p.id == profile_id)
            .ok_or_else(|| {
                AppError::config(
                    "profile_not_found",
                    &[("profileId", profile_id.to_string())],
                )
            })?
            .shortcut
            .clone()
    };

    crate::shortcut::set_from_config(&app, &state.active_shortcut, &new_combo)?;

    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        let old_active = cfg.active_profile_id;
        cfg.active_profile_id = profile_id;
        if let Err(e) = save_atomic(&state.config_path, &cfg) {
            cfg.active_profile_id = old_active;
            // Restaura o atalho do perfil anterior.
            let old_combo = cfg
                .profiles
                .iter()
                .find(|p| p.id == old_active)
                .map(|p| p.shortcut.clone());
            if let Some(combo) = old_combo {
                let _ = crate::shortcut::set_from_config(&app, &state.active_shortcut, &combo);
            }
            return Err(e);
        }
        cfg.clone()
    };

    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub fn create_profile<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    name: String,
    icon: Option<String>,
) -> Result<(Config, Uuid), AppError> {
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() {
        return Err(AppError::config("profile_name_empty", &[]));
    }

    let new_id = Uuid::new_v4();
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        let base_shortcut = cfg
            .profiles
            .first()
            .map(|p| p.shortcut.clone())
            .unwrap_or_else(|| "CommandOrControl+Shift+Space".into());
        cfg.profiles.push(Profile {
            id: new_id,
            name: trimmed,
            icon,
            shortcut: base_shortcut,
            theme: Theme::Dark,
            tabs: vec![],
        });
        save_with_rollback(&mut cfg, &state.config_path)?;
        cfg.clone()
    };
    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok((snapshot, new_id))
}

#[tauri::command]
pub fn delete_profile<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    profile_id: Uuid,
) -> Result<Config, AppError> {
    // Snapshot único sob read lock: valida pré-condições, decide swap de ativo
    // e captura combos de antes/depois pra rollback. Evita janelas de corrida
    // entre múltiplos `read()` consecutivos.
    struct Plan {
        new_active: Option<Uuid>,
        new_combo: Option<String>,
        old_combo: String,
    }
    let plan = {
        let cfg = state.config.read().unwrap();
        if cfg.profiles.len() <= 1 {
            return Err(AppError::config("cannot_delete_last_profile", &[]));
        }
        if !cfg.profiles.iter().any(|p| p.id == profile_id) {
            return Err(AppError::config(
                "profile_not_found",
                &[("profileId", profile_id.to_string())],
            ));
        }
        let old_active = cfg.active_profile_id;
        let old_combo = cfg
            .profiles
            .iter()
            .find(|p| p.id == old_active)
            .map(|p| p.shortcut.clone())
            .unwrap_or_default();
        let (new_active, new_combo) = if profile_id == old_active {
            let candidate = cfg
                .profiles
                .iter()
                .find(|p| p.id != profile_id)
                .ok_or_else(|| AppError::config("cannot_delete_last_profile", &[]))?;
            (Some(candidate.id), Some(candidate.shortcut.clone()))
        } else {
            (None, None)
        };
        Plan {
            new_active,
            new_combo,
            old_combo,
        }
    };

    // Re-registra atalho do novo ativo antes de qualquer mudança em disco.
    if let Some(combo) = &plan.new_combo {
        crate::shortcut::set_from_config(&app, &state.active_shortcut, combo)?;
    }

    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        if let Some(id) = plan.new_active {
            cfg.active_profile_id = id;
        }
        cfg.profiles.retain(|p| p.id != profile_id);
        if let Err(e) = save_atomic(&state.config_path, &cfg) {
            // Rollback: recarrega disco (best-effort).
            if let Ok(fresh) = load_from_path(&state.config_path) {
                *cfg = fresh;
            }
            // Restaura atalho antigo se trocamos. Usamos `plan.old_combo`
            // capturado antes da mutação — sobrevive mesmo se o reload falhar.
            if plan.new_combo.is_some() && !plan.old_combo.is_empty() {
                let _ =
                    crate::shortcut::set_from_config(&app, &state.active_shortcut, &plan.old_combo);
            }
            return Err(e);
        }
        cfg.clone()
    };

    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok(snapshot)
}

/// Atualiza nome / ícone de um perfil. Campo ausente (`None`) significa "não
/// mexer". Passar `""` em `icon` zera o ícone (vira `None` em disco).
#[tauri::command]
pub fn update_profile<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    profile_id: Uuid,
    name: Option<String>,
    icon: Option<String>,
) -> Result<Config, AppError> {
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        let profile = profile_by_id_mut(&mut cfg, profile_id)?;
        if let Some(n) = name {
            let trimmed = n.trim().to_string();
            if trimmed.is_empty() {
                return Err(AppError::config(
                    "profile_name_empty",
                    &[("profileId", profile_id.to_string())],
                ));
            }
            profile.name = trimmed;
        }
        if let Some(ic) = icon {
            profile.icon = if ic.is_empty() { None } else { Some(ic) };
        }
        save_with_rollback(&mut cfg, &state.config_path)?;
        cfg.clone()
    };
    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok(snapshot)
}

pub fn initial_load(config_path: PathBuf) -> AppResult<AppState> {
    let cfg = load_from_path(&config_path)?;
    Ok(AppState {
        config: RwLock::new(cfg),
        config_path,
        pending_settings_intent: Mutex::new(None),
        active_shortcut: ActiveShortcut::default(),
    })
}

// ---------- helpers ----------

fn active_profile(cfg: &Config) -> AppResult<&Profile> {
    let id = cfg.active_profile_id;
    cfg.profiles.iter().find(|p| p.id == id).ok_or_else(|| {
        AppError::config("active_profile_not_found", &[("profileId", id.to_string())])
    })
}

fn profile_by_id_mut(cfg: &mut Config, id: Uuid) -> AppResult<&mut Profile> {
    cfg.profiles
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or_else(|| AppError::config("profile_not_found", &[("profileId", id.to_string())]))
}

fn save_with_rollback(cfg: &mut Config, path: &Path) -> AppResult<()> {
    if let Err(e) = save_atomic(path, cfg) {
        if let Ok(fresh) = load_from_path(path) {
            *cfg = fresh;
        }
        return Err(e);
    }
    Ok(())
}

fn apply_save_in_profile(profile: &mut Profile, incoming: Tab) {
    if let Some(existing) = profile.tabs.iter_mut().find(|t| t.id == incoming.id) {
        let order = existing.order;
        *existing = Tab { order, ..incoming };
    } else {
        let order = profile.tabs.len() as u32;
        profile.tabs.push(Tab { order, ..incoming });
    }
}

fn apply_delete_in_profile(profile: &mut Profile, id: Uuid) {
    profile.tabs.retain(|t| t.id != id);
    for (i, t) in profile.tabs.iter_mut().enumerate() {
        t.order = i as u32;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::schema::{Item, OpenMode, Tab};
    use uuid::Uuid;

    fn sample_tab(name: &str) -> Tab {
        Tab {
            id: Uuid::new_v4(),
            name: Some(name.into()),
            icon: None,
            order: 0,
            open_mode: OpenMode::ReuseOrNewWindow,
            items: vec![Item::Url {
                value: "https://example.com".into(),
            }],
        }
    }

    #[test]
    fn apply_save_in_profile_appends_new_tab_with_next_order() {
        let mut profile = Profile::default();
        let mut t0 = sample_tab("A");
        t0.order = 0;
        profile.tabs.push(t0);

        let new_tab = sample_tab("B");
        let new_id = new_tab.id;
        apply_save_in_profile(&mut profile, new_tab);

        assert_eq!(profile.tabs.len(), 2);
        assert_eq!(profile.tabs[1].id, new_id);
        assert_eq!(profile.tabs[1].order, 1);
    }

    #[test]
    fn apply_save_in_profile_updates_existing_preserving_order() {
        let mut profile = Profile::default();
        let mut t = sample_tab("A");
        t.order = 3;
        let id = t.id;
        profile.tabs.push(t);

        let mut updated = sample_tab("A-renamed");
        updated.id = id;
        updated.order = 99;
        apply_save_in_profile(&mut profile, updated);

        assert_eq!(profile.tabs.len(), 1);
        assert_eq!(profile.tabs[0].name.as_deref(), Some("A-renamed"));
        assert_eq!(profile.tabs[0].order, 3);
    }

    #[test]
    fn apply_delete_in_profile_renormalizes_order() {
        let mut profile = Profile::default();
        let mut t0 = sample_tab("A");
        t0.order = 0;
        let mut t1 = sample_tab("B");
        t1.order = 1;
        let mut t2 = sample_tab("C");
        t2.order = 2;
        let id1 = t1.id;
        profile.tabs.extend([t0, t1, t2]);

        apply_delete_in_profile(&mut profile, id1);

        assert_eq!(profile.tabs.len(), 2);
        assert_eq!(profile.tabs[0].order, 0);
        assert_eq!(profile.tabs[1].order, 1);
        assert!(profile.tabs.iter().all(|t| t.id != id1));
    }

    #[test]
    fn apply_delete_in_profile_on_missing_id_is_noop() {
        let mut profile = Profile::default();
        profile.tabs.push(sample_tab("A"));
        let before = profile.tabs.len();
        apply_delete_in_profile(&mut profile, Uuid::new_v4());
        assert_eq!(profile.tabs.len(), before);
    }

    #[test]
    fn active_profile_returns_the_correct_one() {
        let cfg = Config::default();
        let p = active_profile(&cfg).unwrap();
        assert_eq!(p.id, cfg.active_profile_id);
    }

    #[test]
    fn active_profile_errors_when_id_missing() {
        let mut cfg = Config::default();
        cfg.active_profile_id = Uuid::new_v4();
        let err = active_profile(&cfg).unwrap_err();
        match err {
            AppError::Config { code, .. } => assert_eq!(code, "active_profile_not_found"),
            other => panic!("expected Config error, got {other:?}"),
        }
    }

    #[test]
    fn profile_by_id_mut_returns_match() {
        let mut cfg = Config::default();
        let id = cfg.profiles[0].id;
        let p = profile_by_id_mut(&mut cfg, id).unwrap();
        assert_eq!(p.id, id);
    }

    #[test]
    fn profile_by_id_mut_errors_when_not_found() {
        let mut cfg = Config::default();
        let err = profile_by_id_mut(&mut cfg, Uuid::new_v4()).unwrap_err();
        match err {
            AppError::Config { code, .. } => assert_eq!(code, "profile_not_found"),
            other => panic!("expected Config error, got {other:?}"),
        }
    }
}
