//! Linux: detecta default browser via `xdg-settings get default-web-browser`
//! (devolve nome do `.desktop`, e.g. `firefox.desktop`). Resolve o arquivo
//! `.desktop` nos paths XDG padrão e parseia `Exec=` pra extrair o binário
//! real — cobre Flatpak/Snap onde o stem do `.desktop` filename ≠ binary.

#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

#[cfg(target_os = "linux")]
pub fn detect() -> Option<String> {
    use std::process::Command;
    let output = Command::new("xdg-settings")
        .args(["get", "default-web-browser"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let desktop_filename = stdout.trim();
    if desktop_filename.is_empty() {
        return None;
    }
    eprintln!("[default_browser] xdg-settings → {desktop_filename}");
    resolve_desktop_exec(desktop_filename, &xdg_application_dirs())
}

#[cfg(not(target_os = "linux"))]
pub fn detect() -> Option<String> {
    None
}

/// Helper puro: dado o filename do `.desktop` (e.g. `firefox.desktop`),
/// procura o arquivo nos `search_dirs` informados e retorna o primeiro token
/// executável da linha `Exec=` (via `apps_picker::linux::parse_desktop_entry`).
/// Fallback: strip `.desktop` suffix (back-compat com instalações nativas
/// onde stem == binary name).
///
/// Dirs são injetadas pelo caller (em prod via `xdg_application_dirs()`,
/// em testes via tempdir) — evita que testes mutem env global `XDG_DATA_DIRS`
/// e gerem flakiness sob paralelismo.
pub(crate) fn resolve_desktop_exec(
    desktop_filename: &str,
    search_dirs: &[std::path::PathBuf],
) -> Option<String> {
    let name = desktop_filename.trim();
    if name.is_empty() {
        return None;
    }
    let filename = if name.ends_with(".desktop") {
        name.to_string()
    } else {
        format!("{}.desktop", name)
    };
    for base in search_dirs {
        let full = base.join(&filename);
        if let Ok(content) = std::fs::read_to_string(&full) {
            if let Some(entry) = crate::apps_picker::linux::parse_desktop_entry(&content) {
                eprintln!(
                    "[default_browser] resolved {filename} -> {} (from {})",
                    entry.exec,
                    full.display()
                );
                return Some(entry.exec);
            }
        }
    }
    // Fallback final: strip `.desktop` suffix e devolve stem. Útil pra
    // instalações nativas onde Exec= refere ao mesmo nome do filename.
    let stem = name.strip_suffix(".desktop").unwrap_or(name);
    if stem.is_empty() {
        None
    } else {
        eprintln!("[default_browser] desktop file não encontrado; fallback stem={stem}");
        Some(stem.to_string())
    }
}

/// Lista os dirs XDG onde `.desktop` files são procurados, em ordem de
/// precedência (user-level antes de system-level).
fn xdg_application_dirs() -> Vec<std::path::PathBuf> {
    let mut dirs: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(home) = std::env::var("HOME") {
        dirs.push(std::path::PathBuf::from(&home).join(".local/share/applications"));
    }
    // XDG_DATA_DIRS (colon-separated). Default per XDG spec: /usr/local/share:/usr/share.
    let xdg_data_dirs = std::env::var("XDG_DATA_DIRS")
        .unwrap_or_else(|_| "/usr/local/share:/usr/share".to_string());
    for d in xdg_data_dirs.split(':') {
        let d = d.trim();
        if d.is_empty() {
            continue;
        }
        dirs.push(std::path::PathBuf::from(d).join("applications"));
    }
    dirs
}

// Tests injetam as search_dirs como parâmetro — sem env mutation. Roda em
// qualquer SO (helpers são platform-independent agora).
#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn write_desktop(dir: &std::path::Path, name: &str, contents: &str) {
        std::fs::create_dir_all(dir).unwrap();
        std::fs::write(dir.join(name), contents).unwrap();
    }

    #[test]
    fn resolves_exec_via_real_desktop_file() {
        let dir = tempdir().unwrap();
        let apps_dir = dir.path().join("applications");
        write_desktop(
            &apps_dir,
            "firefox.desktop",
            "[Desktop Entry]\nName=Firefox\nExec=/usr/bin/firefox %u\nType=Application\n",
        );
        let exec = resolve_desktop_exec("firefox.desktop", &[apps_dir]).unwrap();
        assert_eq!(exec, "/usr/bin/firefox");
    }

    #[test]
    fn resolves_flatpak_exec_first_token() {
        let dir = tempdir().unwrap();
        let apps_dir = dir.path().join("applications");
        write_desktop(
            &apps_dir,
            "org.mozilla.firefox.desktop",
            "[Desktop Entry]\nName=Firefox\nExec=/usr/bin/flatpak run --branch=stable org.mozilla.firefox %u\nType=Application\n",
        );
        // Real Flatpak Exec = `flatpak run --command=firefox ... -- %u`.
        // Cobertura aqui: extrai apenas `/usr/bin/flatpak` (first token).
        let exec = resolve_desktop_exec("org.mozilla.firefox", &[apps_dir]).unwrap();
        assert_eq!(exec, "/usr/bin/flatpak");
    }

    #[test]
    fn falls_back_to_stem_when_file_missing() {
        let dir = tempdir().unwrap();
        let exec = resolve_desktop_exec("nonexistent.desktop", &[dir.path().to_path_buf()]).unwrap();
        assert_eq!(exec, "nonexistent");
    }

    #[test]
    fn rejects_empty_input() {
        assert!(resolve_desktop_exec("", &[]).is_none());
        assert!(resolve_desktop_exec("   ", &[]).is_none());
    }

    #[test]
    fn handles_filename_without_extension() {
        let dir = tempdir().unwrap();
        let apps_dir = dir.path().join("applications");
        write_desktop(
            &apps_dir,
            "brave.desktop",
            "[Desktop Entry]\nName=Brave\nExec=brave-browser %U\nType=Application\n",
        );
        let exec = resolve_desktop_exec("brave", &[apps_dir]).unwrap();
        assert_eq!(exec, "brave-browser");
    }

    #[test]
    fn first_matching_dir_wins() {
        // User-level dir antes do system-level. Mesmo filename em ambos:
        // resolve a versão do primeiro.
        let dir = tempdir().unwrap();
        let user = dir.path().join("user/applications");
        let system = dir.path().join("system/applications");
        write_desktop(
            &user,
            "firefox.desktop",
            "[Desktop Entry]\nName=Firefox\nExec=/home/me/.local/bin/firefox\nType=Application\n",
        );
        write_desktop(
            &system,
            "firefox.desktop",
            "[Desktop Entry]\nName=Firefox\nExec=/usr/bin/firefox\nType=Application\n",
        );
        let exec = resolve_desktop_exec("firefox.desktop", &[user, system]).unwrap();
        assert_eq!(exec, "/home/me/.local/bin/firefox");
    }
}
