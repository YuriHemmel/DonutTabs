//! Plano 24 — implementação Windows de `try_focus_app`. URLs ficam pra Fase 2.
//!
//! Estratégia: enumera todas as top-level windows visíveis, resolve o
//! process owner via `GetWindowThreadProcessId` + `OpenProcess` +
//! `GetModuleBaseNameW`, e ativa a primeira janela cujo process basename
//! casa (case-insensitive, ignorando `.exe`) com `name`.
//!
//! Falhas de FFI são tratadas como "não focou" — caller cai no spawn
//! normal. Best-effort end-to-end.

#![cfg_attr(not(target_os = "windows"), allow(dead_code))]

/// Normaliza o `name` que o user salvou (vem de `Item::App.name`) pra
/// comparar com `process basename`. Strip path, strip `.exe`,
/// lowercase. Pure helper — testável em qualquer SO. Por isso o split
/// é manual (`Path::new` em macOS/Linux não reconhece `\` como
/// separador, e queremos suportar ambos).
pub fn normalize_app_name(input: &str) -> String {
    let trimmed = input.trim();
    let base = trimmed.rsplit(['\\', '/']).next().unwrap_or(trimmed);
    let lower = base.to_lowercase();
    lower
        .strip_suffix(".exe")
        .map(str::to_string)
        .unwrap_or(lower)
}

/// `true` quando duas strings normalizadas são equivalentes pra fins de
/// match. Wrapper trivial pra deixar o call-site auto-explicativo e
/// permitir evoluir o critério (ex: prefix match) sem caçar call sites.
pub fn app_names_match(a: &str, b: &str) -> bool {
    normalize_app_name(a) == normalize_app_name(b)
}

#[cfg(target_os = "windows")]
mod imp {
    use super::*;
    use std::cell::RefCell;
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use windows_sys::Win32::Foundation::{BOOL, FALSE, HMODULE, HWND, LPARAM, MAX_PATH, TRUE};
    use windows_sys::Win32::System::ProcessStatus::GetModuleBaseNameW;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_VM_READ,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, IsWindowVisible, SetForegroundWindow, ShowWindow,
        SW_RESTORE,
    };

    thread_local! {
        /// Buffer de coleta usado pelo callback do EnumWindows. RefCell
        /// permite mutação dentro do callback `extern "system"` sem
        /// passar pointer/dropping a sanidade.
        static MATCH: RefCell<MatchState> = const { RefCell::new(MatchState::new()) };
    }

    struct MatchState {
        target: String,
        found: Option<HWND>,
    }

    impl MatchState {
        const fn new() -> Self {
            Self {
                target: String::new(),
                found: None,
            }
        }
    }

    fn process_name_of(pid: u32) -> Option<String> {
        unsafe {
            let handle = OpenProcess(
                PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ,
                FALSE,
                pid,
            );
            if handle.is_null() {
                return None;
            }
            let mut buf = [0u16; MAX_PATH as usize];
            let len = GetModuleBaseNameW(
                handle,
                std::ptr::null_mut::<HMODULE>().cast(),
                buf.as_mut_ptr(),
                buf.len() as u32,
            );
            windows_sys::Win32::Foundation::CloseHandle(handle);
            if len == 0 {
                return None;
            }
            let s = OsString::from_wide(&buf[..len as usize]);
            s.into_string().ok()
        }
    }

    extern "system" fn enum_proc(hwnd: HWND, _lparam: LPARAM) -> BOOL {
        unsafe {
            if IsWindowVisible(hwnd) == 0 {
                return TRUE;
            }
        }
        let mut pid: u32 = 0;
        unsafe {
            GetWindowThreadProcessId(hwnd, &mut pid);
        }
        if pid == 0 {
            return TRUE;
        }
        let Some(pname) = process_name_of(pid) else {
            return TRUE;
        };
        let normalized = normalize_app_name(&pname);
        let matched = MATCH.with(|m| {
            let mut m = m.borrow_mut();
            if normalized == m.target {
                m.found = Some(hwnd);
                true
            } else {
                false
            }
        });
        if matched {
            FALSE
        } else {
            TRUE
        }
    }

    pub fn try_focus_app(name: &str) -> Result<bool, String> {
        let target = normalize_app_name(name);
        if target.is_empty() {
            return Ok(false);
        }
        MATCH.with(|m| {
            let mut m = m.borrow_mut();
            m.target = target;
            m.found = None;
        });
        unsafe {
            // EnumWindows itera até o callback retornar FALSE ou esgotar.
            // Return value sendo 0 não é erro pra nós quando achamos um
            // match (callback FALSE estopa a iteração intencionalmente).
            EnumWindows(Some(enum_proc), 0);
        }
        let hwnd = MATCH.with(|m| m.borrow().found);
        let Some(hwnd) = hwnd else {
            return Ok(false);
        };
        unsafe {
            ShowWindow(hwnd, SW_RESTORE);
            SetForegroundWindow(hwnd);
        }
        Ok(true)
    }
}

#[cfg(target_os = "windows")]
pub use imp::try_focus_app;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_strips_exe_and_path_and_lowercases() {
        assert_eq!(normalize_app_name("Firefox.exe"), "firefox");
        assert_eq!(normalize_app_name("FIREFOX.EXE"), "firefox");
        assert_eq!(
            normalize_app_name(r"C:\Program Files\Mozilla Firefox\firefox.exe"),
            "firefox"
        );
        assert_eq!(normalize_app_name("  Code.exe  "), "code");
    }

    #[test]
    fn normalize_handles_app_without_extension() {
        assert_eq!(normalize_app_name("vscode"), "vscode");
        assert_eq!(normalize_app_name("VSCode"), "vscode");
    }

    #[test]
    fn matches_with_and_without_extension() {
        assert!(app_names_match("firefox", "Firefox.exe"));
        assert!(app_names_match(r"C:\Path\firefox.exe", "FIREFOX.EXE"));
        assert!(!app_names_match("firefox", "chrome"));
    }
}
