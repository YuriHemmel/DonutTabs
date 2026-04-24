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

            // Registro do atalho é best-effort. Falha típica (especialmente
            // em dev, depois de um HMR de Rust) é o processo antigo ainda
            // estar segurando o atalho quando o novo sobe. Seguimos em frente
            // — tray e janelas continuam acessíveis.
            if let Err(e) = shortcut::register_from_config(app.handle(), &shortcut_str) {
                eprintln!(
                    "[setup] shortcut registration failed ({e:?}); the global shortcut will be unavailable until the app is restarted"
                );
            }

            let _ = donut_window::show(app.handle());
            if let Some(w) = app.get_webview_window("donut") {
                let _ = w.hide();
            }

            // Pré-aquece a janela Settings oculta. Criar janelas a partir de
            // comandos tardiamente trava o build do WebView2 em alguns
            // ambientes Windows; criar durante o setup garante inicialização
            // limpa e abertura instantânea depois. Falha aqui é recuperável
            // via fallback em `settings_window::show`.
            if let Err(e) = settings_window::prewarm(app.handle()) {
                eprintln!(
                    "[setup] settings window prewarm failed ({e:?}); first open may be slower"
                );
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
            commands::consume_settings_intent,
            commands::close_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
