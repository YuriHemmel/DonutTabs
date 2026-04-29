//! Linux ramo do `apps_picker` — Plano 17.
//!
//! Lê `.desktop` files em `$XDG_DATA_DIRS/applications/` (default
//! `/usr/share:/usr/local/share`) + `~/.local/share/applications/`. Ignora
//! entries com `NoDisplay=true` / `Hidden=true` / `Type` ≠ `Application`.
//! `name` = `Name=…`; `path` = primeira palavra do `Exec=…` (após strip de
//! field codes `%U`/`%F`/etc.).

#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

use super::{dedupe_and_sort, InstalledApp};
use crate::errors::AppResult;
use std::path::PathBuf;

pub fn list_linux_apps() -> AppResult<Vec<InstalledApp>> {
    let dirs = resolve_xdg_application_dirs();
    Ok(dedupe_and_sort(collect_apps_from_dirs(&dirs)))
}

/// Resolve a lista de diretórios `applications/` usando `XDG_DATA_DIRS`
/// (system) + `XDG_DATA_HOME` (user, default `~/.local/share`). Cada base é
/// concatenada com `/applications/`. Ordem: dirs do user primeiro (override
/// dirs do sistema, ainda que dedupe seja por `name`).
fn resolve_xdg_application_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if let Some(user_apps) = xdg_data_home_apps() {
        dirs.push(user_apps);
    }
    let xdg_data_dirs = std::env::var("XDG_DATA_DIRS")
        .unwrap_or_else(|_| "/usr/local/share:/usr/share".to_string());
    for base in xdg_data_dirs.split(':') {
        if base.is_empty() {
            continue;
        }
        dirs.push(PathBuf::from(base).join("applications"));
    }
    dirs
}

fn xdg_data_home_apps() -> Option<PathBuf> {
    if let Some(xdh) = std::env::var("XDG_DATA_HOME")
        .ok()
        .filter(|s| !s.is_empty())
    {
        return Some(PathBuf::from(xdh).join("applications"));
    }
    let home = std::env::var("HOME").ok()?;
    Some(PathBuf::from(home).join(".local/share/applications"))
}

/// Iterate dirs and parse `*.desktop` files. Diretórios ausentes são
/// graceful-skipped. Pure helper testável com tempdir.
pub(crate) fn collect_apps_from_dirs(dirs: &[PathBuf]) -> Vec<InstalledApp> {
    let mut apps = Vec::new();
    for dir in dirs {
        let Ok(entries) = std::fs::read_dir(dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("desktop") {
                continue;
            }
            let Ok(content) = std::fs::read_to_string(&path) else {
                continue;
            };
            if let Some(app) = parse_desktop_entry(&content) {
                apps.push(InstalledApp {
                    name: app.name,
                    path: app.exec,
                });
            }
        }
    }
    apps
}

/// Resultado intermediário do parser — apenas o suficiente pra construir
/// `InstalledApp`. Mantido como tipo separado pra deixar testes do parser
/// independentes do struct exposto via ts-rs.
#[derive(Debug, PartialEq, Eq)]
pub(crate) struct DesktopEntry {
    pub name: String,
    pub exec: String,
}

/// Parser puro de `.desktop` (INI flavor). Lê só a seção
/// `[Desktop Entry]` (a primeira encontrada); ignora seções `[Desktop
/// Action xxx]` (não fazem sentido como apps standalone). Strip de
/// field codes (`%U`/`%F`/`%u`/`%f`/`%i`/`%c`/`%k`).
pub(crate) fn parse_desktop_entry(content: &str) -> Option<DesktopEntry> {
    let mut in_section = false;
    let mut name: Option<String> = None;
    let mut exec: Option<String> = None;
    let mut entry_type: Option<String> = None;
    let mut no_display = false;
    let mut hidden = false;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if trimmed.starts_with('[') && trimmed.ends_with(']') {
            in_section = trimmed == "[Desktop Entry]";
            continue;
        }
        if !in_section {
            continue;
        }
        if let Some((key, value)) = trimmed.split_once('=') {
            let key = key.trim();
            let value = value.trim();
            match key {
                "Name" => {
                    name.get_or_insert_with(|| value.to_string());
                }
                "Exec" => {
                    exec.get_or_insert_with(|| value.to_string());
                }
                "Type" => {
                    entry_type = Some(value.to_string());
                }
                "NoDisplay" => {
                    no_display = parse_bool(value);
                }
                "Hidden" => {
                    hidden = parse_bool(value);
                }
                _ => {}
            }
        }
    }

    if no_display || hidden {
        return None;
    }
    // Plano 17: Type=Application é o caso de interesse. `.desktop` sem
    // Type explícito assume Application por convenção (XDG spec); ramos
    // `Type=Link` ou `Type=Directory` são filtrados.
    match entry_type.as_deref() {
        Some("Application") | None => {}
        Some(_) => return None,
    }

    let name = name?;
    let exec_raw = exec?;
    let exec_clean = strip_field_codes(&exec_raw);
    let executable = exec_clean.split_whitespace().next()?.to_string();
    if name.trim().is_empty() || executable.is_empty() {
        return None;
    }
    Some(DesktopEntry {
        name,
        exec: executable,
    })
}

fn parse_bool(value: &str) -> bool {
    matches!(value.trim().to_lowercase().as_str(), "true" | "1" | "yes")
}

/// Remove field codes (`%U`/`%F`/`%u`/`%f`/`%i`/`%c`/`%k`/`%v`/`%m`) do
/// `Exec`. `%%` vira `%` (escape literal). XDG spec define exatamente
/// esses códigos — nenhum desses é interpretado pelo nosso launcher.
fn strip_field_codes(exec: &str) -> String {
    let mut out = String::with_capacity(exec.len());
    let mut chars = exec.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '%' {
            match chars.peek() {
                Some('%') => {
                    out.push('%');
                    chars.next();
                }
                Some(_code) => {
                    chars.next();
                }
                None => {}
            }
        } else {
            out.push(c);
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn parses_simple_entry() {
        let content = "[Desktop Entry]\nName=Firefox\nExec=firefox %u\nType=Application\n";
        let r = parse_desktop_entry(content).unwrap();
        assert_eq!(r.name, "Firefox");
        assert_eq!(r.exec, "firefox");
    }

    #[test]
    fn rejects_no_display() {
        let content = "[Desktop Entry]\nName=A\nExec=a\nType=Application\nNoDisplay=true\n";
        assert!(parse_desktop_entry(content).is_none());
    }

    #[test]
    fn rejects_hidden() {
        let content = "[Desktop Entry]\nName=A\nExec=a\nType=Application\nHidden=true\n";
        assert!(parse_desktop_entry(content).is_none());
    }

    #[test]
    fn rejects_non_application_type() {
        let content = "[Desktop Entry]\nName=A\nExec=a\nType=Link\nURL=https://x\n";
        assert!(parse_desktop_entry(content).is_none());
    }

    #[test]
    fn accepts_when_type_is_omitted_default_application() {
        let content = "[Desktop Entry]\nName=A\nExec=a\n";
        let r = parse_desktop_entry(content).unwrap();
        assert_eq!(r.name, "A");
    }

    #[test]
    fn strips_field_codes() {
        let content = "[Desktop Entry]\nName=A\nExec=foo %F %u\nType=Application\n";
        let r = parse_desktop_entry(content).unwrap();
        assert_eq!(r.exec, "foo");
    }

    #[test]
    fn ignores_actions_section() {
        let content = "[Desktop Entry]\nName=A\nExec=a\n\n[Desktop Action new]\nName=B\nExec=b\n";
        let r = parse_desktop_entry(content).unwrap();
        // Mesmo que [Desktop Action new] tenha Name=B, ignoramos — primeiro
        // Name lido foi "A" (in_section=true só na seção principal).
        assert_eq!(r.name, "A");
    }

    #[test]
    fn ignores_comments_and_blank_lines() {
        let content = "# comment\n\n[Desktop Entry]\n# another\nName=A\nExec=a\n";
        let r = parse_desktop_entry(content).unwrap();
        assert_eq!(r.name, "A");
    }

    #[test]
    fn missing_name_or_exec_returns_none() {
        let no_name = "[Desktop Entry]\nExec=a\n";
        let no_exec = "[Desktop Entry]\nName=A\n";
        assert!(parse_desktop_entry(no_name).is_none());
        assert!(parse_desktop_entry(no_exec).is_none());
    }

    #[test]
    fn collects_from_dir_skipping_invalid_entries() {
        let td = tempdir().unwrap();
        fs::write(
            td.path().join("ok.desktop"),
            "[Desktop Entry]\nName=Firefox\nExec=firefox %u\nType=Application\n",
        )
        .unwrap();
        fs::write(
            td.path().join("hidden.desktop"),
            "[Desktop Entry]\nName=H\nExec=h\nType=Application\nHidden=true\n",
        )
        .unwrap();
        fs::write(td.path().join("readme.txt"), "ignore me").unwrap();
        let apps = collect_apps_from_dirs(&[td.path().to_path_buf()]);
        assert_eq!(apps.len(), 1);
        assert_eq!(apps[0].name, "Firefox");
    }

    #[test]
    fn missing_dir_skipped() {
        let td = tempdir().unwrap();
        let nonexistent = td.path().join("ghost");
        let apps = collect_apps_from_dirs(&[nonexistent]);
        assert!(apps.is_empty());
    }

    #[test]
    fn merges_user_and_system_dirs_dedupe_by_name() {
        let user = tempdir().unwrap();
        let sys = tempdir().unwrap();
        fs::write(
            user.path().join("ff.desktop"),
            "[Desktop Entry]\nName=Firefox\nExec=firefox-user\nType=Application\n",
        )
        .unwrap();
        fs::write(
            sys.path().join("ff.desktop"),
            "[Desktop Entry]\nName=Firefox\nExec=firefox-sys\nType=Application\n",
        )
        .unwrap();
        let raw = collect_apps_from_dirs(&[user.path().to_path_buf(), sys.path().to_path_buf()]);
        let sorted = dedupe_and_sort(raw);
        // dedupe: primeiro encontrado (user) prevalece
        assert_eq!(sorted.len(), 1);
        assert_eq!(sorted[0].path, "firefox-user");
    }

    #[test]
    fn strip_field_codes_handles_double_percent_escape() {
        assert_eq!(strip_field_codes("foo %% bar"), "foo % bar");
        assert_eq!(strip_field_codes("foo %u bar %F"), "foo  bar ");
    }

    #[test]
    fn parse_bool_accepts_known_truthy_values() {
        assert!(parse_bool("true"));
        assert!(parse_bool("True"));
        assert!(parse_bool("1"));
        assert!(parse_bool("yes"));
        assert!(!parse_bool("false"));
        assert!(!parse_bool("0"));
        assert!(!parse_bool(""));
    }
}
