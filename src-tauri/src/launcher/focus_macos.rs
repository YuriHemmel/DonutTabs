//! Plano 24 — implementação macOS de `try_focus_app` / `try_focus_url`.
//!
//! Estratégia: AppleScript via `osascript -e <script>`. O dicionário de
//! eventos da Apple permite checar `is running` e iterar `windows`/`tabs`
//! em apps que expõem o objeto `tab` (Safari + família Chromium).
//!
//! URL match é `starts with` na URL completa: tolera query strings/hashes
//! adicionados pela página após o load (ex: configurada
//! "https://github.com" → matcha "https://github.com/").

#![cfg_attr(not(target_os = "macos"), allow(dead_code))]

/// Lista de browsers tentados quando nenhum preferred é dado, em ordem
/// de prevalência aproximada. Estritamente uma heurística — não bloqueia
/// nada se um browser não estiver instalado (AppleScript devolve
/// "not-found" silenciosamente).
pub const DEFAULT_BROWSER_CANDIDATES: &[&str] = &[
    "Google Chrome",
    "Safari",
    "Microsoft Edge",
    "Arc",
    "Brave Browser",
    "Vivaldi",
];

/// Resolve o nome do bundle macOS a partir do `open_with` salvo pelo user.
/// O launcher passa o valor exato do `Item::Url.open_with` — pode vir como
/// `"Google Chrome"`, `"chrome"`, `"Brave Browser"`, etc. Normalizamos
/// pra match case-insensitive com os candidatos conhecidos.
pub fn normalize_browser_hint(hint: &str) -> Option<&'static str> {
    let lower = hint.to_lowercase();
    // Match Edge primeiro (substring "edge" aparece como prefixo só nele).
    if lower.contains("edge") {
        return Some("Microsoft Edge");
    }
    if lower.contains("brave") {
        return Some("Brave Browser");
    }
    if lower.contains("vivaldi") {
        return Some("Vivaldi");
    }
    if lower.contains("arc") {
        return Some("Arc");
    }
    if lower.contains("chrome") || lower.contains("chromium") {
        return Some("Google Chrome");
    }
    if lower.contains("safari") {
        return Some("Safari");
    }
    None
}

/// `true` quando o browser usa a API Chromium AppleScript dictionary
/// (Chrome, Edge, Arc, Brave, Vivaldi compartilham o mesmo shape).
/// Safari tem API própria — ver `build_safari_focus_script`.
pub fn is_chromium_family(app_name: &str) -> bool {
    matches!(
        app_name,
        "Google Chrome" | "Microsoft Edge" | "Arc" | "Brave Browser" | "Vivaldi"
    )
}

/// Escapa aspas duplas e backslashes pra ficar safe dentro de um
/// AppleScript string literal (`"..."`). AppleScript usa `\"` e `\\`
/// como sequences de escape, igual Rust/C.
pub fn escape_applescript_string(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Gera AppleScript que procura uma aba com URL começando por `url` em
/// qualquer janela de `app_name` (família Chromium). Ativa a janela
/// correspondente, traz pro front e retorna `"focused"` ou `"not-found"`.
pub fn build_chromium_family_focus_script(url: &str, app_name: &str) -> String {
    let url = escape_applescript_string(url);
    let app = escape_applescript_string(app_name);
    format!(
        r#"tell application "{app}"
    if it is running then
        repeat with w in windows
            set i to 1
            repeat with t in tabs of w
                if URL of t starts with "{url}" then
                    set active tab index of w to i
                    set index of w to 1
                    activate
                    return "focused"
                end if
                set i to i + 1
            end repeat
        end repeat
    end if
    return "not-found"
end tell"#
    )
}

/// Gera AppleScript pra Safari. API difere: `current tab of window` e
/// `URL of tab` (sem `tabs of w` na mesma forma — Safari tem `tabs`
/// indexável mas o setter é `current tab`).
pub fn build_safari_focus_script(url: &str) -> String {
    let url = escape_applescript_string(url);
    format!(
        r#"tell application "Safari"
    if it is running then
        repeat with w in windows
            repeat with t in tabs of w
                if URL of t starts with "{url}" then
                    set current tab of w to t
                    set index of w to 1
                    activate
                    return "focused"
                end if
            end repeat
        end repeat
    end if
    return "not-found"
end tell"#
    )
}

/// AppleScript pra checar se um app está rodando E ativá-lo. Retorna
/// `"focused"` se ativou; `"not-running"` se app não está aberto.
pub fn build_app_focus_script(app_name: &str) -> String {
    let app = escape_applescript_string(app_name);
    format!(
        r#"tell application "{app}"
    if it is running then
        activate
        return "focused"
    end if
    return "not-running"
end tell"#
    )
}

#[cfg(target_os = "macos")]
fn run_osascript(script: &str) -> Result<String, String> {
    use std::process::Command;
    let out = Command::new("osascript")
        .args(["-e", script])
        .output()
        .map_err(|e| format!("osascript spawn failed: {e}"))?;
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

#[cfg(target_os = "macos")]
pub fn try_focus_app(name: &str) -> Result<bool, String> {
    let script = build_app_focus_script(name);
    let out = run_osascript(&script)?;
    Ok(out == "focused")
}

#[cfg(target_os = "macos")]
pub fn try_focus_url(url: &str, preferred_browser: Option<&str>) -> Result<bool, String> {
    // Ordem: preferred normalizado primeiro; depois os candidatos default
    // sem repetir o preferred.
    let preferred = preferred_browser.and_then(normalize_browser_hint);
    let mut order: Vec<&'static str> = Vec::with_capacity(DEFAULT_BROWSER_CANDIDATES.len() + 1);
    if let Some(p) = preferred {
        order.push(p);
    }
    for cand in DEFAULT_BROWSER_CANDIDATES {
        if Some(*cand) != preferred {
            order.push(cand);
        }
    }
    for app in order {
        let script = if app == "Safari" {
            build_safari_focus_script(url)
        } else if is_chromium_family(app) {
            build_chromium_family_focus_script(url, app)
        } else {
            continue;
        };
        match run_osascript(&script) {
            Ok(out) if out == "focused" => return Ok(true),
            Ok(_) => continue, // not-found / app não está rodando
            Err(e) => {
                // App não instalado retorna erro do osascript; logamos e
                // seguimos pro próximo candidato — best-effort.
                eprintln!("[focus_macos] osascript {app} falhou: {e}");
                continue;
            }
        }
    }
    Ok(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chromium_script_contains_app_and_url() {
        let s = build_chromium_family_focus_script("https://example.com", "Google Chrome");
        assert!(s.contains(r#"tell application "Google Chrome""#));
        assert!(s.contains(r#"starts with "https://example.com""#));
        assert!(s.contains("set active tab index of w"));
    }

    #[test]
    fn safari_script_uses_current_tab() {
        let s = build_safari_focus_script("https://x.test");
        assert!(s.contains(r#"tell application "Safari""#));
        assert!(s.contains("set current tab of w to t"));
        assert!(s.contains(r#"starts with "https://x.test""#));
    }

    #[test]
    fn applescript_string_escapes_quotes_and_backslashes() {
        assert_eq!(escape_applescript_string("a\"b"), "a\\\"b");
        assert_eq!(escape_applescript_string("c\\d"), "c\\\\d");
        // Combinação: backslash deve ser escapado primeiro pra não
        // duplicar o escape da aspa.
        assert_eq!(escape_applescript_string("\\\""), "\\\\\\\"");
    }

    #[test]
    fn url_with_quotes_is_safely_embedded() {
        let s = build_chromium_family_focus_script("https://x?q=\"a\"", "Google Chrome");
        // Não deve quebrar o literal AppleScript com aspas cruas.
        assert!(s.contains("https://x?q=\\\"a\\\""));
    }

    #[test]
    fn normalize_browser_hint_recognizes_common_inputs() {
        assert_eq!(
            normalize_browser_hint("Google Chrome"),
            Some("Google Chrome")
        );
        assert_eq!(normalize_browser_hint("chrome"), Some("Google Chrome"));
        assert_eq!(normalize_browser_hint("CHROMIUM"), Some("Google Chrome"));
        assert_eq!(normalize_browser_hint("Safari"), Some("Safari"));
        assert_eq!(
            normalize_browser_hint("Microsoft Edge"),
            Some("Microsoft Edge")
        );
        assert_eq!(normalize_browser_hint("brave"), Some("Brave Browser"));
        assert_eq!(normalize_browser_hint("Arc"), Some("Arc"));
        assert_eq!(normalize_browser_hint("vivaldi"), Some("Vivaldi"));
        assert_eq!(normalize_browser_hint("firefox"), None);
        assert_eq!(normalize_browser_hint(""), None);
    }

    #[test]
    fn chromium_family_recognizes_known_browsers() {
        assert!(is_chromium_family("Google Chrome"));
        assert!(is_chromium_family("Microsoft Edge"));
        assert!(is_chromium_family("Arc"));
        assert!(is_chromium_family("Brave Browser"));
        assert!(is_chromium_family("Vivaldi"));
        assert!(!is_chromium_family("Safari"));
        assert!(!is_chromium_family("Firefox"));
    }

    #[test]
    fn app_focus_script_contains_name_and_activate() {
        let s = build_app_focus_script("Visual Studio Code");
        assert!(s.contains(r#"tell application "Visual Studio Code""#));
        assert!(s.contains("activate"));
        assert!(s.contains("is running"));
    }
}
