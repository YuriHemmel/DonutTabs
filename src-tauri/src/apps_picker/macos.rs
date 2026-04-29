//! macOS ramo do `apps_picker` — Plano 17.
//!
//! Enumera `.app` bundles em `/Applications` (sistema) e
//! `~/Applications` (per-user). `name` = stem do bundle (`"Firefox"` para
//! `Firefox.app`); é o que `open -a NAME` reconhece via Launch Services.

// Em SOs ≠ macOS o ramo continua compilando (helpers puros são
// platform-independent e cobertos por testes), mas as funções não são
// invocadas. Suprimir dead_code só fora do target alvo evita poluir o
// build oficial sem mascarar dead code real.
#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

use super::{dedupe_and_sort, InstalledApp};
use crate::errors::AppResult;
use std::path::{Path, PathBuf};

pub fn list_macos_apps() -> AppResult<Vec<InstalledApp>> {
    let mut dirs: Vec<PathBuf> = vec![PathBuf::from("/Applications")];
    if let Ok(home) = std::env::var("HOME") {
        dirs.push(PathBuf::from(home).join("Applications"));
    }
    Ok(dedupe_and_sort(collect_apps_from_dirs(&dirs)))
}

/// Coleta `.app` bundles dos diretórios passados. Pure helper — testável com
/// `tempfile::tempdir()`. Diretórios ausentes são ignorados (graceful skip).
pub(crate) fn collect_apps_from_dirs(dirs: &[PathBuf]) -> Vec<InstalledApp> {
    let mut apps = Vec::new();
    for dir in dirs {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                if let Some(app) = app_from_entry(&entry.path()) {
                    apps.push(app);
                }
            }
        }
    }
    apps
}

fn app_from_entry(path: &Path) -> Option<InstalledApp> {
    if path.extension().and_then(|s| s.to_str()) != Some("app") {
        return None;
    }
    let name = path.file_stem()?.to_str()?.to_string();
    if name.trim().is_empty() {
        return None;
    }
    Some(InstalledApp {
        // macOS: value = name (friendly bundle stem). Launcher faz `open -a name`
        // e Launch Services resolve. Path absoluto é informacional.
        value: name.clone(),
        name,
        path: path.to_string_lossy().into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn touch_app(dir: &Path, name: &str) {
        let app_path = dir.join(format!("{name}.app"));
        fs::create_dir_all(&app_path).unwrap();
    }

    fn touch_file(dir: &Path, name: &str) {
        fs::write(dir.join(name), b"").unwrap();
    }

    #[test]
    fn collects_app_bundles_from_a_dir() {
        let td = tempdir().unwrap();
        touch_app(td.path(), "Firefox");
        touch_app(td.path(), "Brave");
        let apps = collect_apps_from_dirs(&[td.path().to_path_buf()]);
        let names: Vec<&str> = apps.iter().map(|a| a.name.as_str()).collect();
        assert!(names.contains(&"Firefox"));
        assert!(names.contains(&"Brave"));
        assert_eq!(apps.len(), 2);
    }

    #[test]
    fn ignores_non_app_entries() {
        let td = tempdir().unwrap();
        touch_app(td.path(), "OnlyOne");
        touch_file(td.path(), "junk.txt");
        fs::create_dir_all(td.path().join("PlainFolder")).unwrap();
        let apps = collect_apps_from_dirs(&[td.path().to_path_buf()]);
        assert_eq!(apps.len(), 1);
        assert_eq!(apps[0].name, "OnlyOne");
    }

    #[test]
    fn missing_dir_is_skipped_silently() {
        let td = tempdir().unwrap();
        let nonexistent = td.path().join("does-not-exist");
        let apps = collect_apps_from_dirs(&[nonexistent]);
        assert!(apps.is_empty());
    }

    #[test]
    fn merges_results_from_multiple_dirs() {
        let sys = tempdir().unwrap();
        let user = tempdir().unwrap();
        touch_app(sys.path(), "Firefox");
        touch_app(user.path(), "PrivateThing");
        let apps = collect_apps_from_dirs(&[sys.path().to_path_buf(), user.path().to_path_buf()]);
        assert_eq!(apps.len(), 2);
    }

    #[test]
    fn end_to_end_dedupe_and_sort_via_facade() {
        let td = tempdir().unwrap();
        touch_app(td.path(), "Zed");
        touch_app(td.path(), "Brave");
        let raw = collect_apps_from_dirs(&[td.path().to_path_buf()]);
        let sorted = dedupe_and_sort(raw);
        assert_eq!(sorted[0].name, "Brave");
        assert_eq!(sorted[1].name, "Zed");
    }
}
