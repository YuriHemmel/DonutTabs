mod apps_picker;
mod commands;
mod config;
mod donut_window;
mod errors;
mod favicon;
mod launcher;
mod script_history;
mod settings_window;
mod shortcut;
mod tray;
mod updater;

use tauri::Manager;
use tauri_plugin_notification::NotificationExt;

async fn run_startup_update_check<R: tauri::Runtime>(handle: tauri::AppHandle<R>) {
    let summary = match updater::check(&handle).await {
        Ok(Some(s)) => s,
        Ok(None) => {
            let state: tauri::State<'_, commands::AppState> = handle.state();
            *state.pending_update.write().unwrap() = None;
            return;
        }
        Err(e) => {
            eprintln!("[startup-updater] check failed: {e:?}");
            return;
        }
    };

    {
        let state: tauri::State<'_, commands::AppState> = handle.state();
        *state.pending_update.write().unwrap() = Some(summary.clone());
    }

    // Tray entry reflete `pending_update` independente do gate de notificação.
    // Notificação OS-native é one-shot por versão (gate `should_notify`); tray
    // entry persiste enquanto a versão remota seguir disponível, pra que user
    // que fechou a notificação ainda tenha caminho visível pra atualizar.
    if let Err(e) = tray::rebuild_with_pending_update(&handle, Some(&summary)) {
        eprintln!("[startup-updater] tray rebuild failed: {e:?}");
    }

    let last = {
        let state: tauri::State<'_, commands::AppState> = handle.state();
        let cfg = state.config.read().unwrap();
        cfg.system.last_notified_update_version.clone()
    };

    if !updater::should_notify(&summary.version, last.as_deref()) {
        return;
    }

    let title = "DonutTabs: atualização disponível";
    let body = format!(
        "Versão {} está pronta. Abra o DonutTabs para instalar.",
        summary.version
    );
    if let Err(e) = handle
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show()
    {
        eprintln!("[startup-updater] notification failed: {e:?}");
    }

    {
        let state: tauri::State<'_, commands::AppState> = handle.state();
        let mut cfg = state.config.write().unwrap();
        commands::apply_mark_update_notified(&mut cfg, summary.version.clone());
        let path = state.config_path.clone();
        if let Err(e) = crate::config::io::save_atomic(&path, &cfg) {
            eprintln!("[startup-updater] persist last_notified_update_version failed: {e:?}");
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
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
            // Apenas garante o `enable()` quando `cfg.system.autostart == true`
            // E o SO ainda não está habilitado — evita brigar com toggles
            // manuais (Task Scheduler / launchctl). Quando o config diz `false`
            // não fazemos `disable()` proativo: a única forma de o app desligar
            // o autostart é via comando `set_autostart` explícito.
            // Falha típica em sandbox (snap/flatpak) — log e segue.
            {
                use tauri_plugin_autostart::ManagerExt;
                let cfg = {
                    let state: tauri::State<'_, commands::AppState> = app.state();
                    let snapshot = state.config.read().unwrap().clone();
                    snapshot
                };
                if cfg.system.autostart {
                    let manager = app.autolaunch();
                    match manager.is_enabled() {
                        Ok(true) => {}
                        Ok(false) => {
                            if let Err(e) = manager.enable() {
                                eprintln!(
                                    "[setup] autostart enable failed ({e:?}); config says on but SO state stays off"
                                );
                            }
                        }
                        Err(e) => eprintln!(
                            "[setup] autostart is_enabled query failed ({e:?}); skipping reconcile"
                        ),
                    }
                }
            }

            // Plano 18 — startup update check. Best-effort: erros (offline,
            // signature inválida, sem endpoints configurados) viram warn no
            // log e não interrompem o boot. Roda em task assíncrona para
            // não bloquear a UI; OS notification dispara via plugin
            // `notification` apenas uma vez por versão remota nova
            // (gate `should_notify` contra `last_notified_update_version`).
            {
                let auto = {
                    let state: tauri::State<'_, commands::AppState> = app.state();
                    let cfg = state.config.read().unwrap();
                    cfg.system.auto_check_updates
                };
                if auto {
                    let handle = app.handle().clone();
                    tauri::async_runtime::spawn(async move {
                        run_startup_update_check(handle).await;
                    });
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
            commands::reorder_tabs,
            commands::reorder_profiles,
            commands::fetch_favicon,
            commands::export_config,
            commands::import_config,
            commands::set_search_shortcut,
            commands::set_script_trusted,
            commands::set_profile_allow_scripts,
            commands::set_profile_theme_overrides,
            commands::list_installed_apps,
            commands::check_for_updates,
            commands::install_update,
            commands::set_auto_check_updates,
            commands::get_pending_update,
            commands::list_script_runs,
            commands::get_script_run,
            commands::clear_script_runs,
            commands::cancel_script_run,
            commands::set_script_history_enabled,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
