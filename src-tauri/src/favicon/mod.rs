pub mod cache;

use crate::errors::{AppError, AppResult};
use serde::Serialize;
use std::path::Path;
use std::sync::OnceLock;
use std::time::{Duration, SystemTime};
use ts_rs::TS;
use url::Url;

const TTL: Duration = Duration::from_secs(7 * 24 * 60 * 60);
const MAX_IMAGE_BYTES: usize = 512 * 1024;
/// Upper bound for the HTML window we scan for `<link rel="icon">`. Sites
/// that place the favicon link past this offset (huge inline scripts/preloads
/// at the top of `<head>`) silently fall through to the Google s2 fallback.
/// Bumping this trades memory and parse time for hit rate.
const HTML_PROBE_BYTES: usize = 64 * 1024;
const FETCH_TIMEOUT: Duration = Duration::from_secs(8);

#[derive(Debug, Clone, Serialize, TS, PartialEq, Eq)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub struct FaviconResult {
    /// Absolute path to the cached file. Frontend must use Tauri's
    /// `convertFileSrc` to render it inside the webview.
    pub local_path: String,
    pub mime: String,
}

/// Public entry point. Tries cache → `<origin>/favicon.ico` → HTML
/// `<link rel="icon">` → Google s2 fallback. Returns `Io { code:
/// "favicon_fetch" }` if every step fails.
pub async fn fetch_favicon(url: &str, base_dir: &Path) -> AppResult<FaviconResult> {
    let parsed = Url::parse(url).map_err(|e| {
        AppError::io(
            "favicon_parse",
            &[("reason", e.to_string()), ("url", url.to_string())],
        )
    })?;
    let cache_path = cache::cache_path_for(url, base_dir).ok_or_else(|| {
        // URL parsed above but yielded no host (e.g. `file:///`, `mailto:`),
        // so origin-keyed caching is undefined.
        AppError::io(
            "favicon_parse",
            &[("reason", "no_host".into()), ("url", url.to_string())],
        )
    })?;
    if let Some(hit) = read_cache_if_fresh(&cache_path) {
        return Ok(hit);
    }
    if let Some(parent) = cache_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    let (bytes, mime) = fetch_chain(&parsed)
        .await
        .ok_or_else(|| AppError::io("favicon_fetch", &[("url", url.to_string())]))?;
    std::fs::write(&cache_path, &bytes).map_err(|e| {
        AppError::io(
            "favicon_fetch",
            &[("reason", e.to_string()), ("url", url.to_string())],
        )
    })?;
    Ok(FaviconResult {
        local_path: cache_path.to_string_lossy().into_owned(),
        mime,
    })
}

fn read_cache_if_fresh(path: &Path) -> Option<FaviconResult> {
    let meta = std::fs::metadata(path).ok()?;
    let modified = meta.modified().ok()?;
    if cache::is_stale(modified, SystemTime::now(), TTL) {
        return None;
    }
    let bytes = std::fs::read(path).ok()?;
    let mime = detect_mime(&bytes).to_string();
    Some(FaviconResult {
        local_path: path.to_string_lossy().into_owned(),
        mime,
    })
}

async fn fetch_chain(page_url: &Url) -> Option<(Vec<u8>, String)> {
    if let Some(origin) = origin_url(page_url) {
        if let Ok(direct) = origin.join("/favicon.ico") {
            if let Some(hit) = try_get_image(&direct).await {
                return Some(hit);
            }
        }
    }
    if let Some(html) = try_get_html(page_url).await {
        if let Some(icon_url) = pick_icon_url(&html, page_url) {
            if let Some(hit) = try_get_image(&icon_url).await {
                return Some(hit);
            }
        }
    }
    if let Some(host) = page_url.host_str() {
        let s2 = format!("https://www.google.com/s2/favicons?domain={host}&sz=64");
        if let Ok(parsed) = Url::parse(&s2) {
            if let Some(hit) = try_get_image(&parsed).await {
                return Some(hit);
            }
        }
    }
    None
}

fn origin_url(u: &Url) -> Option<Url> {
    let host = u.host_str()?;
    let port = u.port().map(|p| format!(":{p}")).unwrap_or_default();
    Url::parse(&format!("{}://{}{}", u.scheme(), host, port)).ok()
}

fn http_client() -> &'static reqwest::Client {
    static C: OnceLock<reqwest::Client> = OnceLock::new();
    C.get_or_init(|| {
        reqwest::Client::builder()
            .user_agent("DonutTabs/1.0 favicon-fetcher")
            .timeout(FETCH_TIMEOUT)
            .redirect(reqwest::redirect::Policy::limited(5))
            .build()
            .expect("reqwest client init")
    })
}

async fn try_get_image(u: &Url) -> Option<(Vec<u8>, String)> {
    let resp = http_client().get(u.as_str()).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    // Reject hostile/oversized payloads before paying the download cost.
    // `content_length()` is advisory (servers may lie or omit it), so we
    // re-check after `bytes()` below.
    if let Some(len) = resp.content_length() {
        if len > MAX_IMAGE_BYTES as u64 {
            return None;
        }
    }
    let bytes = resp.bytes().await.ok()?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return None;
    }
    let v = bytes.to_vec();
    let mime = detect_mime(&v);
    if mime == "application/octet-stream" {
        return None;
    }
    Some((v, mime.to_string()))
}

async fn try_get_html(u: &Url) -> Option<String> {
    let resp = http_client().get(u.as_str()).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let bytes = resp.bytes().await.ok()?;
    let take = bytes.len().min(HTML_PROBE_BYTES);
    Some(String::from_utf8_lossy(&bytes[..take]).into_owned())
}

/// Scans `html` for `<link rel="icon|shortcut icon|apple-touch-icon" href>`
/// and returns the highest-priority match resolved against `page_url`
/// (apple-touch-icon > shortcut > icon).
pub fn pick_icon_url(html: &str, page_url: &Url) -> Option<Url> {
    let re = link_re();
    let mut best: Option<(u32, Url)> = None;
    for cap in re.captures_iter(html) {
        let attrs = match cap.get(1) {
            Some(m) => m.as_str(),
            None => continue,
        };
        let Some(rel) = attr_value(attrs, "rel") else {
            continue;
        };
        let rel_lc = rel.to_ascii_lowercase();
        let Some(prio) = rel_priority(&rel_lc) else {
            continue;
        };
        let Some(href) = attr_value(attrs, "href") else {
            continue;
        };
        let resolved = match page_url.join(&href) {
            Ok(u) => u,
            Err(_) => continue,
        };
        if best.as_ref().map(|(p, _)| prio > *p).unwrap_or(true) {
            best = Some((prio, resolved));
        }
    }
    best.map(|(_, u)| u)
}

fn link_re() -> &'static regex::Regex {
    static R: OnceLock<regex::Regex> = OnceLock::new();
    R.get_or_init(|| regex::Regex::new(r"(?is)<link\b([^>]*)>").unwrap())
}

fn rel_priority(rel_lc: &str) -> Option<u32> {
    let mut prio = None;
    for token in rel_lc.split_whitespace() {
        let p = match token {
            "apple-touch-icon" => 3,
            "shortcut" => 2,
            "icon" => 1,
            _ => continue,
        };
        if prio.map(|cur| p > cur).unwrap_or(true) {
            prio = Some(p);
        }
    }
    prio
}

fn attr_value(attrs: &str, name: &str) -> Option<String> {
    let bytes = attrs.as_bytes();
    let needle = name.as_bytes();
    let mut i = 0usize;
    while i + needle.len() <= bytes.len() {
        let slice_lc_eq = bytes[i..i + needle.len()]
            .iter()
            .zip(needle)
            .all(|(b, n)| b.eq_ignore_ascii_case(n));
        let before_ok = i == 0 || is_attr_boundary(bytes[i - 1]);
        if slice_lc_eq && before_ok {
            let mut j = i + needle.len();
            while j < bytes.len() && matches!(bytes[j], b' ' | b'\t' | b'\n' | b'\r') {
                j += 1;
            }
            if j < bytes.len() && bytes[j] == b'=' {
                j += 1;
                while j < bytes.len() && matches!(bytes[j], b' ' | b'\t' | b'\n' | b'\r') {
                    j += 1;
                }
                if j >= bytes.len() {
                    return None;
                }
                let q = bytes[j];
                if q == b'"' || q == b'\'' {
                    let start = j + 1;
                    return attrs[start..]
                        .find(q as char)
                        .map(|end_rel| attrs[start..start + end_rel].to_string());
                }
                let start = j;
                let end = attrs[start..]
                    .find(|c: char| c.is_whitespace() || c == '>')
                    .map(|e| start + e)
                    .unwrap_or(attrs.len());
                return Some(attrs[start..end].to_string());
            }
        }
        i += 1;
    }
    None
}

fn is_attr_boundary(b: u8) -> bool {
    matches!(b, b' ' | b'\t' | b'\n' | b'\r' | b'/')
}

/// Magic-byte sniffer. Returns `application/octet-stream` for unknown types
/// so callers can reject non-image responses.
pub fn detect_mime(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]) {
        "image/png"
    } else if bytes.starts_with(&[0x00, 0x00, 0x01, 0x00]) {
        "image/x-icon"
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "image/jpeg"
    } else if bytes.starts_with(b"GIF8") {
        "image/gif"
    } else if has_svg_signature(bytes) {
        "image/svg+xml"
    } else if bytes.len() >= 12
        && bytes.starts_with(&[0x52, 0x49, 0x46, 0x46])
        && &bytes[8..12] == b"WEBP"
    {
        "image/webp"
    } else {
        "application/octet-stream"
    }
}

/// Recognises SVG payloads even when they begin with whitespace or a UTF-8 BOM
/// before `<?xml ?>` / `<svg`.
fn has_svg_signature(bytes: &[u8]) -> bool {
    let stripped = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]).unwrap_or(bytes);
    let trimmed = trim_ascii_left(stripped);
    trimmed.starts_with(b"<?xml") || trimmed.starts_with(b"<svg") || trimmed.starts_with(b"<SVG")
}

fn trim_ascii_left(bytes: &[u8]) -> &[u8] {
    let mut i = 0;
    while i < bytes.len() && matches!(bytes[i], b' ' | b'\t' | b'\n' | b'\r') {
        i += 1;
    }
    &bytes[i..]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pick_icon_url_finds_icon_link() {
        let html = r#"<html><head><link rel="icon" href="/fav.png"></head></html>"#;
        let page = Url::parse("https://example.com/some/path").unwrap();
        let got = pick_icon_url(html, &page).unwrap();
        assert_eq!(got.as_str(), "https://example.com/fav.png");
    }

    #[test]
    fn pick_icon_url_prefers_apple_touch_icon() {
        let html = r#"
            <link rel="icon" href="/fav.ico">
            <link rel="apple-touch-icon" href="/apple.png">
            <link rel="stylesheet" href="/x.css">
        "#;
        let page = Url::parse("https://example.com/").unwrap();
        let got = pick_icon_url(html, &page).unwrap();
        assert_eq!(got.path(), "/apple.png");
    }

    #[test]
    fn pick_icon_url_handles_shortcut_and_relative_href() {
        let html = r#"<link rel="shortcut icon" href="img/foo.ico">"#;
        let page = Url::parse("https://example.com/blog/post").unwrap();
        let got = pick_icon_url(html, &page).unwrap();
        assert_eq!(got.as_str(), "https://example.com/blog/img/foo.ico");
    }

    #[test]
    fn pick_icon_url_accepts_single_quotes_and_uppercase() {
        let html = r#"<LINK REL='ICON' HREF='/fav.svg'>"#;
        let page = Url::parse("https://example.com/").unwrap();
        let got = pick_icon_url(html, &page).unwrap();
        assert_eq!(got.path(), "/fav.svg");
    }

    #[test]
    fn pick_icon_url_returns_none_when_no_icon_link() {
        let html = r#"<html><head><link rel="stylesheet" href="x.css"></head></html>"#;
        let page = Url::parse("https://example.com/").unwrap();
        assert!(pick_icon_url(html, &page).is_none());
    }

    #[test]
    fn detect_mime_recognizes_known_types() {
        assert_eq!(detect_mime(&[0x89, 0x50, 0x4E, 0x47, 0xAA]), "image/png");
        assert_eq!(detect_mime(&[0x00, 0x00, 0x01, 0x00, 0x10]), "image/x-icon");
        assert_eq!(detect_mime(&[0xFF, 0xD8, 0xFF, 0xE0]), "image/jpeg");
        assert_eq!(detect_mime(b"<svg xmlns=\"...\""), "image/svg+xml");
        assert_eq!(detect_mime(b"GIF89a"), "image/gif");
        assert_eq!(
            detect_mime(&[b'R', b'I', b'F', b'F', 0, 0, 0, 0, b'W', b'E', b'B', b'P']),
            "image/webp"
        );
        assert_eq!(detect_mime(b"???"), "application/octet-stream");
    }

    #[test]
    fn detect_mime_recognizes_svg_with_leading_whitespace_and_bom() {
        assert_eq!(detect_mime(b"  \n<svg></svg>"), "image/svg+xml");
        assert_eq!(
            detect_mime(b"\r\n\t<?xml version=\"1.0\"?>"),
            "image/svg+xml"
        );
        let mut with_bom = vec![0xEF, 0xBB, 0xBF];
        with_bom.extend_from_slice(b"<svg></svg>");
        assert_eq!(detect_mime(&with_bom), "image/svg+xml");
    }
}
