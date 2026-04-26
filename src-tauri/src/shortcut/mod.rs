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
///
/// Caso especial: se o novo combo for o mesmo já registrado (caso comum
/// quando perfis herdam atalho do criador), pular o re-bind — o plugin
/// recusa registrar duas vezes a mesma combinação.
pub fn set_from_config<R: Runtime>(
    app: &AppHandle<R>,
    active: &ActiveShortcut,
    new_combo: &str,
) -> AppResult<()> {
    let new_sc = parse(new_combo)?;
    {
        let slot = active.0.lock().unwrap();
        if slot.as_ref() == Some(&new_sc) {
            // Mesmo combo já registrado — handler global continua válido.
            return Ok(());
        }
    }
    bind(app, &new_sc)?;
    let mut slot = active.0.lock().unwrap();
    if let Some(old) = slot.take() {
        let _ = app.global_shortcut().unregister(old);
    }
    *slot = Some(new_sc);
    Ok(())
}

/// Valida um combo sem registrar nada. Usado pelo `set_shortcut` quando o
/// alvo é um perfil **inativo** — não tocamos o atalho global, mas precisamos
/// rejeitar entradas malformadas antes de gravar em disco.
pub fn validate_combo(combo: &str) -> AppResult<()> {
    parse(combo).map(|_| ())
}

fn parse(combo: &str) -> AppResult<Shortcut> {
    combo.parse::<Shortcut>().map_err(|e| {
        AppError::shortcut(
            "shortcut_parse_failed",
            &[("combo", combo.to_string()), ("reason", format!("{e}"))],
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_combo_accepts_valid_combo() {
        assert!(validate_combo("CommandOrControl+Shift+Space").is_ok());
        assert!(validate_combo("Ctrl+Alt+P").is_ok());
    }

    #[test]
    fn validate_combo_rejects_garbage() {
        let err = validate_combo("not a real combo").unwrap_err();
        match err {
            AppError::Shortcut { code, .. } => assert_eq!(code, "shortcut_parse_failed"),
            other => panic!("expected Shortcut error, got {other:?}"),
        }
    }

    #[test]
    fn validate_combo_rejects_empty_string() {
        assert!(validate_combo("").is_err());
    }
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
