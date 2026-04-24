use crate::donut_window;
use crate::errors::{AppError, AppResult};
use crate::settings_window;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Runtime,
};

pub fn setup<R: Runtime>(app: &tauri::App<R>) -> AppResult<()> {
    let open = MenuItem::with_id(app, "open_donut", "Abrir donut", true, None::<&str>)
        .map_err(|e| AppError::window("tray_menu_item_failed", &[("reason", e.to_string())]))?;
    let settings = MenuItem::with_id(app, "open_settings", "Configurações", true, None::<&str>)
        .map_err(|e| AppError::window("tray_menu_item_failed", &[("reason", e.to_string())]))?;
    let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)
        .map_err(|e| AppError::window("tray_menu_item_failed", &[("reason", e.to_string())]))?;
    let menu = Menu::with_items(app, &[&open, &settings, &quit])
        .map_err(|e| AppError::window("tray_menu_failed", &[("reason", e.to_string())]))?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("DonutTabs")
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "open_donut" => {
                let _ = donut_window::show(app);
            }
            "open_settings" => {
                let _ = settings_window::show(app);
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)
        .map_err(|e| AppError::window("tray_build_failed", &[("reason", e.to_string())]))?;

    Ok(())
}
