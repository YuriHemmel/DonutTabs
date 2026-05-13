//! macOS: detecta default browser via Launch Services
//! (`LSCopyDefaultApplicationURLForURL`). Retorna o nome do `.app` bundle
//! (e.g. `"Firefox"`) — formato que `open -na NAME --args ...` aceita pra
//! incognito spawn. Fallback: probe `/Applications/` por bundles conhecidos
//! quando Launch Services falhar (rare).

#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

#[cfg(target_os = "macos")]
pub fn detect() -> Option<String> {
    detect_via_launch_services()
        .or_else(|| probe_common_bundles(std::path::Path::new("/Applications")))
}

#[cfg(not(target_os = "macos"))]
pub fn detect() -> Option<String> {
    None
}

#[cfg(target_os = "macos")]
fn detect_via_launch_services() -> Option<String> {
    use core_foundation::base::TCFType;
    use core_foundation::string::CFString;
    use core_foundation::url::CFURL;
    use core_foundation_sys::base::{kCFAllocatorDefault, CFTypeRef};
    use core_foundation_sys::string::CFStringRef;
    use core_foundation_sys::url::CFURLRef;

    type LSRolesMask = u32;
    const K_LS_ROLES_ALL: LSRolesMask = 0xFFFF_FFFF;

    // CFURLCreateWithString fica em CoreFoundation framework. Linkado via crate
    // core-foundation. LSCopyDefaultApplicationURLForURL em CoreServices —
    // precisa link extra (não vem com core-foundation).
    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFURLCreateWithString(
            allocator: CFTypeRef,
            url_string: CFStringRef,
            base_url: CFURLRef,
        ) -> CFURLRef;
    }

    #[link(name = "CoreServices", kind = "framework")]
    extern "C" {
        fn LSCopyDefaultApplicationURLForURL(
            url: CFURLRef,
            in_role_mask: LSRolesMask,
            out_error: *mut CFTypeRef,
        ) -> CFURLRef;
    }

    // URL probe (`https://example.com`) — Launch Services usa o esquema
    // (`https`) pra encontrar o handler. Conteúdo após o esquema não importa.
    let url_str = CFString::new("https://example.com");
    let cf_url_raw = unsafe {
        CFURLCreateWithString(
            kCFAllocatorDefault as CFTypeRef,
            url_str.as_concrete_TypeRef(),
            std::ptr::null(),
        )
    };
    if cf_url_raw.is_null() {
        eprintln!("[default_browser] CFURLCreateWithString returned null");
        return None;
    }
    let cf_url = unsafe { CFURL::wrap_under_create_rule(cf_url_raw) };

    let mut err: CFTypeRef = std::ptr::null();
    let app_url_raw = unsafe {
        LSCopyDefaultApplicationURLForURL(cf_url.as_concrete_TypeRef(), K_LS_ROLES_ALL, &mut err)
    };
    if app_url_raw.is_null() {
        eprintln!("[default_browser] LSCopyDefaultApplicationURLForURL returned null");
        return None;
    }
    let app_url = unsafe { CFURL::wrap_under_create_rule(app_url_raw) };
    let path = app_url.get_string().to_string();
    eprintln!("[default_browser] LaunchServices default = {path}");
    extract_bundle_name(&path)
}

/// Helper puro: extrai o nome do bundle (`Firefox`) do path/URL de um
/// `.app`. Aceita ambos `file:///Applications/Firefox.app/` (CFURL string)
/// e `/Applications/Firefox.app` (POSIX path). Trim trailing `/` + strip
/// `.app` suffix.
pub(crate) fn extract_bundle_name(bundle_path: &str) -> Option<String> {
    let trimmed = bundle_path
        .trim_start_matches("file://")
        .trim_end_matches('/');
    let last = trimmed.rsplit('/').next()?;
    let name = last.strip_suffix(".app").unwrap_or(last);
    if name.is_empty() {
        None
    } else {
        Some(name.to_string())
    }
}

/// Fallback puro pra quando Launch Services falha. Probe `/Applications/`
/// por bundles comuns na ordem de preferência. Não é detecção real do
/// default — chute baseado em "qual navegador o user provavelmente tem".
pub(crate) fn probe_common_bundles(dir: &std::path::Path) -> Option<String> {
    const CANDIDATES: &[&str] = &[
        "Google Chrome",
        "Firefox",
        "Microsoft Edge",
        "Brave Browser",
        "Vivaldi",
        "Arc",
        "Opera",
        "Safari",
    ];
    for app in CANDIDATES {
        let bundle = dir.join(format!("{app}.app"));
        if bundle.exists() {
            return Some((*app).to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn extracts_bundle_name_from_file_url() {
        let s = "file:///Applications/Firefox.app/";
        assert_eq!(extract_bundle_name(s).unwrap(), "Firefox");
    }

    #[test]
    fn extracts_bundle_name_from_posix_path() {
        let s = "/Applications/Google Chrome.app";
        assert_eq!(extract_bundle_name(s).unwrap(), "Google Chrome");
    }

    #[test]
    fn extracts_bundle_name_from_path_with_trailing_slash() {
        let s = "/Applications/Safari.app/";
        assert_eq!(extract_bundle_name(s).unwrap(), "Safari");
    }

    #[test]
    fn extracts_bundle_name_keeps_dot_in_name() {
        let s = "/Applications/iA Writer.app";
        assert_eq!(extract_bundle_name(s).unwrap(), "iA Writer");
    }

    #[test]
    fn extracts_returns_none_for_empty_input() {
        assert!(extract_bundle_name("").is_none());
        assert!(extract_bundle_name("/").is_none());
    }

    #[test]
    fn probe_picks_first_existing_bundle_in_preference_order() {
        let dir = tempdir().unwrap();
        std::fs::create_dir(dir.path().join("Firefox.app")).unwrap();
        std::fs::create_dir(dir.path().join("Safari.app")).unwrap();
        assert_eq!(probe_common_bundles(dir.path()).unwrap(), "Firefox");
    }

    #[test]
    fn probe_returns_none_when_no_known_browser_present() {
        let dir = tempdir().unwrap();
        std::fs::create_dir(dir.path().join("RandomApp.app")).unwrap();
        assert!(probe_common_bundles(dir.path()).is_none());
    }

    #[test]
    fn probe_safari_only_returns_safari() {
        let dir = tempdir().unwrap();
        std::fs::create_dir(dir.path().join("Safari.app")).unwrap();
        assert_eq!(probe_common_bundles(dir.path()).unwrap(), "Safari");
    }

    #[test]
    fn probe_empty_dir_returns_none() {
        let dir = tempdir().unwrap();
        assert!(probe_common_bundles(dir.path()).is_none());
    }
}
