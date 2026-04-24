use crate::errors::{AppError, AppResult};
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

pub const SETTINGS_LABEL: &str = "settings";
const SETTINGS_MIN_SIZE: (f64, f64) = (720.0, 520.0);
const SETTINGS_INITIAL_SIZE: (f64, f64) = (960.0, 640.0);

/// Cria a janela Settings oculta. Deve ser chamada no `setup()` do Tauri.
///
/// Contexto: no Windows, `WebviewWindowBuilder::build()` para uma janela
/// decorada normal trava silenciosamente quando invocado de um `#[tauri::command]`
/// (thread do runtime async) *ou* de `run_on_main_thread` em tempo de execução.
/// Criar a janela durante o `setup()` — quando o Tauri ainda está
/// inicializando o loop nativo — funciona consistentemente. A janela fica
/// oculta até o usuário abrir via tray ou engrenagem do donut.
pub fn prewarm<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    if app.get_webview_window(SETTINGS_LABEL).is_some() {
        return Ok(());
    }
    WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App("settings.html".into()))
        .title("DonutTabs — Configurações")
        .inner_size(SETTINGS_INITIAL_SIZE.0, SETTINGS_INITIAL_SIZE.1)
        .min_inner_size(SETTINGS_MIN_SIZE.0, SETTINGS_MIN_SIZE.1)
        .resizable(true)
        .decorations(true)
        .visible(false)
        .build()
        .map_err(|e| AppError::window("window_build_failed", &[("reason", e.to_string())]))?;
    Ok(())
}

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

    // A janela deveria ter sido pré-aquecida no setup. Fallback: tenta criar
    // agora na main thread. Em alguns ambientes Windows isso trava, mas é
    // melhor do que falhar silenciosamente quando o pré-aquecimento não rodou.
    let app_clone = app.clone();
    app.run_on_main_thread(move || {
        let _ = prewarm(&app_clone);
        if let Some(window) = app_clone.get_webview_window(SETTINGS_LABEL) {
            let _ = window.show();
            let _ = window.set_focus();
        }
    })
    .map_err(|e| AppError::window("run_on_main_thread_failed", &[("reason", e.to_string())]))?;
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
