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
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let dir = app
                .path()
                .app_config_dir()
                .map_err(|e| format!("resolver app_config_dir: {e}"))?;
            std::fs::create_dir_all(&dir).ok();
            let config_path = dir.join("config.json");

            let state =
                commands::initial_load(config_path).map_err(|e| format!("carregar config: {e}"))?;
            let shortcut_str = {
                let cfg = state.config.read().unwrap();
                let active_id = cfg.active_profile_id;
                cfg.profiles
                    .iter()
                    .find(|p| p.id == active_id)
                    .map(|p| p.shortcut.clone())
                    .unwrap_or_else(|| "CommandOrControl+Shift+Space".into())
            };
            app.manage(state);

            tray::setup(app).map_err(|e| format!("tray: {e}"))?;

            // Registro do atalho é best-effort. Falha típica (especialmente
            // em dev, depois de um HMR de Rust) é o processo antigo ainda
            // estar segurando o atalho quando o novo sobe. Seguimos em frente
            // — tray e janelas continuam acessíveis.
            {
                let state: tauri::State<'_, commands::AppState> = app.state();
                if let Err(e) = shortcut::register_from_config(
                    app.handle(),
                    &state.active_shortcut,
                    &shortcut_str,
                ) {
                    eprintln!(
                        "[setup] shortcut registration failed ({e:?}); the global shortcut will be unavailable until the app is restarted"
                    );
                }
            }

            // Sincroniza o estado do autostart no SO com o config (best-effort).
            // Falha típica em sandbox (snap/flatpak) — log e segue, sem mudar
            // o config.
            {
                use tauri_plugin_autostart::ManagerExt;
                let cfg = {
                    let state: tauri::State<'_, commands::AppState> = app.state();
                    let snapshot = state.config.read().unwrap().clone();
                    snapshot
                };
                let manager = app.autolaunch();
                let res = if cfg.system.autostart {
                    manager.enable()
                } else {
                    manager.disable()
                };
                if let Err(e) = res {
                    eprintln!("[setup] autostart sync failed ({e:?}); SO state may diverge from config");
                }
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
            commands::set_shortcut,
            commands::set_theme,
            commands::set_language,
            commands::set_active_profile,
            commands::create_profile,
            commands::delete_profile,
            commands::update_profile,
            commands::set_autostart,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
