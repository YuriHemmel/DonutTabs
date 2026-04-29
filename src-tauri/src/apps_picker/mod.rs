//! Plano 17 — picker visual de apps instalados.
//!
//! Cada SO tem um ramo `#[cfg(target_os = "...")]` que enumera apps via
//! convenção do SO:
//! - macOS: `/Applications/*.app` + `~/Applications/*.app`
//! - Linux: `.desktop` files em `$XDG_DATA_DIRS/applications/`
//! - Windows: registry `App Paths` (HKLM+HKCU) + Start Menu `.lnk` stems
//!
//! `InstalledApp.name` é o que o user passaria pro launcher (`Item::App.name`).
//! O picker é só assistência de digitação — schema do `Item::App` segue intocado.

use crate::errors::AppResult;
#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
use crate::errors::AppError;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

// Plano 17 — submódulos sempre compilam (helpers puros são
// platform-independent e podem ser testados em qualquer SO no CI). A
// façade `list_installed_apps` decide qual ramo invocar via `cfg(target_os)`.
pub mod linux;
pub mod macos;
pub mod windows;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    /// Nome amigável que o usuário copia/seleciona pra `Item::App.name`.
    /// macOS: stem do `.app` bundle (`"Firefox"`).
    /// Linux: `Name=` do `.desktop`.
    /// Windows: stem do exe (App Paths) ou do `.lnk` (Start Menu).
    pub name: String,
    /// Caminho absoluto do binário/bundle/lnk. Informacional — não é usado
    /// pelo launcher (que invoca `name`), mas ajuda picker a desambiguar
    /// duplicatas e mostrar tooltip futuro.
    pub path: String,
}

/// Façade — delega ao ramo do SO correspondente. Todo erro de IO/registry
/// vira `AppError::io("apps_list_failed", { reason })` no nível do command.
pub fn list_installed_apps() -> AppResult<Vec<InstalledApp>> {
    #[cfg(target_os = "macos")]
    {
        macos::list_macos_apps()
    }
    #[cfg(target_os = "linux")]
    {
        linux::list_linux_apps()
    }
    #[cfg(target_os = "windows")]
    {
        windows::list_windows_apps_combined()
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Err(AppError::io(
            "apps_list_failed",
            &[("reason", "unsupported os".to_string())],
        ))
    }
}

/// Helper compartilhado: dedupe por `name` case-insensitive (preserva primeiro
/// inserido) e ordena alfabeticamente por `name` lower-case.
pub(crate) fn dedupe_and_sort(mut apps: Vec<InstalledApp>) -> Vec<InstalledApp> {
    let mut seen = std::collections::HashSet::new();
    apps.retain(|a| seen.insert(a.name.to_lowercase()));
    apps.sort_by_key(|a| a.name.to_lowercase());
    apps
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn installed_app_round_trips() {
        let app = InstalledApp {
            name: "Firefox".into(),
            path: "/Applications/Firefox.app".into(),
        };
        let json = serde_json::to_string(&app).unwrap();
        assert!(json.contains("\"name\":\"Firefox\""));
        assert!(json.contains("\"path\":\"/Applications/Firefox.app\""));
        let back: InstalledApp = serde_json::from_str(&json).unwrap();
        assert_eq!(app, back);
    }

    #[test]
    fn dedupe_and_sort_is_case_insensitive() {
        let input = vec![
            InstalledApp {
                name: "VSCode".into(),
                path: "/p1".into(),
            },
            InstalledApp {
                name: "firefox".into(),
                path: "/p2".into(),
            },
            InstalledApp {
                name: "Firefox".into(),
                path: "/p3".into(),
            },
            InstalledApp {
                name: "Brave".into(),
                path: "/p4".into(),
            },
        ];
        let out = dedupe_and_sort(input);
        // dedupe mantém o primeiro Firefox; sort por lower-case
        assert_eq!(out.len(), 3);
        assert_eq!(out[0].name, "Brave");
        assert_eq!(out[1].name, "firefox");
        assert_eq!(out[2].name, "VSCode");
    }

    #[test]
    fn dedupe_preserves_first_path_when_names_collide() {
        let input = vec![
            InstalledApp {
                name: "Firefox".into(),
                path: "/canonical".into(),
            },
            InstalledApp {
                name: "firefox".into(),
                path: "/duplicate".into(),
            },
        ];
        let out = dedupe_and_sort(input);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].path, "/canonical");
    }
}
