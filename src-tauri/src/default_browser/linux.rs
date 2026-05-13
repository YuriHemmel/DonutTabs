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
    resolve_desktop_exec(desktop_filename)
}

#[cfg(not(target_os = "linux"))]
pub fn detect() -> Option<String> {
    None
}

/// Helper puro: dado o filename do `.desktop` (e.g. `firefox.desktop`),
/// procura o arquivo em paths XDG e retorna o primeiro token executável da
/// linha `Exec=` (via `apps_picker::linux::parse_desktop_entry`). Fallback:
/// strip `.desktop` suffix (back-compat com instalações nativas onde stem ==
/// binary name).
pub(crate) fn resolve_desktop_exec(desktop_filename: &str) -> Option<String> {
    let name = desktop_filename.trim();
    if name.is_empty() {
        return None;
    }
    let filename = if name.ends_with(".desktop") {
        name.to_string()
    } else {
        format!("{}.desktop", name)
    };
    for base in xdg_application_dirs() {
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

// Tests usam env vars XDG_DATA_DIRS que são split em `:` — incompatível com
// paths Windows (`C:\...`). Helpers só fazem sentido logico em Linux.
#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn resolves_exec_via_real_desktop_file() {
        let dir = tempdir().unwrap();
        let apps_dir = dir.path().join("applications");
        std::fs::create_dir_all(&apps_dir).unwrap();
        let desktop_file = apps_dir.join("firefox.desktop");
        std::fs::write(
            &desktop_file,
            "[Desktop Entry]\nName=Firefox\nExec=/usr/bin/firefox %u\nType=Application\n",
        )
        .unwrap();

        // Stub xdg_application_dirs via env (XDG_DATA_DIRS) — funciona porque
        // resolve_desktop_exec lê env dinamicamente.
        // Garantir isolamento: limpa HOME pra não vazar pra outros tests
        // paralelos. (Tests Rust em modules rodam serial dentro do binary
        // mas paralelizam entre files; aqui basta override do XDG_DATA_DIRS.)
        std::env::set_var("XDG_DATA_DIRS", dir.path().to_string_lossy().to_string());
        std::env::remove_var("HOME");

        let exec = resolve_desktop_exec("firefox.desktop").unwrap();
        assert_eq!(exec, "/usr/bin/firefox");
    }

    #[test]
    fn resolves_flatpak_exec_first_token() {
        let dir = tempdir().unwrap();
        let apps_dir = dir.path().join("applications");
        std::fs::create_dir_all(&apps_dir).unwrap();
        std::fs::write(
            apps_dir.join("org.mozilla.firefox.desktop"),
            "[Desktop Entry]\nName=Firefox\nExec=/usr/bin/flatpak run --branch=stable org.mozilla.firefox %u\nType=Application\n",
        )
        .unwrap();
        std::env::set_var("XDG_DATA_DIRS", dir.path().to_string_lossy().to_string());
        std::env::remove_var("HOME");

        // Note: real Flatpak Exec = `flatpak run --command=firefox ... org.mozilla.firefox -- %u`.
        // Cobertura aqui: extrai apenas `/usr/bin/flatpak` (first token).
        let exec = resolve_desktop_exec("org.mozilla.firefox").unwrap();
        assert_eq!(exec, "/usr/bin/flatpak");
    }

    #[test]
    fn falls_back_to_stem_when_file_missing() {
        let dir = tempdir().unwrap();
        std::env::set_var("XDG_DATA_DIRS", dir.path().to_string_lossy().to_string());
        std::env::remove_var("HOME");
        let exec = resolve_desktop_exec("nonexistent.desktop").unwrap();
        assert_eq!(exec, "nonexistent");
    }

    #[test]
    fn rejects_empty_input() {
        assert!(resolve_desktop_exec("").is_none());
        assert!(resolve_desktop_exec("   ").is_none());
    }

    #[test]
    fn handles_filename_without_extension() {
        let dir = tempdir().unwrap();
        let apps_dir = dir.path().join("applications");
        std::fs::create_dir_all(&apps_dir).unwrap();
        std::fs::write(
            apps_dir.join("brave.desktop"),
            "[Desktop Entry]\nName=Brave\nExec=brave-browser %U\nType=Application\n",
        )
        .unwrap();
        std::env::set_var("XDG_DATA_DIRS", dir.path().to_string_lossy().to_string());
        std::env::remove_var("HOME");
        let exec = resolve_desktop_exec("brave").unwrap();
        assert_eq!(exec, "brave-browser");
    }
}
