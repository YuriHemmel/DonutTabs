//! Plano 17 — picker visual de apps instalados.
//!
//! Cada SO tem um ramo `#[cfg(target_os = "...")]` que enumera apps via
//! convenção do SO:
//! - macOS: `/Applications/*.app` + `~/Applications/*.app`
//! - Linux: `.desktop` files em `$XDG_DATA_DIRS/applications/` (default
//!   `/usr/local/share:/usr/share`) + `~/.local/share/applications/`
//! - Windows: registry `App Paths` (HKLM+HKCU) + Start Menu `.lnk` stems
//!
//! `InstalledApp.value` é o que o picker insere em `Item::App.name` — varia
//! por SO pra casar com o launcher do Plano 14:
//! - macOS: nome friendly (`"Firefox"`) — launcher faz `open -a name`.
//! - Linux: primeiro token do `Exec=` — launcher faz `Command::new(name)` via PATH.
//! - Windows App Paths: caminho absoluto do `.exe` — `Command::new(absolute)`.
//! - Windows `.lnk`: caminho absoluto do `.lnk` — launcher detecta extensão e
//!   roteia via opener (ShellExecute) já que `Command::new` não resolve `.lnk`.
//!
//! `InstalledApp.name` é display friendly (mostrado como title da row).
//! `InstalledApp.path` é informacional (mostrado como subtitle).

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
use crate::errors::AppError;
use crate::errors::AppResult;
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
    /// Display friendly mostrado como título da row no picker.
    /// macOS: stem do `.app` bundle (`"Firefox"`).
    /// Linux: `Name=` do `.desktop`.
    /// Windows: stem do exe (App Paths) ou do `.lnk` (Start Menu).
    pub name: String,
    /// String que o picker insere em `Item::App.name` quando o user seleciona
    /// a row. Varia por SO pra casar com o launcher do Plano 14 — ver doc do
    /// módulo. **AppPicker.onSelect dispatch this, not `name`.**
    pub value: String,
    /// Caminho informacional (subtitle/tooltip + desambiguação de duplicatas).
    /// macOS: bundle path. Linux: `.desktop` file path. Windows: mesmo que
    /// `value` (sempre path absoluto naquele ramo).
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

    fn app(name: &str, value: &str, path: &str) -> InstalledApp {
        InstalledApp {
            name: name.into(),
            value: value.into(),
            path: path.into(),
        }
    }

    #[test]
    fn installed_app_round_trips() {
        let a = app("Firefox", "Firefox", "/Applications/Firefox.app");
        let json = serde_json::to_string(&a).unwrap();
        assert!(json.contains("\"name\":\"Firefox\""));
        assert!(json.contains("\"value\":\"Firefox\""));
        assert!(json.contains("\"path\":\"/Applications/Firefox.app\""));
        let back: InstalledApp = serde_json::from_str(&json).unwrap();
        assert_eq!(a, back);
    }

    #[test]
    fn dedupe_and_sort_is_case_insensitive() {
        let input = vec![
            app("VSCode", "VSCode", "/p1"),
            app("firefox", "firefox", "/p2"),
            app("Firefox", "Firefox", "/p3"),
            app("Brave", "Brave", "/p4"),
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
            app("Firefox", "v1", "/canonical"),
            app("firefox", "v2", "/duplicate"),
        ];
        let out = dedupe_and_sort(input);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].path, "/canonical");
        assert_eq!(out[0].value, "v1");
    }
}
