use crate::config::io::{load_from_path, save_atomic};
use crate::config::schema::{Config, Language, Tab, Theme};
use crate::errors::{AppError, AppResult};
use crate::launcher::{launch_tab, TauriOpener};
use crate::shortcut::ActiveShortcut;
use std::path::PathBuf;
use std::sync::{Mutex, RwLock};
use tauri::{Emitter, Manager};
use uuid::Uuid;

pub const CONFIG_CHANGED_EVENT: &str = "config-changed";
pub const SETTINGS_INTENT_EVENT: &str = "settings-intent";

pub struct AppState {
    pub config: RwLock<Config>,
    pub config_path: PathBuf,
    /// Intent a ser consumido pela Settings na próxima montagem. Serve de
    /// buffer para o caso em que a Settings ainda está carregando quando o
    /// comando `open_settings` é invocado (evento de listen ainda não
    /// registrado).
    pub pending_settings_intent: Mutex<Option<String>>,
    /// Atalho global atualmente registrado. Permite ao comando `set_shortcut`
    /// fazer swap conflict-aware (registra o novo antes de largar o antigo).
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
    let tab = cfg
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
) -> Result<Config, AppError> {
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        apply_save(&mut cfg, tab);
        if let Err(e) = save_atomic(&state.config_path, &cfg) {
            // Recarrega do disco para que a memória reflita o último estado bom.
            if let Ok(fresh) = load_from_path(&state.config_path) {
                *cfg = fresh;
            }
            return Err(e);
        }
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
) -> Result<Config, AppError> {
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        apply_delete(&mut cfg, tab_id);
        if let Err(e) = save_atomic(&state.config_path, &cfg) {
            if let Ok(fresh) = load_from_path(&state.config_path) {
                *cfg = fresh;
            }
            return Err(e);
        }
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
        // Emite para quem já está escutando (janela reaberta). O
        // `consume_settings_intent` abaixo cobre o caso em que a Settings
        // ainda não tinha listener no momento do emit.
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

#[tauri::command]
pub fn set_shortcut<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    combo: String,
) -> Result<Config, AppError> {
    // 1. Registra o novo antes de largar o antigo. Se falhar aqui, o atalho
    //    atual permanece em vigor e o erro propaga intacto para o frontend.
    crate::shortcut::set_from_config(&app, &state.active_shortcut, &combo)?;

    // 2. Persiste. Se o disco falhar, precisamos desfazer o registro (voltar
    //    ao antigo) para manter a coerência memória-disco-atalho.
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        let old_combo = cfg.shortcut.clone();
        cfg.shortcut = combo;
        if let Err(e) = save_atomic(&state.config_path, &cfg) {
            let _ = crate::shortcut::set_from_config(&app, &state.active_shortcut, &old_combo);
            cfg.shortcut = old_combo;
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
) -> Result<Config, AppError> {
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        apply_theme(&mut cfg, theme);
        if let Err(e) = save_atomic(&state.config_path, &cfg) {
            if let Ok(fresh) = load_from_path(&state.config_path) {
                *cfg = fresh;
            }
            return Err(e);
        }
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
        apply_language(&mut cfg, language);
        if let Err(e) = save_atomic(&state.config_path, &cfg) {
            if let Ok(fresh) = load_from_path(&state.config_path) {
                *cfg = fresh;
            }
            return Err(e);
        }
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

fn apply_save(cfg: &mut Config, incoming: Tab) {
    if let Some(existing) = cfg.tabs.iter_mut().find(|t| t.id == incoming.id) {
        let order = existing.order;
        *existing = Tab { order, ..incoming };
    } else {
        let order = cfg.tabs.len() as u32;
        cfg.tabs.push(Tab { order, ..incoming });
    }
}

fn apply_delete(cfg: &mut Config, id: Uuid) {
    cfg.tabs.retain(|t| t.id != id);
    for (i, t) in cfg.tabs.iter_mut().enumerate() {
        t.order = i as u32;
    }
}

fn apply_theme(cfg: &mut Config, theme: Theme) {
    cfg.appearance.theme = theme;
}

fn apply_language(cfg: &mut Config, language: Language) {
    cfg.appearance.language = language;
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
    fn apply_save_appends_new_tab_with_next_order() {
        let mut cfg = Config::default();
        let mut t0 = sample_tab("A");
        t0.order = 0;
        cfg.tabs.push(t0);

        let new_tab = sample_tab("B");
        let new_id = new_tab.id;
        apply_save(&mut cfg, new_tab);

        assert_eq!(cfg.tabs.len(), 2);
        assert_eq!(cfg.tabs[1].id, new_id);
        assert_eq!(cfg.tabs[1].order, 1);
    }

    #[test]
    fn apply_save_updates_existing_tab_preserving_order() {
        let mut cfg = Config::default();
        let mut t = sample_tab("A");
        t.order = 3;
        let id = t.id;
        cfg.tabs.push(t);

        let mut updated = sample_tab("A-renamed");
        updated.id = id;
        updated.order = 99; // deve ser ignorado
        apply_save(&mut cfg, updated);

        assert_eq!(cfg.tabs.len(), 1);
        assert_eq!(cfg.tabs[0].name.as_deref(), Some("A-renamed"));
        assert_eq!(cfg.tabs[0].order, 3);
    }

    #[test]
    fn apply_delete_removes_and_renormalizes_order() {
        let mut cfg = Config::default();
        let mut t0 = sample_tab("A");
        t0.order = 0;
        let mut t1 = sample_tab("B");
        t1.order = 1;
        let mut t2 = sample_tab("C");
        t2.order = 2;
        let id1 = t1.id;
        cfg.tabs.push(t0);
        cfg.tabs.push(t1);
        cfg.tabs.push(t2);

        apply_delete(&mut cfg, id1);

        assert_eq!(cfg.tabs.len(), 2);
        assert_eq!(cfg.tabs[0].order, 0);
        assert_eq!(cfg.tabs[1].order, 1);
        assert!(cfg.tabs.iter().all(|t| t.id != id1));
    }

    #[test]
    fn apply_delete_on_missing_id_is_noop() {
        let mut cfg = Config::default();
        cfg.tabs.push(sample_tab("A"));
        let before = cfg.tabs.len();

        apply_delete(&mut cfg, Uuid::new_v4());

        assert_eq!(cfg.tabs.len(), before);
    }

    #[test]
    fn apply_theme_updates_appearance() {
        let mut cfg = Config::default();
        apply_theme(&mut cfg, Theme::Light);
        assert_eq!(cfg.appearance.theme, Theme::Light);
        apply_theme(&mut cfg, Theme::Auto);
        assert_eq!(cfg.appearance.theme, Theme::Auto);
    }

    #[test]
    fn apply_language_updates_appearance() {
        let mut cfg = Config::default();
        apply_language(&mut cfg, Language::En);
        assert_eq!(cfg.appearance.language, Language::En);
        apply_language(&mut cfg, Language::PtBr);
        assert_eq!(cfg.appearance.language, Language::PtBr);
    }
}
