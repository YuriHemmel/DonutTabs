use crate::donut_window;
use crate::errors::{AppError, AppResult};
use tauri::{AppHandle, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub fn register_from_config<R: Runtime>(app: &AppHandle<R>, shortcut_str: &str) -> AppResult<()> {
    let shortcut: Shortcut = shortcut_str.parse().map_err(|e| {
        AppError::shortcut(
            "shortcut_parse_failed",
            &[
                ("combo", shortcut_str.to_string()),
                ("reason", format!("{e}")),
            ],
        )
    })?;

    let app_for_handler = app.clone();

    app.global_shortcut()
        .on_shortcut(shortcut, move |_app, _sc, event| {
            if event.state() == ShortcutState::Pressed {
                let _ = donut_window::show(&app_for_handler);
            }
        })
        .map_err(|e| {
            AppError::shortcut(
                "shortcut_registration_failed",
                &[
                    ("combo", shortcut_str.to_string()),
                    ("reason", e.to_string()),
                ],
            )
        })?;

    Ok(())
}
