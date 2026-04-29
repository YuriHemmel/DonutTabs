//! Windows ramo do `apps_picker` — Plano 17.
//!
//! Enumera apps via duas fontes:
//! 1. Registry `Software\Microsoft\Windows\CurrentVersion\App Paths` em
//!    HKLM e HKCU. Cada subkey é um nome de exe (`firefox.exe`); valor
//!    default é o caminho absoluto. Esta é a tabela canônica do Windows
//!    pra resolver "executáveis invocáveis pelo nome curto" — bate com o
//!    que o launcher do Plano 14 já espera ao chamar `Command::new(name)`.
//! 2. Start Menu `.lnk` files em `%PROGRAMDATA%\Microsoft\Windows\Start
//!    Menu\Programs` e `%APPDATA%\Microsoft\Windows\Start Menu\Programs`
//!    (recursivo). Como não parseamos a estrutura binária Microsoft Shell
//!    Link, expomos só o **stem** do arquivo (`Firefox` para `Firefox.lnk`)
//!    — informacional pro picker, suficiente pro user reconhecer a app.
//!
//! Dedupe por `name` case-insensitive (App Paths ganha quando colide).

#![cfg_attr(not(target_os = "windows"), allow(dead_code))]

use super::{dedupe_and_sort, InstalledApp};
use crate::errors::AppResult;
use std::path::Path;
#[cfg(target_os = "windows")]
use std::path::PathBuf;

pub fn list_windows_apps_combined() -> AppResult<Vec<InstalledApp>> {
    let mut combined = Vec::new();
    combined.extend(list_app_paths());
    combined.extend(list_start_menu_lnks());
    Ok(dedupe_and_sort(combined))
}

#[cfg(target_os = "windows")]
fn list_app_paths() -> Vec<InstalledApp> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let mut apps = Vec::new();
    let key_path = "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths";
    for hive in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        let Ok(root) = RegKey::predef(hive).open_subkey(key_path) else {
            continue;
        };
        for subkey_name in root.enum_keys().flatten() {
            // Default value (`""`) carries the absolute path to the exe.
            let path_value: String = root
                .open_subkey(&subkey_name)
                .ok()
                .and_then(|sub| sub.get_value("").ok())
                .unwrap_or_default();
            if let Some(app) = app_paths_entry_to_installed(&subkey_name, &path_value) {
                apps.push(app);
            }
        }
    }
    apps
}

#[cfg(not(target_os = "windows"))]
fn list_app_paths() -> Vec<InstalledApp> {
    // Em outros SOs, registry não existe — função não faz nada.
    // Mantida pra mod compilar cross-platform (testes dos parsers puros
    // rodam em qualquer SO no CI).
    Vec::new()
}

#[cfg(target_os = "windows")]
fn list_start_menu_lnks() -> Vec<InstalledApp> {
    let mut apps = Vec::new();
    for env_var in ["PROGRAMDATA", "APPDATA"] {
        let Ok(base) = std::env::var(env_var) else {
            continue;
        };
        let dir = PathBuf::from(base).join("Microsoft\\Windows\\Start Menu\\Programs");
        collect_lnks_recursive(&dir, &mut apps);
    }
    apps
}

#[cfg(not(target_os = "windows"))]
fn list_start_menu_lnks() -> Vec<InstalledApp> {
    Vec::new()
}

#[cfg(target_os = "windows")]
fn collect_lnks_recursive(dir: &Path, out: &mut Vec<InstalledApp>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            collect_lnks_recursive(&path, out);
        } else if let Some(app) = lnk_path_to_installed(&path) {
            out.push(app);
        }
    }
}

/// Helper puro: dado o nome da subkey de `App Paths` (`firefox.exe`) e o
/// valor default (caminho absoluto), constrói `InstalledApp`:
/// - `name` = stem do exe (display friendly, e.g. `"firefox"`)
/// - `value` = path absoluto do exe (vai pra `Item::App.name`; launcher faz
///   `Command::new(absolute_path)` que funciona sem precisar de PATH).
/// - `path` = mesmo que `value` (informacional). Se a subkey não tem default
///   value (registry incompleto), `value` cai no subkey-name como último
///   recurso — pode falhar no launch se exe não estiver em PATH.
pub(crate) fn app_paths_entry_to_installed(
    subkey_name: &str,
    path_value: &str,
) -> Option<InstalledApp> {
    let stem = Path::new(subkey_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .map(|s| s.to_string())?;
    if stem.trim().is_empty() {
        return None;
    }
    let resolved = if path_value.trim().is_empty() {
        subkey_name.to_string()
    } else {
        path_value.to_string()
    };
    Some(InstalledApp {
        name: stem,
        value: resolved.clone(),
        path: resolved,
    })
}

/// Helper puro: dado o caminho de um `.lnk`, devolve `InstalledApp`:
/// - `name` = stem do arquivo (display friendly).
/// - `value` = caminho absoluto do `.lnk`. Launcher detecta `.lnk` extensão
///   e roteia via `tauri-plugin-opener` (ShellExecute) já que CreateProcess
///   não resolve shell-links nativamente.
/// - `path` = mesmo que `value`.
pub(crate) fn lnk_path_to_installed(path: &Path) -> Option<InstalledApp> {
    if path.extension().and_then(|s| s.to_str()) != Some("lnk") {
        return None;
    }
    let stem = path.file_stem()?.to_str()?.to_string();
    if stem.trim().is_empty() {
        return None;
    }
    let abs = path.to_string_lossy().into_owned();
    Some(InstalledApp {
        name: stem,
        value: abs.clone(),
        path: abs,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn app_paths_entry_uses_stem_as_name_and_path_as_value() {
        let app =
            app_paths_entry_to_installed("firefox.exe", "C:\\Program Files\\Firefox\\firefox.exe")
                .unwrap();
        assert_eq!(app.name, "firefox");
        // value (o que vai pra Item::App.name) = path absoluto do exe.
        assert_eq!(app.value, "C:\\Program Files\\Firefox\\firefox.exe");
        assert_eq!(app.path, "C:\\Program Files\\Firefox\\firefox.exe");
    }

    #[test]
    fn app_paths_entry_falls_back_to_subkey_when_value_empty() {
        let app = app_paths_entry_to_installed("code.exe", "").unwrap();
        assert_eq!(app.name, "code");
        // Sem default value, value cai no subkey-name (último recurso).
        assert_eq!(app.value, "code.exe");
        assert_eq!(app.path, "code.exe");
    }

    #[test]
    fn app_paths_entry_handles_subkey_without_exe_extension() {
        let app = app_paths_entry_to_installed("WinRAR", "C:\\Program Files\\WinRAR\\WinRAR.exe")
            .unwrap();
        assert_eq!(app.name, "WinRAR");
        assert_eq!(app.value, "C:\\Program Files\\WinRAR\\WinRAR.exe");
    }

    #[test]
    fn app_paths_entry_rejects_empty_subkey() {
        assert!(app_paths_entry_to_installed("", "x").is_none());
    }

    #[test]
    fn lnk_uses_stem_as_name_and_full_path_as_value() {
        // Path com separador `/` (forward) funciona em qualquer SO; o `\\`
        // do Windows é literal-char em Unix e quebra `.file_stem()`.
        let p = PathBuf::from("/start/menu/Firefox.lnk");
        let app = lnk_path_to_installed(&p).unwrap();
        assert_eq!(app.name, "Firefox");
        // value = caminho absoluto do .lnk (launcher detecta extensão e
        // roteia via opener, já que Command::new não resolve shell-links).
        assert!(app.value.ends_with("Firefox.lnk"));
        assert_eq!(app.value, app.path);
    }

    #[test]
    fn lnk_rejects_non_lnk_extension() {
        let p = PathBuf::from("/start/menu/readme.txt");
        assert!(lnk_path_to_installed(&p).is_none());
    }

    #[test]
    fn lnk_rejects_no_extension() {
        let p = PathBuf::from("/start/menu/firefox");
        assert!(lnk_path_to_installed(&p).is_none());
    }

    #[test]
    fn dedupe_prefers_app_paths_when_lnk_collides() {
        // Helper resultado seria misturado em list_windows_apps_combined; aqui
        // simulo a ordem (App Paths antes de .lnk) pra confirmar que dedupe
        // mantém o registry entry.
        let combined = vec![
            InstalledApp {
                name: "Firefox".into(),
                value: "C:\\Program Files\\Firefox\\firefox.exe".into(),
                path: "C:\\Program Files\\Firefox\\firefox.exe".into(),
            },
            InstalledApp {
                name: "Firefox".into(),
                value: "C:\\Start Menu\\Firefox.lnk".into(),
                path: "C:\\Start Menu\\Firefox.lnk".into(),
            },
        ];
        let sorted = dedupe_and_sort(combined);
        assert_eq!(sorted.len(), 1);
        assert!(sorted[0].value.ends_with("firefox.exe"));
    }
}
