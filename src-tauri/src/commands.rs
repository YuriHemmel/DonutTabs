use crate::config::io::{load_from_path, save_atomic};
use crate::config::schema::{Config, Tab};
use crate::errors::{AppError, AppResult};
use crate::launcher::{launch_tab, TauriOpener};
use std::path::PathBuf;
use std::sync::RwLock;
use tauri::{Emitter, Manager};
use uuid::Uuid;

pub const CONFIG_CHANGED_EVENT: &str = "config-changed";

pub struct AppState {
    pub config: RwLock<Config>,
    pub config_path: PathBuf,
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
pub fn open_settings<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<(), AppError> {
    crate::settings_window::show(&app)
}

#[tauri::command]
pub fn close_settings<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<(), AppError> {
    crate::settings_window::close(&app)
}

pub fn initial_load(config_path: PathBuf) -> AppResult<AppState> {
    let cfg = load_from_path(&config_path)?;
    Ok(AppState {
        config: RwLock::new(cfg),
        config_path,
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
}
