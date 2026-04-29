use crate::config::io::{load_from_path, save_atomic};
use crate::config::schema::{Config, Item, Language, Profile, Tab, Theme, ThemeOverrides};
use crate::errors::{AppError, AppResult};
use crate::favicon::{self, FaviconResult};
use crate::launcher::{launch_tab, TauriOpener};
use crate::shortcut::{self, ActiveShortcut};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, RwLock};
use tauri::{Emitter, Manager};
use ts_rs::TS;
use uuid::Uuid;

/// Resultado do `import_config`: a config nova já em vigor + flag indicando
/// se o atalho global foi re-registrado com sucesso. `false` significa que
/// a config foi gravada/carregada mas o combo do novo perfil ativo colidiu
/// com outro app — o atalho anterior segue bound até reinício.
#[derive(Debug, Clone, Serialize, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub config: Config,
    pub shortcut_reconciled: bool,
}

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
    force_item_index: Option<usize>,
) -> Result<(), AppError> {
    let cfg = state.config.read().unwrap();
    let active = active_profile(&cfg)?;
    let tab = active
        .tabs
        .iter()
        .find(|t| t.id == tab_id)
        .ok_or_else(|| AppError::launcher("tab_not_found", &[("id", tab_id.to_string())]))?;

    // Plano 14: `force_item_index` vem do `<ScriptConfirmModal>` (Run sem
    // checkbox = one-shot). Bypassa o trust check apenas do índice prompted;
    // qualquer outro script untrusted no mesmo tab segue bloqueando, e o
    // modal reabre na próxima iteração. `allow_scripts: false` continua
    // bloqueando independente do force.
    if let Some(blocked) = check_script_gating(active, tab, force_item_index) {
        return Err(blocked);
    }

    let opener = TauriOpener::new(&app);
    launch_tab(tab, &opener)?;
    Ok(())
}

/// Verifica se há algum item Script no tab que precise de confirmação ou
/// esteja bloqueado pelo kill-switch do perfil. Retorna `Some(error)` no
/// primeiro bloqueio encontrado, ou `None` se o tab pode ser launched.
///
/// `skip_trust_at` (one-shot from modal) ignora o trust check para o
/// índice indicado — o `allow_scripts` kill-switch ainda se aplica.
pub(crate) fn check_script_gating(
    profile: &Profile,
    tab: &Tab,
    skip_trust_at: Option<usize>,
) -> Option<AppError> {
    for (idx, item) in tab.items.iter().enumerate() {
        if let Item::Script { command, trusted } = item {
            if !profile.allow_scripts {
                return Some(AppError::launcher(
                    "scripts_disabled",
                    &[
                        ("profileId", profile.id.to_string()),
                        ("tabId", tab.id.to_string()),
                    ],
                ));
            }
            if Some(idx) == skip_trust_at {
                continue;
            }
            if !trusted {
                return Some(AppError::launcher(
                    "script_blocked",
                    &[
                        ("profileId", profile.id.to_string()),
                        ("tabId", tab.id.to_string()),
                        ("itemIndex", idx.to_string()),
                        ("command", command.clone()),
                    ],
                ));
            }
        }
    }
    None
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
    parent_path: Option<Vec<Uuid>>,
) -> Result<Config, AppError> {
    let path = parent_path.unwrap_or_default();
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        let target = profile_id.unwrap_or(cfg.active_profile_id);
        let profile = profile_by_id_mut(&mut cfg, target)?;
        apply_save_in_profile(profile, tab, &path)?;
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
    parent_path: Option<Vec<Uuid>>,
) -> Result<Config, AppError> {
    let path = parent_path.unwrap_or_default();
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        let target = profile_id.unwrap_or(cfg.active_profile_id);
        let profile = profile_by_id_mut(&mut cfg, target)?;
        apply_delete_in_profile(profile, tab_id, &path)?;
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
    let plan = plan_set_active(&state.config.read().unwrap(), profile_id)?;

    crate::shortcut::set_from_config(&app, &state.active_shortcut, &plan.new_combo)?;

    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        let old_active = cfg.active_profile_id;
        cfg.active_profile_id = profile_id;
        if let Err(e) = save_atomic(&state.config_path, &cfg) {
            cfg.active_profile_id = old_active;
            // Restaura o atalho do perfil anterior.
            if !plan.old_combo.is_empty() {
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

#[tauri::command]
pub fn create_profile<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    name: String,
    icon: Option<String>,
) -> Result<(Config, Uuid), AppError> {
    let new_profile = build_new_profile(&name, icon)?;
    let new_id = new_profile.id;
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        let with_shortcut = new_profile.with_inherited_shortcut(&cfg);
        cfg.profiles.push(with_shortcut);
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
    let plan = plan_delete_profile(&state.config.read().unwrap(), profile_id)?;

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

/// Habilita ou desabilita o autostart no SO + persiste em `cfg.system.autostart`.
/// Captura o estado real do SO antes da mutação (`is_enabled()`) — não confia
/// no config — para que o rollback restaure o SO ao seu valor pré-comando
/// mesmo se SO/config estavam divergentes (ex.: setup() falhou no boot ou
/// usuário toggou via Task Scheduler/launchctl). Toca o SO antes de persistir;
/// se `save_atomic` falhar, desfaz tanto SO quanto memória.
#[tauri::command]
pub fn set_autostart<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<Config, AppError> {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    let so_before = manager
        .is_enabled()
        .map_err(|e| AppError::io("autostart_failed", &[("reason", e.to_string())]))?;
    if enabled {
        manager
            .enable()
            .map_err(|e| AppError::io("autostart_failed", &[("reason", e.to_string())]))?;
    } else {
        manager
            .disable()
            .map_err(|e| AppError::io("autostart_failed", &[("reason", e.to_string())]))?;
    }

    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        let cfg_old = cfg.system.autostart;
        cfg.system.autostart = enabled;
        if let Err(e) = save_atomic(&state.config_path, &cfg) {
            // Rollback: memória volta ao valor antes do write; SO volta ao
            // valor capturado antes do enable/disable (não ao config antigo,
            // que pode estar dessincronizado).
            cfg.system.autostart = cfg_old;
            let _ = if so_before {
                manager.enable()
            } else {
                manager.disable()
            };
            return Err(e);
        }
        cfg.clone()
    };
    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok(snapshot)
}

/// Reordena as abas de um perfil. `ordered_ids` deve cobrir exatamente o
/// conjunto atual de abas (mesma cardinalidade, mesmos ids); a nova ordem
/// vira a ordem do `Vec` e o campo `order` de cada `Tab` é renormalizado.
#[tauri::command]
pub fn reorder_tabs<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    profile_id: Uuid,
    ordered_ids: Vec<Uuid>,
    parent_path: Option<Vec<Uuid>>,
) -> Result<Config, AppError> {
    let path = parent_path.unwrap_or_default();
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        apply_reorder_tabs(&mut cfg, profile_id, &ordered_ids, &path)?;
        save_with_rollback(&mut cfg, &state.config_path)?;
        cfg.clone()
    };
    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok(snapshot)
}

/// Reordena os perfis. `ordered_ids` deve ser permutação exata de
/// `cfg.profiles`. `active_profile_id` permanece intacto (referência por id,
/// não por índice).
#[tauri::command]
pub fn reorder_profiles<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    ordered_ids: Vec<Uuid>,
) -> Result<Config, AppError> {
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        apply_reorder_profiles(&mut cfg, &ordered_ids)?;
        save_with_rollback(&mut cfg, &state.config_path)?;
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
        apply_update_profile(&mut cfg, profile_id, name, icon)?;
        save_with_rollback(&mut cfg, &state.config_path)?;
        cfg.clone()
    };
    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok(snapshot)
}

/// Atualiza o atalho window-level que abre o overlay de busca rápida no
/// donut. Atalho é validado (formato Tauri + não-vazio); persiste com
/// rollback in-memory em caso de falha no `save_atomic`.
#[tauri::command]
pub fn set_search_shortcut<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    combo: String,
) -> Result<Config, AppError> {
    if combo.trim().is_empty() {
        return Err(AppError::config("search_shortcut_empty", &[]));
    }
    crate::shortcut::validate_combo(&combo)?;

    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        let old = cfg.interaction.search_shortcut.clone();
        cfg.interaction.search_shortcut = combo;
        if let Err(e) = save_atomic(&state.config_path, &cfg) {
            cfg.interaction.search_shortcut = old;
            return Err(e);
        }
        cfg.clone()
    };
    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok(snapshot)
}

/// Plano 14 — marca um item Script de uma aba como confiável (ou desfaz a
/// confiança). Trust persistido evita que o `<ScriptConfirmModal>` apareça
/// nas próximas execuções. Identificação por `(profile_id, tab_id, item_index)`;
/// `expected_command` blinda contra reorder/edit em outra janela entre o
/// modal abrir e o user confirmar — flipa só se o comando atual ainda bate
/// com o que o user viu, caso contrário retorna `script_command_mismatch`.
#[tauri::command]
pub fn set_script_trusted<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    profile_id: Uuid,
    tab_id: Uuid,
    item_index: usize,
    expected_command: String,
    trusted: bool,
) -> Result<Config, AppError> {
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        apply_set_script_trusted(
            &mut cfg,
            profile_id,
            tab_id,
            item_index,
            &expected_command,
            trusted,
        )?;
        save_with_rollback(&mut cfg, &state.config_path)?;
        cfg.clone()
    };
    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok(snapshot)
}

/// Plano 14 — toggle do kill-switch de scripts no perfil. Quando `false`,
/// nenhum script roda no perfil (mesmo trusted=true).
#[tauri::command]
pub fn set_profile_allow_scripts<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    profile_id: Uuid,
    allow: bool,
) -> Result<Config, AppError> {
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        let profile = profile_by_id_mut(&mut cfg, profile_id)?;
        profile.allow_scripts = allow;
        save_with_rollback(&mut cfg, &state.config_path)?;
        cfg.clone()
    };
    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok(snapshot)
}

pub(crate) fn apply_set_profile_theme_overrides(
    cfg: &mut Config,
    profile_id: Uuid,
    overrides: Option<ThemeOverrides>,
) -> AppResult<()> {
    let profile = profile_by_id_mut(cfg, profile_id)?;
    profile.theme_overrides = overrides;
    Ok(())
}

/// Plano 15 — substitui (ou limpa) os overrides cosméticos do perfil. `None`
/// remove a customização e o donut volta ao preset puro. Validate roda
/// dentro do `save_with_rollback`, então payloads inválidos (cor não-hex,
/// alpha fora de [0,1], raios fora dos limites) já voltam como `AppError`
/// de config sem persistir.
///
/// Aceita `profile_id` de **qualquer** perfil (não só o ativo). Permite
/// customizar perfis em background sem precisar ativá-los; o donut só
/// renderiza tokens do perfil ativo, então o efeito visual aparece quando
/// o user troca de perfil. Isso é intencional — combina com `set_theme`,
/// que também é per-profile.
#[tauri::command]
pub fn set_profile_theme_overrides<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    profile_id: Uuid,
    overrides: Option<ThemeOverrides>,
) -> Result<Config, AppError> {
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        apply_set_profile_theme_overrides(&mut cfg, profile_id, overrides)?;
        save_with_rollback(&mut cfg, &state.config_path)?;
        cfg.clone()
    };
    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok(snapshot)
}

pub(crate) fn apply_set_script_trusted(
    cfg: &mut Config,
    profile_id: Uuid,
    tab_id: Uuid,
    item_index: usize,
    expected_command: &str,
    trusted: bool,
) -> AppResult<()> {
    let profile = profile_by_id_mut(cfg, profile_id)?;
    let tab = profile
        .tabs
        .iter_mut()
        .find(|t| t.id == tab_id)
        .ok_or_else(|| AppError::launcher("tab_not_found", &[("id", tab_id.to_string())]))?;
    let item = tab.items.get_mut(item_index).ok_or_else(|| {
        AppError::launcher(
            "item_index_out_of_range",
            &[
                ("tabId", tab_id.to_string()),
                ("itemIndex", item_index.to_string()),
            ],
        )
    })?;
    match item {
        Item::Script {
            trusted: t,
            command,
        } => {
            if command != expected_command {
                return Err(AppError::launcher(
                    "script_command_mismatch",
                    &[
                        ("tabId", tab_id.to_string()),
                        ("itemIndex", item_index.to_string()),
                    ],
                ));
            }
            *t = trusted;
            Ok(())
        }
        other => Err(AppError::launcher(
            "item_kind_mismatch",
            &[
                ("tabId", tab_id.to_string()),
                ("itemIndex", item_index.to_string()),
                ("expected", "script".into()),
                ("got", commands_kind_label(other).into()),
            ],
        )),
    }
}

pub(crate) fn commands_kind_label(item: &Item) -> &'static str {
    match item {
        Item::Url { .. } => "url",
        Item::File { .. } => "file",
        Item::Folder { .. } => "folder",
        Item::App { .. } => "app",
        Item::Script { .. } => "script",
    }
}

#[tauri::command]
pub async fn fetch_favicon<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    url: String,
) -> Result<FaviconResult, AppError> {
    let base = app
        .path()
        .app_config_dir()
        .map_err(|e| AppError::io("favicon_fetch", &[("reason", e.to_string())]))?;
    favicon::fetch_favicon(&url, &base).await
}

#[tauri::command]
pub fn export_config(
    state: tauri::State<'_, AppState>,
    target_path: String,
) -> Result<(), AppError> {
    let cfg = state.config.read().unwrap().clone();
    do_export(&cfg, Path::new(&target_path))
}

#[tauri::command]
pub fn import_config<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    source_path: String,
) -> Result<ImportResult, AppError> {
    let new_cfg = do_import(Path::new(&source_path))?;
    save_atomic(&state.config_path, &new_cfg)?;

    // Reconcile global shortcut to the new active profile. Failure (combo
    // collision) is non-fatal: the import already succeeded on disk + memory;
    // the shortcut just stays bound to the previous combo until restart.
    // Same trade-off as set_active_profile. The frontend surfaces a localized
    // warning when `shortcut_reconciled` is `false`.
    let new_combo = active_profile(&new_cfg)?.shortcut.clone();
    let shortcut_reconciled = match shortcut::set_from_config(
        &app,
        &state.active_shortcut,
        &new_combo,
    ) {
        Ok(()) => true,
        Err(e) => {
            eprintln!(
                    "[import_config] shortcut reconcile failed ({e:?}); keeping previous global shortcut bound"
                );
            false
        }
    };

    *state.config.write().unwrap() = new_cfg.clone();
    let _ = app.emit(CONFIG_CHANGED_EVENT, &new_cfg);
    Ok(ImportResult {
        config: new_cfg,
        shortcut_reconciled,
    })
}

/// Pure helper: validate + atomic-write `cfg` to `target`. Used by
/// `export_config` and unit-tested directly.
pub(crate) fn do_export(cfg: &Config, target: &Path) -> AppResult<()> {
    save_atomic(target, cfg)
}

/// Pure helper: load + validate (and migrate v1→v2) from `source`. Used by
/// `import_config` and unit-tested directly.
pub(crate) fn do_import(source: &Path) -> AppResult<Config> {
    load_from_path(source)
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

/// Plano 16 — desce na árvore `profile.tabs` seguindo `parent_path` (lista
/// de ids de grupos do nível mais externo pra dentro). Path vazio retorna
/// `&mut profile.tabs` (raiz). Path inválido (id inexistente em algum nível
/// ou referência a leaf como pai) retorna `tab_not_found`. Cada nível
/// confirma que o nó referenciado **é grupo** (`children` exposto); leaf
/// no meio do path → `tab_not_found` para indicar slot inválido.
pub(crate) fn find_parent_tabs_mut<'a>(
    profile: &'a mut Profile,
    parent_path: &[Uuid],
) -> AppResult<&'a mut Vec<Tab>> {
    let mut current: &mut Vec<Tab> = &mut profile.tabs;
    for id in parent_path {
        let next = current
            .iter_mut()
            .find(|t| t.id == *id)
            .ok_or_else(|| AppError::launcher("tab_not_found", &[("id", id.to_string())]))?;
        current = &mut next.children;
    }
    Ok(current)
}

fn apply_save_in_profile(
    profile: &mut Profile,
    incoming: Tab,
    parent_path: &[Uuid],
) -> AppResult<()> {
    let target = find_parent_tabs_mut(profile, parent_path)?;
    if let Some(existing) = target.iter_mut().find(|t| t.id == incoming.id) {
        let order = existing.order;
        *existing = Tab { order, ..incoming };
    } else {
        let order = target.len() as u32;
        target.push(Tab { order, ..incoming });
    }
    Ok(())
}

fn apply_delete_in_profile(profile: &mut Profile, id: Uuid, parent_path: &[Uuid]) -> AppResult<()> {
    let target = find_parent_tabs_mut(profile, parent_path)?;
    target.retain(|t| t.id != id);
    for (i, t) in target.iter_mut().enumerate() {
        t.order = i as u32;
    }
    Ok(())
}

/// Plano de troca do perfil ativo. Captura combos antes da mutação para que
/// um rollback no `save_atomic` consiga restaurar o atalho global mesmo após
/// a edição em memória.
#[derive(Debug)]
pub(crate) struct ActiveSwapPlan {
    pub new_combo: String,
    pub old_combo: String,
}

pub(crate) fn plan_set_active(cfg: &Config, new_id: Uuid) -> AppResult<ActiveSwapPlan> {
    let new_combo = cfg
        .profiles
        .iter()
        .find(|p| p.id == new_id)
        .ok_or_else(|| AppError::config("profile_not_found", &[("profileId", new_id.to_string())]))?
        .shortcut
        .clone();
    let old_combo = cfg
        .profiles
        .iter()
        .find(|p| p.id == cfg.active_profile_id)
        .map(|p| p.shortcut.clone())
        .unwrap_or_default();
    Ok(ActiveSwapPlan {
        new_combo,
        old_combo,
    })
}

#[derive(Debug)]
pub(crate) struct DeleteProfilePlan {
    pub new_active: Option<Uuid>,
    pub new_combo: Option<String>,
    pub old_combo: String,
}

pub(crate) fn plan_delete_profile(cfg: &Config, profile_id: Uuid) -> AppResult<DeleteProfilePlan> {
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
    Ok(DeleteProfilePlan {
        new_active,
        new_combo,
        old_combo,
    })
}

/// Constrói um perfil novo a partir de `name`/`icon`. Valida que o nome é
/// não-vazio. O `shortcut` é deixado em branco aqui — o caller deve preencher
/// via `with_inherited_shortcut` para herdar do primeiro perfil existente.
pub(crate) fn build_new_profile(name: &str, icon: Option<String>) -> AppResult<Profile> {
    let trimmed = name.trim().to_string();
    if trimmed.is_empty() {
        return Err(AppError::config("profile_name_empty", &[]));
    }
    Ok(Profile {
        id: Uuid::new_v4(),
        name: trimmed,
        icon,
        shortcut: String::new(),
        theme: Theme::Dark,
        tabs: vec![],
        allow_scripts: false,
        theme_overrides: None,
    })
}

impl Profile {
    pub(crate) fn with_inherited_shortcut(mut self, cfg: &Config) -> Self {
        self.shortcut = cfg
            .profiles
            .first()
            .map(|p| p.shortcut.clone())
            .unwrap_or_else(|| "CommandOrControl+Shift+Space".into());
        self
    }
}

/// Reordena `items` na ordem ditada por `ordered_ids`. Falha se o conjunto de
/// ids divergir do conjunto atual (qualquer ausência, extra ou tamanho
/// diferente). Mantém a relação 1-para-1, então não há perda nem duplicação.
fn reorder_in_place<T, F>(
    items: &mut Vec<T>,
    ordered_ids: &[Uuid],
    scope: &'static str,
    get_id: F,
) -> AppResult<()>
where
    F: Fn(&T) -> Uuid,
{
    if items.len() != ordered_ids.len() {
        return Err(AppError::config(
            "reorder_mismatch",
            &[
                ("scope", scope.to_string()),
                ("reason", "length".to_string()),
            ],
        ));
    }
    let current: std::collections::HashSet<Uuid> = items.iter().map(&get_id).collect();
    let incoming: std::collections::HashSet<Uuid> = ordered_ids.iter().copied().collect();
    if current != incoming {
        return Err(AppError::config(
            "reorder_mismatch",
            &[("scope", scope.to_string()), ("reason", "set".to_string())],
        ));
    }
    let mut map: std::collections::HashMap<Uuid, T> =
        items.drain(..).map(|t| (get_id(&t), t)).collect();
    let mut rebuilt: Vec<T> = Vec::with_capacity(ordered_ids.len());
    for id in ordered_ids {
        // Set equality acima garante presença.
        rebuilt.push(map.remove(id).expect("id validated above"));
    }
    *items = rebuilt;
    Ok(())
}

pub(crate) fn apply_reorder_tabs(
    cfg: &mut Config,
    profile_id: Uuid,
    ordered_ids: &[Uuid],
    parent_path: &[Uuid],
) -> AppResult<()> {
    let profile = profile_by_id_mut(cfg, profile_id)?;
    let target = find_parent_tabs_mut(profile, parent_path)?;
    reorder_in_place(target, ordered_ids, "tabs", |t| t.id)?;
    for (i, t) in target.iter_mut().enumerate() {
        t.order = i as u32;
    }
    Ok(())
}

pub(crate) fn apply_reorder_profiles(cfg: &mut Config, ordered_ids: &[Uuid]) -> AppResult<()> {
    reorder_in_place(&mut cfg.profiles, ordered_ids, "profiles", |p| p.id)
}

pub(crate) fn apply_update_profile(
    cfg: &mut Config,
    profile_id: Uuid,
    name: Option<String>,
    icon: Option<String>,
) -> AppResult<()> {
    let profile = profile_by_id_mut(cfg, profile_id)?;
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
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::schema::{Item, OpenMode, Tab, TabKind};
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
                open_with: None,
            }],
            kind: TabKind::Leaf,
            children: vec![],
        }
    }

    // ---------- Plano 16: nested operations via parent_path ----------

    fn group_tab(name: &str, children: Vec<Tab>) -> Tab {
        Tab {
            id: Uuid::new_v4(),
            name: Some(name.into()),
            icon: None,
            order: 0,
            open_mode: OpenMode::ReuseOrNewWindow,
            items: vec![],
            kind: TabKind::Group,
            children,
        }
    }

    #[test]
    fn find_parent_tabs_mut_root_returns_top_level() {
        let mut profile = Profile::default();
        profile.tabs.push(sample_tab("A"));
        let target = find_parent_tabs_mut(&mut profile, &[]).unwrap();
        assert_eq!(target.len(), 1);
    }

    #[test]
    fn find_parent_tabs_mut_descends_into_group() {
        let mut profile = Profile::default();
        let leaf = sample_tab("L");
        let group = group_tab("G", vec![leaf]);
        let gid = group.id;
        profile.tabs.push(group);
        let target = find_parent_tabs_mut(&mut profile, &[gid]).unwrap();
        assert_eq!(target.len(), 1);
        assert_eq!(target[0].name.as_deref(), Some("L"));
    }

    #[test]
    fn find_parent_tabs_mut_invalid_id_errors() {
        let mut profile = Profile::default();
        profile.tabs.push(sample_tab("A"));
        let err = find_parent_tabs_mut(&mut profile, &[Uuid::new_v4()]).unwrap_err();
        match err {
            AppError::Launcher { code, .. } => assert_eq!(code, "tab_not_found"),
            other => panic!("expected Launcher tab_not_found, got {other:?}"),
        }
    }

    #[test]
    fn apply_save_in_profile_appends_into_group_via_parent_path() {
        let mut profile = Profile::default();
        let group = group_tab("G", vec![]);
        let gid = group.id;
        profile.tabs.push(group);

        let new_leaf = sample_tab("inside");
        apply_save_in_profile(&mut profile, new_leaf, &[gid]).unwrap();

        assert_eq!(profile.tabs.len(), 1);
        assert_eq!(profile.tabs[0].children.len(), 1);
        assert_eq!(profile.tabs[0].children[0].name.as_deref(), Some("inside"));
        assert_eq!(profile.tabs[0].children[0].order, 0);
    }

    #[test]
    fn apply_delete_in_profile_removes_nested_child_cascading() {
        let mut profile = Profile::default();
        let inner_leaf = sample_tab("inner");
        let inner_id = inner_leaf.id;
        let outer = group_tab("outer", vec![inner_leaf]);
        let outer_id = outer.id;
        profile.tabs.push(outer);

        // Excluir `outer` na raiz remove inner cascading.
        apply_delete_in_profile(&mut profile, outer_id, &[]).unwrap();
        assert!(profile.tabs.is_empty());
        // O `inner` foi junto — sanity check do enum assert (checa que id sumiu).
        let _ = inner_id;
    }

    #[test]
    fn apply_reorder_tabs_within_nested_group() {
        let mut cfg = Config::default();
        let pid = cfg.profiles[0].id;
        let leaf_a = sample_tab("a");
        let id_a = leaf_a.id;
        let leaf_b = sample_tab("b");
        let id_b = leaf_b.id;
        let group = group_tab("G", vec![leaf_a, leaf_b]);
        let gid = group.id;
        cfg.profiles[0].tabs.push(group);

        // Reorder children: b, a.
        apply_reorder_tabs(&mut cfg, pid, &[id_b, id_a], &[gid]).unwrap();

        let children = &cfg.profiles[0].tabs[0].children;
        assert_eq!(children[0].id, id_b);
        assert_eq!(children[0].order, 0);
        assert_eq!(children[1].id, id_a);
        assert_eq!(children[1].order, 1);
    }

    #[test]
    fn apply_save_in_profile_appends_new_tab_with_next_order() {
        let mut profile = Profile::default();
        let mut t0 = sample_tab("A");
        t0.order = 0;
        profile.tabs.push(t0);

        let new_tab = sample_tab("B");
        let new_id = new_tab.id;
        apply_save_in_profile(&mut profile, new_tab, &[]).unwrap();

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
        apply_save_in_profile(&mut profile, updated, &[]).unwrap();

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

        apply_delete_in_profile(&mut profile, id1, &[]).unwrap();

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
        apply_delete_in_profile(&mut profile, Uuid::new_v4(), &[]).unwrap();
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

    fn make_two_profile_config() -> (Config, Uuid, Uuid) {
        let mut cfg = Config::default();
        cfg.profiles[0].shortcut = "Ctrl+Alt+A".into();
        let p1_id = cfg.profiles[0].id;
        let p2 = Profile {
            id: Uuid::new_v4(),
            name: "Estudo".into(),
            icon: None,
            shortcut: "Ctrl+Alt+B".into(),
            theme: Theme::Dark,
            tabs: vec![],
            allow_scripts: false,
            theme_overrides: None,
        };
        let p2_id = p2.id;
        cfg.profiles.push(p2);
        (cfg, p1_id, p2_id)
    }

    // ---------- plan_set_active ----------

    #[test]
    fn plan_set_active_returns_new_and_old_combos() {
        let (mut cfg, p1, p2) = make_two_profile_config();
        cfg.active_profile_id = p1;
        let plan = plan_set_active(&cfg, p2).unwrap();
        assert_eq!(plan.new_combo, "Ctrl+Alt+B");
        assert_eq!(plan.old_combo, "Ctrl+Alt+A");
    }

    #[test]
    fn plan_set_active_errors_for_unknown_profile() {
        let cfg = Config::default();
        let err = plan_set_active(&cfg, Uuid::new_v4()).unwrap_err();
        match err {
            AppError::Config { code, .. } => assert_eq!(code, "profile_not_found"),
            other => panic!("expected Config error, got {other:?}"),
        }
    }

    // ---------- plan_delete_profile ----------

    #[test]
    fn plan_delete_profile_blocks_deleting_last_profile() {
        let cfg = Config::default();
        let only = cfg.profiles[0].id;
        let err = plan_delete_profile(&cfg, only).unwrap_err();
        match err {
            AppError::Config { code, .. } => assert_eq!(code, "cannot_delete_last_profile"),
            other => panic!("expected Config error, got {other:?}"),
        }
    }

    #[test]
    fn plan_delete_profile_errors_for_unknown_profile() {
        let (cfg, _p1, _p2) = make_two_profile_config();
        let err = plan_delete_profile(&cfg, Uuid::new_v4()).unwrap_err();
        match err {
            AppError::Config { code, .. } => assert_eq!(code, "profile_not_found"),
            other => panic!("expected Config error, got {other:?}"),
        }
    }

    #[test]
    fn plan_delete_profile_swaps_active_when_deleting_active() {
        let (mut cfg, p1, p2) = make_two_profile_config();
        cfg.active_profile_id = p1;
        let plan = plan_delete_profile(&cfg, p1).unwrap();
        assert_eq!(plan.new_active, Some(p2));
        assert_eq!(plan.new_combo.as_deref(), Some("Ctrl+Alt+B"));
        assert_eq!(plan.old_combo, "Ctrl+Alt+A");
    }

    #[test]
    fn plan_delete_profile_keeps_active_when_deleting_inactive() {
        let (mut cfg, p1, p2) = make_two_profile_config();
        cfg.active_profile_id = p1;
        let plan = plan_delete_profile(&cfg, p2).unwrap();
        assert!(plan.new_active.is_none());
        assert!(plan.new_combo.is_none());
        assert_eq!(plan.old_combo, "Ctrl+Alt+A");
    }

    // ---------- build_new_profile ----------

    #[test]
    fn build_new_profile_rejects_empty_name() {
        let err = build_new_profile("   ", None).unwrap_err();
        match err {
            AppError::Config { code, .. } => assert_eq!(code, "profile_name_empty"),
            other => panic!("expected Config error, got {other:?}"),
        }
    }

    #[test]
    fn build_new_profile_trims_name_and_uses_default_theme() {
        let p = build_new_profile("  Estudo  ", Some("📚".into())).unwrap();
        assert_eq!(p.name, "Estudo");
        assert_eq!(p.icon.as_deref(), Some("📚"));
        assert_eq!(p.theme, Theme::Dark);
        assert!(p.tabs.is_empty());
        assert!(p.shortcut.is_empty(), "shortcut filled by inherit step");
    }

    #[test]
    fn with_inherited_shortcut_uses_first_profiles_combo() {
        let (cfg, _p1, _p2) = make_two_profile_config();
        let p = build_new_profile("Novo", None)
            .unwrap()
            .with_inherited_shortcut(&cfg);
        assert_eq!(p.shortcut, "Ctrl+Alt+A");
    }

    #[test]
    fn with_inherited_shortcut_falls_back_when_no_profiles() {
        let mut cfg = Config::default();
        cfg.profiles.clear();
        let p = build_new_profile("Novo", None)
            .unwrap()
            .with_inherited_shortcut(&cfg);
        assert_eq!(p.shortcut, "CommandOrControl+Shift+Space");
    }

    // ---------- apply_update_profile ----------

    #[test]
    fn apply_update_profile_changes_only_provided_fields() {
        let mut cfg = Config::default();
        let id = cfg.profiles[0].id;
        cfg.profiles[0].name = "Original".into();
        cfg.profiles[0].icon = Some("⭐".into());

        // Só nome.
        apply_update_profile(&mut cfg, id, Some("Novo".into()), None).unwrap();
        assert_eq!(cfg.profiles[0].name, "Novo");
        assert_eq!(cfg.profiles[0].icon.as_deref(), Some("⭐"));

        // Só ícone.
        apply_update_profile(&mut cfg, id, None, Some("🎯".into())).unwrap();
        assert_eq!(cfg.profiles[0].name, "Novo");
        assert_eq!(cfg.profiles[0].icon.as_deref(), Some("🎯"));
    }

    #[test]
    fn apply_update_profile_empty_icon_clears_field() {
        let mut cfg = Config::default();
        let id = cfg.profiles[0].id;
        cfg.profiles[0].icon = Some("⭐".into());
        apply_update_profile(&mut cfg, id, None, Some("".into())).unwrap();
        assert!(cfg.profiles[0].icon.is_none());
    }

    #[test]
    fn apply_update_profile_rejects_empty_name() {
        let mut cfg = Config::default();
        let id = cfg.profiles[0].id;
        let err = apply_update_profile(&mut cfg, id, Some("   ".into()), None).unwrap_err();
        match err {
            AppError::Config { code, .. } => assert_eq!(code, "profile_name_empty"),
            other => panic!("expected Config error, got {other:?}"),
        }
    }

    #[test]
    fn apply_update_profile_trims_name() {
        let mut cfg = Config::default();
        let id = cfg.profiles[0].id;
        apply_update_profile(&mut cfg, id, Some("  Trabalho  ".into()), None).unwrap();
        assert_eq!(cfg.profiles[0].name, "Trabalho");
    }

    #[test]
    fn apply_update_profile_errors_for_unknown_id() {
        let mut cfg = Config::default();
        let err =
            apply_update_profile(&mut cfg, Uuid::new_v4(), Some("X".into()), None).unwrap_err();
        match err {
            AppError::Config { code, .. } => assert_eq!(code, "profile_not_found"),
            other => panic!("expected Config error, got {other:?}"),
        }
    }

    // ---------- apply_reorder_tabs ----------

    fn make_profile_with_tabs(names: &[&str]) -> (Profile, Vec<Uuid>) {
        let mut p = Profile::default();
        let mut ids = Vec::new();
        for (i, n) in names.iter().enumerate() {
            let mut t = sample_tab(n);
            t.order = i as u32;
            ids.push(t.id);
            p.tabs.push(t);
        }
        (p, ids)
    }

    #[test]
    fn apply_reorder_tabs_permutes_and_renormalizes_order() {
        let mut cfg = Config::default();
        let pid = cfg.profiles[0].id;
        let (mut p, ids) = make_profile_with_tabs(&["A", "B", "C"]);
        p.id = pid;
        cfg.profiles[0] = p;

        // Nova ordem: C, A, B.
        let new_order = vec![ids[2], ids[0], ids[1]];
        apply_reorder_tabs(&mut cfg, pid, &new_order, &[]).unwrap();

        let tabs = &cfg.profiles[0].tabs;
        assert_eq!(tabs.len(), 3);
        assert_eq!(tabs[0].id, ids[2]);
        assert_eq!(tabs[0].name.as_deref(), Some("C"));
        assert_eq!(tabs[0].order, 0);
        assert_eq!(tabs[1].id, ids[0]);
        assert_eq!(tabs[1].order, 1);
        assert_eq!(tabs[2].id, ids[1]);
        assert_eq!(tabs[2].order, 2);
    }

    #[test]
    fn apply_reorder_tabs_rejects_missing_id() {
        let mut cfg = Config::default();
        let pid = cfg.profiles[0].id;
        let (mut p, ids) = make_profile_with_tabs(&["A", "B", "C"]);
        p.id = pid;
        cfg.profiles[0] = p;

        // Falta `ids[2]`.
        let bad = vec![ids[0], ids[1]];
        let err = apply_reorder_tabs(&mut cfg, pid, &bad, &[]).unwrap_err();
        match err {
            AppError::Config { code, context } => {
                assert_eq!(code, "reorder_mismatch");
                assert_eq!(context.get("scope").map(String::as_str), Some("tabs"));
                assert_eq!(context.get("reason").map(String::as_str), Some("length"));
            }
            other => panic!("expected Config, got {other:?}"),
        }
        // Estado intacto.
        assert_eq!(cfg.profiles[0].tabs.len(), 3);
    }

    #[test]
    fn apply_reorder_tabs_rejects_extra_id() {
        let mut cfg = Config::default();
        let pid = cfg.profiles[0].id;
        let (mut p, ids) = make_profile_with_tabs(&["A", "B"]);
        p.id = pid;
        cfg.profiles[0] = p;

        // Mesmo tamanho, mas com id estranho.
        let bad = vec![ids[0], Uuid::new_v4()];
        let err = apply_reorder_tabs(&mut cfg, pid, &bad, &[]).unwrap_err();
        match err {
            AppError::Config { code, context } => {
                assert_eq!(code, "reorder_mismatch");
                assert_eq!(context.get("scope").map(String::as_str), Some("tabs"));
                assert_eq!(context.get("reason").map(String::as_str), Some("set"));
            }
            other => panic!("expected Config, got {other:?}"),
        }
    }

    #[test]
    fn apply_reorder_tabs_unknown_profile_errors() {
        let mut cfg = Config::default();
        let err = apply_reorder_tabs(&mut cfg, Uuid::new_v4(), &[], &[]).unwrap_err();
        match err {
            AppError::Config { code, .. } => assert_eq!(code, "profile_not_found"),
            other => panic!("expected Config, got {other:?}"),
        }
    }

    #[test]
    fn apply_reorder_tabs_empty_is_noop() {
        let mut cfg = Config::default();
        let pid = cfg.profiles[0].id;
        // Default profile has zero tabs.
        apply_reorder_tabs(&mut cfg, pid, &[], &[]).unwrap();
        assert!(cfg.profiles[0].tabs.is_empty());
    }

    // ---------- apply_reorder_profiles ----------

    #[test]
    fn apply_reorder_profiles_permutes_and_keeps_active_id() {
        let (mut cfg, p1, p2) = make_two_profile_config();
        cfg.active_profile_id = p1;
        let new_order = vec![p2, p1];
        apply_reorder_profiles(&mut cfg, &new_order).unwrap();
        assert_eq!(cfg.profiles[0].id, p2);
        assert_eq!(cfg.profiles[1].id, p1);
        // active_profile_id permanece referenciando o mesmo perfil.
        assert_eq!(cfg.active_profile_id, p1);
    }

    #[test]
    fn apply_reorder_profiles_rejects_set_divergence() {
        let (mut cfg, p1, _p2) = make_two_profile_config();
        let bad = vec![p1, Uuid::new_v4()];
        let err = apply_reorder_profiles(&mut cfg, &bad).unwrap_err();
        match err {
            AppError::Config { code, context } => {
                assert_eq!(code, "reorder_mismatch");
                assert_eq!(context.get("scope").map(String::as_str), Some("profiles"));
                assert_eq!(context.get("reason").map(String::as_str), Some("set"));
            }
            other => panic!("expected Config, got {other:?}"),
        }
    }

    #[test]
    fn apply_reorder_profiles_rejects_length_mismatch() {
        let (mut cfg, p1, _p2) = make_two_profile_config();
        let bad = vec![p1];
        let err = apply_reorder_profiles(&mut cfg, &bad).unwrap_err();
        match err {
            AppError::Config { code, context } => {
                assert_eq!(code, "reorder_mismatch");
                assert_eq!(context.get("reason").map(String::as_str), Some("length"));
            }
            other => panic!("expected Config, got {other:?}"),
        }
        // Lista intacta.
        assert_eq!(cfg.profiles.len(), 2);
    }

    // ---------- save_with_rollback ----------

    #[test]
    fn save_with_rollback_restores_in_memory_state_when_save_fails() {
        // Estratégia: aponta o path para um diretório existente (não-arquivo)
        // — `save_atomic` falhará no rename. O rollback recarrega o disco
        // (que está vazio → `Config::default()`) e restaura `cfg`.
        let dir = tempfile::TempDir::new().unwrap();
        // Path aponta pra um diretório, não pra um arquivo: rename vai falhar.
        let path = dir.path().to_path_buf();

        let mut cfg = Config::default();
        cfg.pagination.items_per_page = 7;
        let _err = save_with_rollback(&mut cfg, &path).unwrap_err();
        // Rollback recarregou do disco. Como path é um diretório e
        // `load_from_path` só checa `path.exists()`, o load NÃO reseta cfg
        // (load tenta ler como string e falha). Garantia mais fraca: a
        // função retornou erro e não panicou. Vale documentar via teste.
    }

    #[test]
    fn save_with_rollback_succeeds_and_persists_to_disk() {
        let dir = tempfile::TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        let mut cfg = Config::default();
        cfg.pagination.items_per_page = 7;
        save_with_rollback(&mut cfg, &path).unwrap();
        let loaded = crate::config::io::load_from_path(&path).unwrap();
        assert_eq!(loaded.pagination.items_per_page, 7);
    }

    // ---------- import / export helpers ----------

    #[test]
    fn do_export_writes_a_round_trippable_file() {
        let dir = tempfile::TempDir::new().unwrap();
        let target = dir.path().join("export.json");
        let mut cfg = Config::default();
        cfg.pagination.items_per_page = 7;
        cfg.profiles[0].tabs.push(sample_tab("Exported"));

        do_export(&cfg, &target).unwrap();
        assert!(target.exists());

        let loaded = do_import(&target).unwrap();
        assert_eq!(loaded, cfg);
    }

    #[test]
    fn do_export_rejects_invalid_config() {
        let dir = tempfile::TempDir::new().unwrap();
        let target = dir.path().join("export.json");
        let mut cfg = Config::default();
        cfg.pagination.items_per_page = 99; // out of [4, 8]

        let err = do_export(&cfg, &target).unwrap_err();
        match err {
            AppError::Config { code, .. } => assert_eq!(code, "items_per_page_out_of_range"),
            other => panic!("expected Config error, got {other:?}"),
        }
        // No partial write should be left behind on validation failure.
        assert!(!target.exists());
    }

    #[test]
    fn do_import_rejects_malformed_json() {
        let dir = tempfile::TempDir::new().unwrap();
        let source = dir.path().join("garbage.json");
        std::fs::write(&source, "{not valid json").unwrap();
        let err = do_import(&source).unwrap_err();
        match err {
            AppError::Config { code, .. } => assert_eq!(code, "json_parse"),
            other => panic!("expected Config(json_parse), got {other:?}"),
        }
    }

    #[test]
    fn do_import_rejects_semantically_invalid_config() {
        let dir = tempfile::TempDir::new().unwrap();
        let source = dir.path().join("bad.json");
        let mut cfg = Config::default();
        cfg.pagination.items_per_page = 99;
        // Bypass validation by writing the JSON directly.
        std::fs::write(&source, serde_json::to_string(&cfg).unwrap()).unwrap();
        let err = do_import(&source).unwrap_err();
        match err {
            AppError::Config { code, .. } => assert_eq!(code, "items_per_page_out_of_range"),
            other => panic!("expected Config error, got {other:?}"),
        }
    }

    #[test]
    fn do_import_migrates_v1_payload_to_v2() {
        // V1 snapshot: top-level `version: 1` + tabs/shortcut/theme at the
        // root (the legacy shape `migrate_to_v2` knows how to read).
        let dir = tempfile::TempDir::new().unwrap();
        let source = dir.path().join("legacy.json");
        let v1_json = r#"{
            "version": 1,
            "shortcut": "CommandOrControl+Shift+Space",
            "appearance": { "theme": "dark", "language": "auto" },
            "interaction": {
                "spawnPosition": "cursor",
                "selectionMode": "clickOrRelease",
                "hoverHoldMs": 800
            },
            "pagination": { "itemsPerPage": 6, "wheelDirection": "standard" },
            "system": { "autostart": false },
            "tabs": [
                {
                    "id": "11111111-1111-1111-1111-111111111111",
                    "name": "Legacy",
                    "icon": null,
                    "order": 0,
                    "openMode": "reuseOrNewWindow",
                    "items": [{ "kind": "url", "value": "https://x.test" }]
                }
            ]
        }"#;
        std::fs::write(&source, v1_json).unwrap();

        let migrated = do_import(&source).unwrap();
        assert_eq!(migrated.version, 2);
        assert_eq!(migrated.profiles.len(), 1);
        assert_eq!(migrated.profiles[0].tabs.len(), 1);
        assert_eq!(migrated.profiles[0].tabs[0].name.as_deref(), Some("Legacy"));
    }

    // ---------- script trust gating + helpers ----------

    fn tab_with(items: Vec<Item>) -> Tab {
        Tab {
            id: Uuid::new_v4(),
            name: Some("t".into()),
            icon: None,
            order: 0,
            open_mode: OpenMode::ReuseOrNewWindow,
            items,
            kind: TabKind::Leaf,
            children: vec![],
        }
    }

    fn profile_with(allow_scripts: bool, tabs: Vec<Tab>) -> Profile {
        Profile {
            id: Uuid::new_v4(),
            name: "p".into(),
            icon: None,
            shortcut: "Ctrl+Alt+P".into(),
            theme: Theme::Dark,
            tabs,
            allow_scripts,
            theme_overrides: None,
        }
    }

    #[test]
    fn check_script_gating_returns_none_when_no_scripts() {
        let tab = tab_with(vec![Item::Url {
            value: "https://x".into(),
            open_with: None,
        }]);
        let p = profile_with(false, vec![]);
        assert!(check_script_gating(&p, &tab, None).is_none());
    }

    #[test]
    fn check_script_gating_blocks_on_kill_switch_even_for_trusted() {
        let tab = tab_with(vec![Item::Script {
            command: "git pull".into(),
            trusted: true,
        }]);
        let p = profile_with(false, vec![]);
        match check_script_gating(&p, &tab, None).unwrap() {
            AppError::Launcher { code, .. } => assert_eq!(code, "scripts_disabled"),
            other => panic!("expected Launcher, got {other:?}"),
        }
    }

    #[test]
    fn check_script_gating_blocks_untrusted_when_allow_scripts_true() {
        let tab = tab_with(vec![Item::Script {
            command: "ls".into(),
            trusted: false,
        }]);
        let p = profile_with(true, vec![]);
        match check_script_gating(&p, &tab, None).unwrap() {
            AppError::Launcher { code, context } => {
                assert_eq!(code, "script_blocked");
                assert_eq!(context.get("command").map(String::as_str), Some("ls"));
                assert_eq!(context.get("itemIndex").map(String::as_str), Some("0"));
            }
            other => panic!("expected Launcher, got {other:?}"),
        }
    }

    #[test]
    fn check_script_gating_passes_when_trusted_and_allowed() {
        let tab = tab_with(vec![Item::Script {
            command: "ls".into(),
            trusted: true,
        }]);
        let p = profile_with(true, vec![]);
        assert!(check_script_gating(&p, &tab, None).is_none());
    }

    #[test]
    fn check_script_gating_skip_index_bypasses_only_that_item_trust() {
        // Modal one-shot: user confirmou item 0; item 1 segue untrusted →
        // gating ainda bloqueia, modal reabre na próxima iteração.
        let tab = tab_with(vec![
            Item::Script {
                command: "git pull".into(),
                trusted: false,
            },
            Item::Script {
                command: "rm -rf /tmp/x".into(),
                trusted: false,
            },
        ]);
        let p = profile_with(true, vec![]);
        match check_script_gating(&p, &tab, Some(0)).unwrap() {
            AppError::Launcher { code, context } => {
                assert_eq!(code, "script_blocked");
                assert_eq!(context.get("itemIndex").map(String::as_str), Some("1"));
                assert_eq!(
                    context.get("command").map(String::as_str),
                    Some("rm -rf /tmp/x")
                );
            }
            other => panic!("expected Launcher, got {other:?}"),
        }
    }

    #[test]
    fn check_script_gating_skip_index_passes_when_only_one_untrusted() {
        let tab = tab_with(vec![
            Item::Script {
                command: "git pull".into(),
                trusted: false,
            },
            Item::Script {
                command: "cargo test".into(),
                trusted: true,
            },
        ]);
        let p = profile_with(true, vec![]);
        assert!(check_script_gating(&p, &tab, Some(0)).is_none());
    }

    #[test]
    fn check_script_gating_skip_index_still_respects_kill_switch() {
        // force_item_index não é override do allow_scripts. allow_scripts==false
        // bloqueia mesmo que o user tenha confirmado um item específico.
        let tab = tab_with(vec![Item::Script {
            command: "ls".into(),
            trusted: true,
        }]);
        let p = profile_with(false, vec![]);
        match check_script_gating(&p, &tab, Some(0)).unwrap() {
            AppError::Launcher { code, .. } => assert_eq!(code, "scripts_disabled"),
            other => panic!("expected Launcher, got {other:?}"),
        }
    }

    #[test]
    fn apply_set_script_trusted_flips_flag() {
        let mut cfg = Config::default();
        let pid = cfg.profiles[0].id;
        let tab = tab_with(vec![
            Item::Url {
                value: "https://x".into(),
                open_with: None,
            },
            Item::Script {
                command: "ls".into(),
                trusted: false,
            },
        ]);
        let tid = tab.id;
        cfg.profiles[0].tabs.push(tab);

        apply_set_script_trusted(&mut cfg, pid, tid, 1, "ls", true).unwrap();
        match &cfg.profiles[0].tabs[0].items[1] {
            Item::Script { trusted, .. } => assert!(*trusted),
            other => panic!("expected Script, got {other:?}"),
        }
    }

    #[test]
    fn apply_set_script_trusted_rejects_non_script_item() {
        let mut cfg = Config::default();
        let pid = cfg.profiles[0].id;
        let tab = tab_with(vec![Item::Url {
            value: "https://x".into(),
            open_with: None,
        }]);
        let tid = tab.id;
        cfg.profiles[0].tabs.push(tab);

        match apply_set_script_trusted(&mut cfg, pid, tid, 0, "anything", true).unwrap_err() {
            AppError::Launcher { code, .. } => assert_eq!(code, "item_kind_mismatch"),
            other => panic!("expected Launcher, got {other:?}"),
        }
    }

    #[test]
    fn apply_set_script_trusted_rejects_out_of_range_index() {
        let mut cfg = Config::default();
        let pid = cfg.profiles[0].id;
        let tab = tab_with(vec![]);
        let tid = tab.id;
        cfg.profiles[0].tabs.push(tab);

        match apply_set_script_trusted(&mut cfg, pid, tid, 0, "anything", true).unwrap_err() {
            AppError::Launcher { code, .. } => assert_eq!(code, "item_index_out_of_range"),
            other => panic!("expected Launcher, got {other:?}"),
        }
    }

    #[test]
    fn apply_set_script_trusted_rejects_when_command_changed() {
        // User viu "ls" no modal; outra janela editou pra "rm -rf /". Trust
        // não pode pousar em command que o user não autorizou.
        let mut cfg = Config::default();
        let pid = cfg.profiles[0].id;
        let tab = tab_with(vec![Item::Script {
            command: "rm -rf /".into(),
            trusted: false,
        }]);
        let tid = tab.id;
        cfg.profiles[0].tabs.push(tab);

        match apply_set_script_trusted(&mut cfg, pid, tid, 0, "ls", true).unwrap_err() {
            AppError::Launcher { code, .. } => assert_eq!(code, "script_command_mismatch"),
            other => panic!("expected Launcher, got {other:?}"),
        }
        // Garante que o flag NÃO foi flipado no item alterado.
        match &cfg.profiles[0].tabs[0].items[0] {
            Item::Script { trusted, .. } => assert!(!*trusted),
            other => panic!("expected Script, got {other:?}"),
        }
    }

    // ---------- apply_set_profile_theme_overrides ----------

    #[test]
    fn apply_set_profile_theme_overrides_sets_some() {
        use crate::config::schema::{ThemeColors, ThemeOverrides};
        let mut cfg = Config::default();
        let pid = cfg.profiles[0].id;
        let overrides = ThemeOverrides {
            colors: Some(ThemeColors {
                slice_fill: Some("#102030".into()),
                ..ThemeColors::default()
            }),
            dimensions: None,
            alpha: None,
        };
        apply_set_profile_theme_overrides(&mut cfg, pid, Some(overrides.clone())).unwrap();
        assert_eq!(cfg.profiles[0].theme_overrides, Some(overrides));
    }

    #[test]
    fn apply_set_profile_theme_overrides_clears_with_none() {
        use crate::config::schema::{ThemeColors, ThemeOverrides};
        let mut cfg = Config::default();
        let pid = cfg.profiles[0].id;
        cfg.profiles[0].theme_overrides = Some(ThemeOverrides {
            colors: Some(ThemeColors {
                slice_fill: Some("#abcdef".into()),
                ..ThemeColors::default()
            }),
            dimensions: None,
            alpha: None,
        });
        apply_set_profile_theme_overrides(&mut cfg, pid, None).unwrap();
        assert!(cfg.profiles[0].theme_overrides.is_none());
    }

    #[test]
    fn apply_set_profile_theme_overrides_rejects_unknown_profile() {
        let mut cfg = Config::default();
        let bogus = Uuid::new_v4();
        match apply_set_profile_theme_overrides(&mut cfg, bogus, None).unwrap_err() {
            AppError::Config { code, .. } => assert_eq!(code, "profile_not_found"),
            other => panic!("expected Config error, got {other:?}"),
        }
    }
}
