use crate::donut_window;
use crate::errors::{AppError, AppResult};
use crate::settings_window;
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

/// Issue #71 — evento emitido para a janela `donut` quando o atalho global
/// é solto e `interaction.quick_mode` está ligado. O frontend do donut
/// decide o que fazer (abre a aba sob o cursor + esconde, ou só esconde).
pub const SHORTCUT_RELEASED_EVENT: &str = "shortcut-released";

/// Estado do atalho global ativo. Vive em `AppState` e é consultado pelo
/// comando `set_shortcut` para fazer o swap conflict-aware (registra o novo
/// antes de desregistrar o antigo).
pub struct ActiveShortcut(pub Mutex<Option<Shortcut>>);

impl Default for ActiveShortcut {
    fn default() -> Self {
        ActiveShortcut(Mutex::new(None))
    }
}

/// Issue #66 — atalho global que abre direto a janela de Settings. Vive em
/// `AppState` junto com `ActiveShortcut` do donut e segue o mesmo padrão
/// conflict-aware via `set_settings_from_config`.
pub struct ActiveSettingsShortcut(pub Mutex<Option<Shortcut>>);

impl Default for ActiveSettingsShortcut {
    fn default() -> Self {
        ActiveSettingsShortcut(Mutex::new(None))
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
        .on_shortcut(*sc, move |_app, _sc, event| match event.state() {
            ShortcutState::Pressed => {
                // Issue #80 — quando o usuário está gravando um atalho no
                // Settings, suprimir o donut. Sem isso a tecla pressionada
                // abriria o donut por cima do form de captura.
                if is_recording(&app_for_handler) {
                    return;
                }
                let _ = donut_window::show(&app_for_handler);
            }
            ShortcutState::Released => {
                // Issue #71 — emitir só quando o usuário optou pelo modo
                // quick_mode. Lê config via AppState; falha em pegar o
                // state (cenário raro de setup parcial) é silenciada — o
                // atalho já funcionou no Pressed, soltar sem efeito é
                // fail-safe.
                if is_recording(&app_for_handler) {
                    return;
                }
                let state: tauri::State<'_, crate::commands::AppState> = app_for_handler.state();
                let quick_mode = state.config.read().unwrap().interaction.quick_mode;
                if quick_mode {
                    let _ = app_for_handler.emit_to("donut", SHORTCUT_RELEASED_EVENT, ());
                }
            }
        })
        .map_err(|e| {
            AppError::shortcut(
                "shortcut_registration_failed",
                &[("combo", format!("{sc:?}")), ("reason", e.to_string())],
            )
        })
}

/// Issue #66 — registra o atalho global que abre Settings. Espelha
/// `register_from_config` (donut) mas com handler que chama
/// `settings_window::show` e sem evento de release (Settings é decorated,
/// não tem comportamento quick_mode).
pub fn register_settings_from_config<R: Runtime>(
    app: &AppHandle<R>,
    active: &ActiveSettingsShortcut,
    shortcut_str: &str,
) -> AppResult<()> {
    let shortcut = parse(shortcut_str)?;
    bind_settings(app, &shortcut)?;
    *active.0.lock().unwrap() = Some(shortcut);
    Ok(())
}

/// Issue #66 — swap conflict-aware do atalho de Settings. Mesma semântica
/// do `set_from_config` (donut): registra o novo antes de desregistrar o
/// antigo, então uma falha não derruba o atalho atual.
pub fn set_settings_from_config<R: Runtime>(
    app: &AppHandle<R>,
    active: &ActiveSettingsShortcut,
    new_combo: &str,
) -> AppResult<()> {
    let new_sc = parse(new_combo)?;
    {
        let slot = active.0.lock().unwrap();
        if slot.as_ref() == Some(&new_sc) {
            return Ok(());
        }
    }
    bind_settings(app, &new_sc)?;
    let mut slot = active.0.lock().unwrap();
    if let Some(old) = slot.take() {
        let _ = app.global_shortcut().unregister(old);
    }
    *slot = Some(new_sc);
    Ok(())
}

fn bind_settings<R: Runtime>(app: &AppHandle<R>, sc: &Shortcut) -> AppResult<()> {
    let app_for_handler = app.clone();
    app.global_shortcut()
        .on_shortcut(*sc, move |_app, _sc, event| {
            if event.state() != ShortcutState::Pressed {
                return;
            }
            // Issue #80 — gate igual ao do donut handler.
            if is_recording(&app_for_handler) {
                return;
            }
            let _ = settings_window::show(&app_for_handler);
        })
        .map_err(|e| {
            AppError::shortcut(
                "shortcut_registration_failed",
                &[("combo", format!("{sc:?}")), ("reason", e.to_string())],
            )
        })
}

fn is_recording<R: Runtime>(app: &AppHandle<R>) -> bool {
    let state: tauri::State<'_, crate::commands::AppState> = app.state();
    state.recording_shortcut.load(Ordering::Relaxed)
}
