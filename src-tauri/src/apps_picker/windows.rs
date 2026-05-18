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
    // Ordem importa: App Paths é a fonte mais autoritativa (path absoluto de
    // exe registrado). Uninstall vem depois (catch apps GUI que faltam em
    // App Paths). .lnk fica por último (fonte mais ruidosa — atalhos podem
    // apontar pra .url, .bat, instaladores etc.). `dedupe_and_sort` mantém
    // primeira ocorrência por `name` case-insensitive.
    combined.extend(list_app_paths());
    combined.extend(list_uninstall_entries());
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

/// Issue #48 — escaneia o registry `Uninstall` (HKLM + HKCU + WOW6432Node)
/// pra capturar apps GUI instaladas que não registram entry em `App Paths`.
/// Cada subkey carrega `DisplayName` (label friendly) + `DisplayIcon` ou
/// `InstallLocation` (path inferível pro exe). Skip entries marcadas como
/// `SystemComponent=1` ou com `ParentKeyName` non-empty (componentes
/// secundários de bundles maiores).
#[cfg(target_os = "windows")]
fn list_uninstall_entries() -> Vec<InstalledApp> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let mut apps = Vec::new();
    let paths = [
        "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        "Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    ];
    for hive in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
        for key_path in &paths {
            let Ok(root) = RegKey::predef(hive).open_subkey(key_path) else {
                continue;
            };
            for subkey_name in root.enum_keys().flatten() {
                let Ok(sub) = root.open_subkey(&subkey_name) else {
                    continue;
                };
                let display_name: String = sub.get_value("DisplayName").unwrap_or_default();
                let system_component: u32 = sub.get_value("SystemComponent").unwrap_or(0);
                let parent_key: String = sub.get_value("ParentKeyName").unwrap_or_default();
                let display_icon: String = sub.get_value("DisplayIcon").unwrap_or_default();
                let install_location: String = sub.get_value("InstallLocation").unwrap_or_default();
                if let Some(app) = uninstall_entry_to_installed(
                    &display_name,
                    system_component,
                    &parent_key,
                    &display_icon,
                    &install_location,
                ) {
                    apps.push(app);
                }
            }
        }
    }
    apps
}

#[cfg(not(target_os = "windows"))]
fn list_uninstall_entries() -> Vec<InstalledApp> {
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

/// Issue #48 — helper puro pra entries do registry `Uninstall`. Filtra
/// `SystemComponent=1` e `ParentKeyName` non-empty (componentes secundários
/// de bundles). Resolve `value` priorizando `DisplayIcon` (path do exe
/// usado pelo Add/Remove Programs) e caindo em `InstallLocation\\app.exe`
/// quando DisplayIcon não é um path utilizável. Returns `None` quando não
/// for possível derivar path.
pub(crate) fn uninstall_entry_to_installed(
    display_name: &str,
    system_component: u32,
    parent_key: &str,
    display_icon: &str,
    install_location: &str,
) -> Option<InstalledApp> {
    if system_component != 0 {
        return None;
    }
    if !parent_key.trim().is_empty() {
        return None;
    }
    let name = display_name.trim().to_string();
    if name.is_empty() {
        return None;
    }
    // DisplayIcon pode vir como `"C:\\path\\app.exe,0"` (icon index após
    // vírgula) ou apenas `"C:\\path\\app.exe"`. Strip qualquer sufixo `,N`.
    let icon_path = display_icon.split(',').next().unwrap_or("").trim();
    let icon_path = icon_path.trim_matches('"');
    let resolved = if icon_path.to_lowercase().ends_with(".exe") {
        Some(icon_path.to_string())
    } else if !install_location.trim().is_empty() {
        // Sem .exe explícito — usa InstallLocation como pasta informacional.
        // O launcher cai no fallback do shell, então só useful como hint.
        let loc = install_location.trim().trim_matches('"').to_string();
        Some(loc)
    } else {
        None
    };
    let resolved = resolved?;
    if resolved.is_empty() {
        return None;
    }
    Some(InstalledApp {
        name,
        value: resolved.clone(),
        path: resolved,
    })
}

/// Helper puro: dado o caminho de um `.lnk`, devolve `InstalledApp`:
/// - `name` = stem do arquivo (display friendly).
/// - `value` = target real parseado via crate `parselnk` (path absoluto do
///   exe alvo). Quando o parse falha — `.lnk` malformado, target aponta pra
///   protocolo não-arquivo (`.url`), permissão negada, etc. — cai no path
///   do próprio `.lnk` (launcher detecta extensão `.lnk` e roteia via
///   `tauri-plugin-opener`/ShellExecute como fallback do Plano 17).
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
    let resolved = parse_lnk_target(path).unwrap_or_else(|| abs.clone());
    Some(InstalledApp {
        name: stem,
        value: resolved.clone(),
        path: resolved,
    })
}

#[cfg(target_os = "windows")]
fn parse_lnk_target(path: &Path) -> Option<String> {
    // parselnk lê os bytes do `.lnk` e expõe `link_info` com `local_base_path`
    // (target absoluto). Falha (path inválido, .lnk malformado, sem link_info)
    // → `None` e o caller cai no path do próprio .lnk.
    use parselnk::Lnk;
    let lnk = Lnk::try_from(path).ok()?;
    let target = lnk.link_info.local_base_path?;
    let target = target.trim();
    if target.is_empty() {
        return None;
    }
    Some(target.to_string())
}

#[cfg(not(target_os = "windows"))]
fn parse_lnk_target(_path: &Path) -> Option<String> {
    // Em outros SOs não há `.lnk` real pra parsear — função existe apenas
    // pra fechar o cfg, sempre devolve None.
    None
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
    fn uninstall_entry_resolves_display_icon_exe() {
        let app = uninstall_entry_to_installed(
            "Mozilla Firefox",
            0,
            "",
            "\"C:\\Program Files\\Firefox\\firefox.exe\",0",
            "C:\\Program Files\\Firefox",
        )
        .unwrap();
        assert_eq!(app.name, "Mozilla Firefox");
        assert_eq!(app.value, "C:\\Program Files\\Firefox\\firefox.exe");
        assert_eq!(app.path, "C:\\Program Files\\Firefox\\firefox.exe");
    }

    #[test]
    fn uninstall_entry_falls_back_to_install_location_when_icon_not_exe() {
        let app = uninstall_entry_to_installed(
            "VLC media player",
            0,
            "",
            "C:\\Program Files\\VLC\\icon.ico,0",
            "C:\\Program Files\\VLC",
        )
        .unwrap();
        assert_eq!(app.name, "VLC media player");
        assert_eq!(app.value, "C:\\Program Files\\VLC");
    }

    #[test]
    fn uninstall_entry_rejects_system_component() {
        assert!(uninstall_entry_to_installed(
            "Hidden Update",
            1,
            "",
            "C:\\Windows\\update.exe",
            "C:\\Windows"
        )
        .is_none());
    }

    #[test]
    fn uninstall_entry_rejects_child_with_parent_key() {
        assert!(uninstall_entry_to_installed(
            "Bundled Tool",
            0,
            "MainApp",
            "C:\\App\\tool.exe",
            "C:\\App"
        )
        .is_none());
    }

    #[test]
    fn uninstall_entry_rejects_empty_display_name() {
        assert!(uninstall_entry_to_installed("", 0, "", "C:\\app.exe", "C:\\").is_none());
        assert!(uninstall_entry_to_installed("   ", 0, "", "C:\\app.exe", "C:\\").is_none());
    }

    #[test]
    fn uninstall_entry_rejects_no_path_at_all() {
        assert!(uninstall_entry_to_installed("App", 0, "", "", "").is_none());
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
