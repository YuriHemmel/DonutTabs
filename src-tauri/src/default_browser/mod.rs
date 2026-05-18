//! Detecção do navegador padrão do SO. Usado pelo launcher quando o item
//! URL está marcado como `incognito=true` mas o usuário escolheu "Padrão do
//! sistema" (`open_with=None`) — sem um navegador explícito não dá pra
//! determinar qual flag CLI usar pra modo anônimo.
//!
//! Cada SO tem ramo separado:
//! - Windows: registry `HKCU\...\UrlAssociations\https\UserChoice` →
//!   ProgId → `HKCR\<ProgId>\shell\open\command` → primeiro token quoted/
//!   unquoted = caminho do .exe.
//! - Linux: shell out `xdg-settings get default-web-browser` → nome do
//!   `.desktop` (e.g. `firefox.desktop`) → strip suffix.
//! - macOS: sem FFI Objective-C, faz probe em `/Applications/` por bundles
//!   comuns. Não é detecção real (LSCopyDefaultApplicationURL exige
//!   binding), mas pega o navegador provavelmente instalado.
//!
//! Returns `None` quando detecção falha — launcher cai pra abrir URL
//! normalmente (sem incognito) com log de warning.

pub mod linux;
pub mod macos;
pub mod windows;

/// Façade — delega ao ramo do SO. Returns `Some(browser_ref)` onde
/// `browser_ref` é o que deve ser passado ao `open_url_incognito`:
/// caminho absoluto (Windows), nome do binário (Linux), display name
/// do bundle (macOS).
pub fn detect() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        windows::detect()
    }
    #[cfg(target_os = "linux")]
    {
        linux::detect()
    }
    #[cfg(target_os = "macos")]
    {
        macos::detect()
    }
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        None
    }
}
