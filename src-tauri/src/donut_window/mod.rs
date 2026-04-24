use crate::errors::{AppError, AppResult};
use mouse_position::mouse_position::Mouse;
use tauri::{AppHandle, Manager, PhysicalPosition, Runtime, WebviewUrl, WebviewWindowBuilder};

const DONUT_LABEL: &str = "donut";
const DONUT_SIZE: f64 = 420.0;

pub fn show<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(DONUT_LABEL) {
        position_at_cursor(&window)?;
        window
            .show()
            .map_err(|e| AppError::window("window_show_failed", &[("reason", e.to_string())]))?;
        window.set_focus().map_err(|e| {
            AppError::window("window_set_focus_failed", &[("reason", e.to_string())])
        })?;
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(app, DONUT_LABEL, WebviewUrl::App("donut.html".into()))
        .title("DonutTabs")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .inner_size(DONUT_SIZE, DONUT_SIZE)
        .visible(false)
        .shadow(false)
        .build()
        .map_err(|e| AppError::window("window_build_failed", &[("reason", e.to_string())]))?;

    position_at_cursor(&window)?;
    window
        .show()
        .map_err(|e| AppError::window("window_show_failed", &[("reason", e.to_string())]))?;
    window
        .set_focus()
        .map_err(|e| AppError::window("window_set_focus_failed", &[("reason", e.to_string())]))?;
    Ok(())
}

fn position_at_cursor<R: Runtime>(window: &tauri::WebviewWindow<R>) -> AppResult<()> {
    let pos = match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => (x as f64, y as f64),
        Mouse::Error => return Ok(()),
    };

    let scale = window.scale_factor().map_err(|e| {
        AppError::window("window_scale_factor_failed", &[("reason", e.to_string())])
    })?;
    let half = (DONUT_SIZE / 2.0) * scale;
    let x = (pos.0 - half).round() as i32;
    let y = (pos.1 - half).round() as i32;

    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|e| {
            AppError::window("window_set_position_failed", &[("reason", e.to_string())])
        })?;
    Ok(())
}
