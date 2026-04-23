use crate::donut_window;
use crate::errors::{AppError, AppResult};
use tauri::{AppHandle, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub fn register_from_config<R: Runtime>(
    app: &AppHandle<R>,
    shortcut_str: &str,
) -> AppResult<()> {
    let shortcut: Shortcut = shortcut_str.parse()
        .map_err(|e| AppError::Shortcut(format!("{e}")))?;

    let app_for_handler = app.clone();
    let target = shortcut.clone();

    app.global_shortcut().on_shortcut(target, move |_app, _sc, event| {
        if event.state() == ShortcutState::Pressed {
            let _ = donut_window::show(&app_for_handler);
        }
    }).map_err(|e| AppError::Shortcut(e.to_string()))?;

    Ok(())
}
