//! Plano 18 — wrapper fino sobre `tauri-plugin-updater`. Contém:
//!
//! - `state::UpdateSummary` — payload tipado consumido pelo frontend.
//! - `state::should_notify` — gate puro pra evitar re-notificação da
//!   mesma versão remota.
//! - `check` / `install` — chamadas ao plugin que ficam aqui pra que os
//!   comandos Tauri permaneçam finos (essas funções dependem de `AppHandle`
//!   e portanto não são unit-testáveis sem fixtures Tauri; elas também
//!   chamam helpers puros para a parte testável).
//!
//! Helpers puros (`should_notify`, `UpdateSummary` serde) ficam cobertos
//! por `state::tests`. O caminho de rede do plugin é exercitado em smoke
//! manual conforme `docs/qa-smoke.md`.

pub mod state;

pub use state::{should_notify, UpdateSummary};

use crate::errors::{AppError, AppResult};
use tauri::{AppHandle, Emitter, Runtime};
use tauri_plugin_updater::{Error as PluginError, UpdaterExt};

/// Constante usada pelo frontend pra subscribe via `listen` durante o
/// fluxo de install. Payload é `UpdateProgress` (definido inline).
pub const UPDATE_PROGRESS_EVENT: &str = "update-progress";

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
}

/// Consulta o endpoint configurado e retorna `Some(UpdateSummary)` quando
/// o plugin reporta que há uma versão maior disponível, ou `None` quando
/// o app já está na versão mais recente. Falhas de rede / signature /
/// configuração viram `AppError::Updater`.
pub async fn check<R: Runtime>(handle: &AppHandle<R>) -> AppResult<Option<UpdateSummary>> {
    let updater = handle
        .updater()
        .map_err(|e| AppError::updater("updater_no_endpoints", &[("reason", e.to_string())]))?;

    match updater.check().await {
        Ok(Some(update)) => Ok(Some(UpdateSummary {
            version: update.version.clone(),
            notes: update.body.clone(),
            date: update.date.map(|d| d.to_string()),
        })),
        Ok(None) => Ok(None),
        Err(e) => Err(map_check_error(e)),
    }
}

/// Baixa e instala a atualização atual, emitindo `UPDATE_PROGRESS_EVENT`
/// durante o download. No término do install bem-sucedido o plugin
/// reinicia o app automaticamente — esta função pode nunca retornar.
pub async fn install<R: Runtime>(handle: &AppHandle<R>) -> AppResult<()> {
    let updater = handle
        .updater()
        .map_err(|e| AppError::updater("updater_no_endpoints", &[("reason", e.to_string())]))?;

    let update = updater.check().await.map_err(map_check_error)?;
    let Some(update) = update else {
        return Err(AppError::updater(
            "updater_install_failed",
            &[("reason", "no_pending_update".into())],
        ));
    };

    let emit_handle = handle.clone();
    let download_finished = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
    let dl = download_finished.clone();
    update
        .download_and_install(
            move |chunk_len, content_length| {
                let so_far = dl.fetch_add(chunk_len as u64, std::sync::atomic::Ordering::Relaxed)
                    + chunk_len as u64;
                let _ = emit_handle.emit(
                    UPDATE_PROGRESS_EVENT,
                    UpdateProgress {
                        downloaded: so_far,
                        total: content_length,
                    },
                );
            },
            || {
                // Finished callback — plugin handles relaunch.
            },
        )
        .await
        .map_err(|e| AppError::updater("updater_install_failed", &[("reason", e.to_string())]))?;

    handle.restart();
    #[allow(unreachable_code)]
    Ok(())
}

fn map_check_error(e: PluginError) -> AppError {
    let msg = e.to_string();
    let code = classify_check_error(&e);
    AppError::updater(code, &[("reason", msg)])
}

/// Pure classifier: matches `tauri_plugin_updater::Error` variants directly
/// in vez de fazer substring na mensagem do plugin (frágil quando plugin
/// atualiza wording). `#[non_exhaustive]` no enum força fallback explícito
/// pra qualquer variante futura → `updater_check_failed`.
pub(crate) fn classify_check_error(e: &PluginError) -> &'static str {
    match e {
        PluginError::Minisign(_) | PluginError::SignatureUtf8(_) | PluginError::Base64(_) => {
            "updater_signature_invalid"
        }
        PluginError::EmptyEndpoints => "updater_no_endpoints",
        PluginError::InsecureTransportProtocol => "updater_no_endpoints",
        PluginError::Network(_)
        | PluginError::Reqwest(_)
        | PluginError::UrlParse(_)
        | PluginError::Http(_)
        | PluginError::InvalidHeaderName(_)
        | PluginError::InvalidHeaderValue(_)
        | PluginError::ReleaseNotFound
        | PluginError::TargetNotFound(_)
        | PluginError::TargetsNotFound(_) => "updater_network_unavailable",
        _ => "updater_check_failed",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_endpoints_classified_as_no_endpoints() {
        assert_eq!(
            classify_check_error(&PluginError::EmptyEndpoints),
            "updater_no_endpoints",
        );
    }

    #[test]
    fn insecure_transport_classified_as_no_endpoints() {
        assert_eq!(
            classify_check_error(&PluginError::InsecureTransportProtocol),
            "updater_no_endpoints",
        );
    }

    #[test]
    fn signature_variants_classified_as_signature_invalid() {
        assert_eq!(
            classify_check_error(&PluginError::SignatureUtf8("bad".into())),
            "updater_signature_invalid",
        );
    }

    #[test]
    fn network_variant_classified_as_network_unavailable() {
        assert_eq!(
            classify_check_error(&PluginError::Network("dns".into())),
            "updater_network_unavailable",
        );
    }

    #[test]
    fn release_not_found_classified_as_network_unavailable() {
        assert_eq!(
            classify_check_error(&PluginError::ReleaseNotFound),
            "updater_network_unavailable",
        );
    }

    #[test]
    fn target_not_found_classified_as_network_unavailable() {
        assert_eq!(
            classify_check_error(&PluginError::TargetNotFound("darwin-x86_64".into())),
            "updater_network_unavailable",
        );
    }

    #[test]
    fn unknown_variant_falls_back_to_check_failed() {
        // `UnsupportedArch` não é network nem signature — vira fallback.
        assert_eq!(
            classify_check_error(&PluginError::UnsupportedArch),
            "updater_check_failed",
        );
    }
}
