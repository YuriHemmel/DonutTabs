use crate::config::{schema::Config, io::load_from_path};
use crate::errors::{AppError, AppResult};
use crate::launcher::{launch_tab, TauriOpener};
use std::path::PathBuf;
use std::sync::RwLock;
use tauri::Manager;
use uuid::Uuid;

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
    let tab = cfg.tabs.iter().find(|t| t.id == tab_id)
        .ok_or_else(|| AppError::Launcher(format!("tab {} não encontrada", tab_id)))?;
    let opener = TauriOpener::new(&app);
    launch_tab(tab, &opener)?;
    Ok(())
}

#[tauri::command]
pub fn hide_donut<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("donut") {
        window.hide().map_err(|e| AppError::Window(e.to_string()))?;
    }
    Ok(())
}

pub fn initial_load(config_path: PathBuf) -> AppResult<AppState> {
    let cfg = load_from_path(&config_path)?;
    Ok(AppState {
        config: RwLock::new(cfg),
        config_path,
    })
}
