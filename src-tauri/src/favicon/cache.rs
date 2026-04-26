use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use url::Url;

/// Sub-directory inside the app config dir where binary favicon blobs live.
pub const CACHE_SUBDIR: &str = "favicons";

/// Returns the on-disk cache path for the favicon associated with `url`.
///
/// The cache key is the SHA-256 hex of the URL's *origin* (scheme + host +
/// port). Two URLs that share the same origin (`https://a.com/x` and
/// `https://a.com/y`) resolve to the same cache file because the favicon is
/// per-site, not per-page. URLs that fail to parse return `None`.
pub fn cache_path_for(url: &str, base_dir: &Path) -> Option<PathBuf> {
    let parsed = Url::parse(url).ok()?;
    let origin = origin_string(&parsed)?;
    let hex = hex_sha256(&origin);
    Some(base_dir.join(CACHE_SUBDIR).join(format!("{hex}.bin")))
}

fn origin_string(u: &Url) -> Option<String> {
    let scheme = u.scheme();
    let host = u.host_str()?;
    let port = u
        .port_or_known_default()
        .map(|p| p.to_string())
        .unwrap_or_default();
    Some(format!("{scheme}://{host}:{port}"))
}

fn hex_sha256(s: &str) -> String {
    let mut h = Sha256::new();
    h.update(s.as_bytes());
    let bytes = h.finalize();
    let mut out = String::with_capacity(bytes.len() * 2);
    use std::fmt::Write;
    for b in bytes {
        let _ = write!(out, "{b:02x}");
    }
    out
}

/// `true` when `modified` is older than `ttl` relative to `now`.
/// Clock skew where `modified > now` returns `false` (treat as fresh).
pub fn is_stale(modified: SystemTime, now: SystemTime, ttl: Duration) -> bool {
    match now.duration_since(modified) {
        Ok(elapsed) => elapsed > ttl,
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn base() -> PathBuf {
        PathBuf::from("/tmp/dt")
    }

    #[test]
    fn same_origin_different_paths_share_cache_key() {
        let a = cache_path_for("https://example.com/a/b", &base()).unwrap();
        let b = cache_path_for("https://example.com/x?q=1", &base()).unwrap();
        assert_eq!(a, b);
    }

    #[test]
    fn different_origins_produce_different_paths() {
        let a = cache_path_for("https://example.com/", &base()).unwrap();
        let b = cache_path_for("https://other.com/", &base()).unwrap();
        let c = cache_path_for("http://example.com/", &base()).unwrap();
        assert_ne!(a, b);
        assert_ne!(a, c, "scheme is part of origin");
    }

    #[test]
    fn cache_path_lives_under_favicons_subdir() {
        let p = cache_path_for("https://example.com/", &base()).unwrap();
        assert_eq!(
            p.parent().and_then(|x| x.file_name()).unwrap(),
            CACHE_SUBDIR
        );
        assert_eq!(p.extension().unwrap(), "bin");
    }

    #[test]
    fn invalid_url_returns_none() {
        assert!(cache_path_for("not a url", &base()).is_none());
        assert!(cache_path_for("file:///etc/passwd", &base()).is_none()); // no host
    }

    #[test]
    fn is_stale_respects_ttl() {
        let now = SystemTime::now();
        let one_day = Duration::from_secs(60 * 60 * 24);
        let ttl = Duration::from_secs(60 * 60 * 24 * 7);

        let one_day_ago = now - one_day;
        assert!(!is_stale(one_day_ago, now, ttl));

        let eight_days_ago = now - one_day * 8;
        assert!(is_stale(eight_days_ago, now, ttl));
    }

    #[test]
    fn is_stale_with_future_modified_returns_false() {
        let now = SystemTime::now();
        let future = now + Duration::from_secs(60);
        assert!(!is_stale(future, now, Duration::from_secs(10)));
    }
}
