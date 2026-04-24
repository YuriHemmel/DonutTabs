mod commands;
mod config;
mod donut_window;
mod errors;
mod launcher;
mod settings_window;
mod shortcut;
mod tray;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app
                .path()
                .app_config_dir()
                .map_err(|e| format!("resolver app_config_dir: {e}"))?;
            std::fs::create_dir_all(&dir).ok();
            let config_path = dir.join("config.json");

            let state =
                commands::initial_load(config_path).map_err(|e| format!("carregar config: {e}"))?;
            let shortcut_str = state.config.read().unwrap().shortcut.clone();
            app.manage(state);

            tray::setup(app).map_err(|e| format!("tray: {e}"))?;

            shortcut::register_from_config(app.handle(), &shortcut_str)
                .map_err(|e| format!("shortcut: {e}"))?;

            let _ = donut_window::show(app.handle());
            if let Some(w) = app.get_webview_window("donut") {
                let _ = w.hide();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::open_tab,
            commands::hide_donut,
            commands::save_tab,
            commands::delete_tab,
            commands::open_settings,
            commands::close_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
