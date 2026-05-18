//! Windows: detecta navegador padrão via Win32 `AssocQueryStringW` (mesma
//! API que o Windows shell usa pra rotear URLs/arquivos). Cobre Store apps
//! e Default Apps Settings, ao contrário de leitura raw do registry
//! UserChoice (que pode estar dessincronizada).
//!
//! Fallback chain (caso AssocQueryStringW falhe):
//! 1. UserChoice ProgId → `HKCR/HKCU/HKLM\Software\Classes\<ProgId>\shell\open\command`.
//! 2. `SOFTWARE\Clients\StartMenuInternet` enum.

#![cfg_attr(not(target_os = "windows"), allow(dead_code))]

#[cfg(target_os = "windows")]
#[allow(clippy::upper_case_acronyms)]
mod ffi {
    use std::os::raw::c_uint;

    pub type DWORD = c_uint;
    pub type HRESULT = i32;

    pub const ASSOCSTR_EXECUTABLE: DWORD = 2;
    pub const ASSOCF_NONE: DWORD = 0;

    #[link(name = "shlwapi")]
    extern "system" {
        #[allow(non_snake_case)]
        pub fn AssocQueryStringW(
            flags: DWORD,
            assoc_str: DWORD,
            pszAssoc: *const u16,
            pszExtra: *const u16,
            pszOut: *mut u16,
            pcchOut: *mut DWORD,
        ) -> HRESULT;
    }
}

#[cfg(target_os = "windows")]
pub fn detect() -> Option<String> {
    // Primary: AssocQueryStringW resolve qual exe Windows shell usa pra
    // abrir HTML/URLs. Cobre Store apps + Default Apps Settings. Tenta
    // `.html` primeiro (mais confiável que protocol associations); cai pra
    // `http`/`https` se falhar.
    for assoc in [".html", "http", "https"] {
        if let Some(exe) = detect_via_assoc_query(assoc) {
            if !exe.trim().is_empty() {
                return Some(exe);
            }
        }
    }
    eprintln!("[default_browser] AssocQueryStringW failed for all assocs; falling back to UserChoice ProgId");
    detect_via_user_choice()
}

#[cfg(target_os = "windows")]
fn detect_via_assoc_query(assoc: &str) -> Option<String> {
    use ffi::*;
    let assoc_w: Vec<u16> = assoc.encode_utf16().chain([0u16]).collect();
    let mut size: DWORD = 260;
    let mut buf: Vec<u16> = vec![0; size as usize];
    let hr = unsafe {
        AssocQueryStringW(
            ASSOCF_NONE,
            ASSOCSTR_EXECUTABLE,
            assoc_w.as_ptr(),
            std::ptr::null(),
            buf.as_mut_ptr(),
            &mut size,
        )
    };
    if hr != 0 {
        eprintln!("[default_browser] AssocQueryStringW({assoc}) failed: HR={hr:#x}");
        return None;
    }
    let end = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
    let result = String::from_utf16(&buf[..end]).ok()?;
    eprintln!("[default_browser] AssocQueryStringW({assoc}) -> {result}");
    if result.trim().is_empty() {
        None
    } else {
        Some(result)
    }
}

#[cfg(target_os = "windows")]
fn detect_via_user_choice() -> Option<String> {
    use winreg::enums::{HKEY_CLASSES_ROOT, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let user_choice = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(
            "Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice",
        )
        .ok()?;
    let progid: String = user_choice.get_value("ProgId").ok()?;
    eprintln!("[default_browser] UserChoice ProgId={progid}");

    let candidates: [(winreg::HKEY, String); 3] = [
        (
            HKEY_CLASSES_ROOT,
            format!("{}\\shell\\open\\command", progid),
        ),
        (
            HKEY_CURRENT_USER,
            format!("Software\\Classes\\{}\\shell\\open\\command", progid),
        ),
        (
            HKEY_LOCAL_MACHINE,
            format!("Software\\Classes\\{}\\shell\\open\\command", progid),
        ),
    ];
    for (hive, path) in &candidates {
        if let Ok(cmd_key) = RegKey::predef(*hive).open_subkey(path) {
            if let Ok(cmd) = cmd_key.get_value::<String, _>("") {
                if let Some(exe) = parse_command_exe(&cmd) {
                    eprintln!("[default_browser] UserChoice resolved to {exe}");
                    return Some(exe);
                }
            }
        }
    }
    detect_via_start_menu_internet(Some(&progid))
}

#[cfg(target_os = "windows")]
fn detect_via_start_menu_internet(progid_hint: Option<&str>) -> Option<String> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
    use winreg::RegKey;

    let hint = progid_hint.map(normalize_loose);
    for hive in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let Ok(root) = RegKey::predef(hive).open_subkey("Software\\Clients\\StartMenuInternet")
        else {
            continue;
        };
        let children: Vec<String> = root.enum_keys().flatten().collect();
        if let Some(h) = hint.as_deref() {
            for name in &children {
                if normalize_loose(name) == h {
                    if let Some(exe) = read_command_from_client(&root, name) {
                        eprintln!("[default_browser] StartMenuInternet ProgId match: {exe}");
                        return Some(exe);
                    }
                }
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn read_command_from_client(root: &winreg::RegKey, client_name: &str) -> Option<String> {
    let cmd_path = format!("{}\\shell\\open\\command", client_name);
    let cmd_key = root.open_subkey(&cmd_path).ok()?;
    let cmd: String = cmd_key.get_value("").ok()?;
    parse_command_exe(&cmd)
}

#[cfg(not(target_os = "windows"))]
pub fn detect() -> Option<String> {
    None
}

/// Normaliza pra comparação loose: minúsculas + drop não-alfanuméricos.
/// `"Opera GXStable"` → `"operagxstable"`; `"Opera GX Stable"` →
/// `"operagxstable"`. Match positivo entre ProgId e ClientName.
fn normalize_loose(s: &str) -> String {
    s.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}

/// Helper puro: extrai o caminho do exe do registry `shell\open\command`
/// value. Formatos comuns:
/// - `"C:\\Program Files\\Firefox\\firefox.exe" "%1"` (quoted com espaços)
/// - `C:\\Path\\app.exe %1` (unquoted sem espaços)
/// - `C:\\Program Files\\Internet Explorer\\iexplore.exe` (unquoted com
///   espaços — IE registra assim; `split_whitespace` quebraria em `C:\\Program`)
///
/// Para o caso unquoted-com-espaços, busca substring `.exe` (case-insensitive)
/// e considera o path tudo até o fim do `.exe`. Cobre os 3 formatos sem
/// ambiguidade pra path windows.
pub(crate) fn parse_command_exe(cmd: &str) -> Option<String> {
    let cmd = cmd.trim();
    if cmd.is_empty() {
        return None;
    }
    if let Some(rest) = cmd.strip_prefix('"') {
        let end = rest.find('"')?;
        let token = &rest[..end];
        if token.is_empty() {
            return None;
        }
        return Some(token.to_string());
    }
    let lower = cmd.to_lowercase();
    if let Some(idx) = lower.find(".exe") {
        let end = idx + ".exe".len();
        let exe_path = cmd[..end].trim();
        if !exe_path.is_empty() {
            return Some(exe_path.to_string());
        }
    }
    let token = cmd.split_whitespace().next()?;
    if token.is_empty() {
        None
    } else {
        Some(token.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_quoted_path_with_spaces() {
        let cmd = "\"C:\\Program Files\\Firefox\\firefox.exe\" \"%1\"";
        assert_eq!(
            parse_command_exe(cmd).unwrap(),
            "C:\\Program Files\\Firefox\\firefox.exe"
        );
    }

    #[test]
    fn parses_unquoted_path() {
        let cmd = "C:\\App\\chrome.exe %1";
        assert_eq!(parse_command_exe(cmd).unwrap(), "C:\\App\\chrome.exe");
    }

    #[test]
    fn parses_unquoted_path_with_spaces() {
        let cmd = "C:\\Program Files\\Internet Explorer\\iexplore.exe";
        assert_eq!(
            parse_command_exe(cmd).unwrap(),
            "C:\\Program Files\\Internet Explorer\\iexplore.exe"
        );
    }

    #[test]
    fn parses_unquoted_path_with_spaces_and_placeholder() {
        let cmd = "C:\\Program Files\\Mozilla Firefox\\firefox.exe %1";
        assert_eq!(
            parse_command_exe(cmd).unwrap(),
            "C:\\Program Files\\Mozilla Firefox\\firefox.exe"
        );
    }

    #[test]
    fn rejects_empty_input() {
        assert!(parse_command_exe("").is_none());
        assert!(parse_command_exe("   ").is_none());
    }

    #[test]
    fn rejects_empty_quoted_token() {
        assert!(parse_command_exe("\"\" \"%1\"").is_none());
    }

    #[test]
    fn handles_quoted_without_args() {
        let cmd = "\"C:\\App\\chrome.exe\"";
        assert_eq!(parse_command_exe(cmd).unwrap(), "C:\\App\\chrome.exe");
    }

    #[test]
    fn normalize_loose_drops_spaces_and_lowercases() {
        assert_eq!(normalize_loose("Opera GX Stable"), "operagxstable");
        assert_eq!(normalize_loose("Opera GXStable"), "operagxstable");
        assert_eq!(normalize_loose("Mozilla Firefox-150"), "mozillafirefox150");
    }
}
