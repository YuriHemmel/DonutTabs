use crate::errors::{AppError, AppResult};
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

pub const SETTINGS_LABEL: &str = "settings";
const SETTINGS_MIN_SIZE: (f64, f64) = (720.0, 520.0);
const SETTINGS_INITIAL_SIZE: (f64, f64) = (960.0, 640.0);

pub fn show<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        window
            .show()
            .map_err(|e| AppError::window("window_show_failed", &[("reason", e.to_string())]))?;
        window.set_focus().map_err(|e| {
            AppError::window("window_set_focus_failed", &[("reason", e.to_string())])
        })?;
        return Ok(());
    }

    WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App("settings.html".into()))
        .title("DonutTabs — Configurações")
        .inner_size(SETTINGS_INITIAL_SIZE.0, SETTINGS_INITIAL_SIZE.1)
        .min_inner_size(SETTINGS_MIN_SIZE.0, SETTINGS_MIN_SIZE.1)
        .resizable(true)
        .decorations(true)
        .visible(true)
        .build()
        .map_err(|e| AppError::window("window_build_failed", &[("reason", e.to_string())]))?;

    Ok(())
}

pub fn close<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        window
            .close()
            .map_err(|e| AppError::window("window_close_failed", &[("reason", e.to_string())]))?;
    }
    Ok(())
}
