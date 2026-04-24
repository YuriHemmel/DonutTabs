use crate::donut_window;
use crate::errors::{AppError, AppResult};
use std::sync::Mutex;
use tauri::{AppHandle, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Estado do atalho global ativo. Vive em `AppState` e é consultado pelo
/// comando `set_shortcut` para fazer o swap conflict-aware (registra o novo
/// antes de desregistrar o antigo).
pub struct ActiveShortcut(pub Mutex<Option<Shortcut>>);

impl Default for ActiveShortcut {
    fn default() -> Self {
        ActiveShortcut(Mutex::new(None))
    }
}

/// Registra o atalho lido da config no boot. Em caso de conflito, o chamador
/// decide o que fazer (o `setup()` loga e continua, por exemplo).
pub fn register_from_config<R: Runtime>(
    app: &AppHandle<R>,
    active: &ActiveShortcut,
    shortcut_str: &str,
) -> AppResult<()> {
    let shortcut = parse(shortcut_str)?;
    bind(app, &shortcut)?;
    *active.0.lock().unwrap() = Some(shortcut);
    Ok(())
}

/// Troca o atalho ativo. A ordem é proposital: registra o novo antes de
/// largar o atual. Se o novo falhar (combo em uso por outro app), o atual
/// permanece em vigor — ao usuário vemos um erro traduzido, mas o atalho
/// dele continua funcionando.
pub fn set_from_config<R: Runtime>(
    app: &AppHandle<R>,
    active: &ActiveShortcut,
    new_combo: &str,
) -> AppResult<()> {
    let new_sc = parse(new_combo)?;
    bind(app, &new_sc)?;
    let mut slot = active.0.lock().unwrap();
    if let Some(old) = slot.take() {
        let _ = app.global_shortcut().unregister(old);
    }
    *slot = Some(new_sc);
    Ok(())
}

fn parse(combo: &str) -> AppResult<Shortcut> {
    combo.parse::<Shortcut>().map_err(|e| {
        AppError::shortcut(
            "shortcut_parse_failed",
            &[("combo", combo.to_string()), ("reason", format!("{e}"))],
        )
    })
}

fn bind<R: Runtime>(app: &AppHandle<R>, sc: &Shortcut) -> AppResult<()> {
    let app_for_handler = app.clone();
    app.global_shortcut()
        .on_shortcut(*sc, move |_app, _sc, event| {
            if event.state() == ShortcutState::Pressed {
                let _ = donut_window::show(&app_for_handler);
            }
        })
        .map_err(|e| {
            AppError::shortcut(
                "shortcut_registration_failed",
                &[("combo", format!("{sc:?}")), ("reason", e.to_string())],
            )
        })
}
