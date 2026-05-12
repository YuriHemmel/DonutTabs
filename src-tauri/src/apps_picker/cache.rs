//! Issue #48 — cache em disco da lista de apps instalados.
//!
//! Varredura no Windows envolve enumerar registry (HKLM + HKCU + WOW6432Node)
//! + parsear N `.lnk` no Start Menu — pode levar 1-3s em máquinas com muitos
//!   programas. Cache num arquivo `<app_config>/apps_cache.json` com TTL longo
//!   (7 dias) torna a abertura subsequente do picker instantânea.
//!
//! Estratégia de invalidação:
//! - **TTL hit**: cache lido + retornado direto (sem refresh).
//! - **TTL stale** (`generated_at + TTL < now`): refresh implícito na próxima
//!   chamada de `list_installed_apps`.
//! - **Force refresh**: comando dedicado `refresh_installed_apps` regrava o
//!   arquivo (botão "Atualizar lista" no `<AppPicker>`).
//! - **Sumiço de arquivo**: o launcher do Plano 14 reporta falha quando um
//!   path cacheado já não existe; cliente deve disparar refresh manualmente.
//!   (V1 não tem invalidação automática por miss — mantém código simples.)

use super::InstalledApp;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// TTL do cache em segundos. 7 dias é largo o bastante pra cobrir uso casual
/// sem regravar a cada abertura. Apps recém-instalados aparecerão após user
/// clicar "Atualizar lista" — friction aceitável pelo ganho de performance.
pub const CACHE_TTL_SECONDS: u64 = 7 * 24 * 60 * 60;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct CachedAppsFile {
    /// Epoch seconds quando o cache foi gerado. `0` força refresh.
    pub generated_at: u64,
    pub apps: Vec<InstalledApp>,
}

/// Helper puro — decide se um cache está stale dado `now`. Extraído pra
/// permitir teste sem mockar `SystemTime`.
pub(crate) fn is_stale(cache: &CachedAppsFile, now: u64, ttl: u64) -> bool {
    if cache.generated_at == 0 {
        return true;
    }
    cache.generated_at.saturating_add(ttl) <= now
}

/// Read + parse cache. Returns `None` em qualquer erro (arquivo ausente,
/// JSON corrompido, IO error) — caller faz refresh.
pub(crate) fn read_cache(path: &Path) -> Option<CachedAppsFile> {
    let raw = std::fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

/// Write atomically (tmp + rename). Falha silenciosa — cache não-essencial.
pub(crate) fn write_cache(path: &Path, cache: &CachedAppsFile) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(cache).map_err(std::io::Error::other)?;
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

/// Epoch seconds. Falha (clock antes de 1970) → 0 (força refresh no próximo
/// `is_stale`).
pub(crate) fn now_epoch_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Orquestra leitura+refresh: lê cache; se fresh, retorna; caso contrário
/// chama `fetcher` (varredura cara), grava cache, retorna o resultado novo.
/// `force=true` ignora cache existente.
pub(crate) fn load_or_refresh<F>(cache_path: &Path, force: bool, fetcher: F) -> Vec<InstalledApp>
where
    F: FnOnce() -> Vec<InstalledApp>,
{
    if !force {
        if let Some(cache) = read_cache(cache_path) {
            if !is_stale(&cache, now_epoch_seconds(), CACHE_TTL_SECONDS) {
                return cache.apps;
            }
        }
    }
    let apps = fetcher();
    let cache = CachedAppsFile {
        generated_at: now_epoch_seconds(),
        apps: apps.clone(),
    };
    let _ = write_cache(cache_path, &cache);
    apps
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn fake_apps() -> Vec<InstalledApp> {
        vec![InstalledApp {
            name: "Firefox".into(),
            value: "C:\\Firefox\\firefox.exe".into(),
            path: "C:\\Firefox\\firefox.exe".into(),
        }]
    }

    #[test]
    fn is_stale_when_generated_at_zero() {
        let cache = CachedAppsFile {
            generated_at: 0,
            apps: vec![],
        };
        assert!(is_stale(&cache, 100, 60));
    }

    #[test]
    fn is_fresh_within_ttl_window() {
        let cache = CachedAppsFile {
            generated_at: 100,
            apps: vec![],
        };
        assert!(!is_stale(&cache, 150, 60));
    }

    #[test]
    fn is_stale_after_ttl_expires() {
        let cache = CachedAppsFile {
            generated_at: 100,
            apps: vec![],
        };
        // 100 + 60 = 160; now=200 → stale.
        assert!(is_stale(&cache, 200, 60));
    }

    #[test]
    fn is_stale_at_exact_ttl_boundary() {
        // Comparação `<=` é defensive: na borda, prefere refresh.
        let cache = CachedAppsFile {
            generated_at: 100,
            apps: vec![],
        };
        assert!(is_stale(&cache, 160, 60));
    }

    #[test]
    fn write_then_read_round_trips() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("apps_cache.json");
        let original = CachedAppsFile {
            generated_at: 12345,
            apps: fake_apps(),
        };
        write_cache(&path, &original).unwrap();
        let back = read_cache(&path).unwrap();
        assert_eq!(original, back);
    }

    #[test]
    fn read_cache_returns_none_for_missing_file() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("missing.json");
        assert!(read_cache(&path).is_none());
    }

    #[test]
    fn read_cache_returns_none_for_invalid_json() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("broken.json");
        std::fs::write(&path, "{not json").unwrap();
        assert!(read_cache(&path).is_none());
    }

    #[test]
    fn load_or_refresh_uses_fresh_cache_without_calling_fetcher() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("apps_cache.json");
        // Cache fresh: generated_at = now_epoch_seconds(), TTL longo.
        let cache = CachedAppsFile {
            generated_at: now_epoch_seconds(),
            apps: fake_apps(),
        };
        write_cache(&path, &cache).unwrap();
        let mut called = false;
        let out = load_or_refresh(&path, false, || {
            called = true;
            vec![]
        });
        assert!(!called, "fetcher should NOT be called when cache is fresh");
        assert_eq!(out, fake_apps());
    }

    #[test]
    fn load_or_refresh_calls_fetcher_when_cache_missing() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("apps_cache.json");
        let out = load_or_refresh(&path, false, fake_apps);
        assert_eq!(out, fake_apps());
        // Refresh writes the file.
        assert!(path.exists());
    }

    #[test]
    fn load_or_refresh_force_bypasses_fresh_cache() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("apps_cache.json");
        let stale_cache = CachedAppsFile {
            generated_at: now_epoch_seconds(),
            apps: vec![InstalledApp {
                name: "OldApp".into(),
                value: "/old".into(),
                path: "/old".into(),
            }],
        };
        write_cache(&path, &stale_cache).unwrap();
        let mut called = false;
        let out = load_or_refresh(&path, true, || {
            called = true;
            fake_apps()
        });
        assert!(called, "fetcher MUST be called when force=true");
        assert_eq!(out, fake_apps());
    }
}
