//! Plano 24 — implementação macOS de `try_focus_app` / `try_focus_url`.
//!
//! Estratégia: AppleScript via `osascript -e <script>`. O dicionário de
//! eventos da Apple permite checar `is running` e iterar `windows`/`tabs`
//! em apps que expõem o objeto `tab` (Safari + família Chromium).
//!
//! URL match é `starts with` na URL completa: tolera query strings/hashes
//! adicionados pela página após o load (ex: configurada
//! "https://github.com" → matcha "https://github.com/").
//!
//! Performance: `try_focus_url` empacota TODOS os browsers candidatos em
//! **um único** script AppleScript com `try / end try` por browser. Spawn
//! do `osascript` custa ~100-300ms por chamada — varrer 6 browsers em
//! loop sequencial daria 1-2s no pior caso. Script combinado paga o boot
//! uma vez só e roda os `tell application` em ms.

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

/// Bloco `tell application` (família Chromium) que procura uma aba cuja
/// URL começa com `url_escaped` e, se achar, ativa + retorna `"focused"`
/// do script todo. **Pré-escapado** — caller deve passar via
/// `escape_applescript_string`. Sem `return` no caminho "não-achou":
/// quando o block é encadeado com outros browsers, queremos cair na
/// próxima tentativa.
fn chromium_tell_block(url_escaped: &str, app_escaped: &str) -> String {
    format!(
        r#"tell application "{app_escaped}"
    if it is running then
        repeat with w in windows
            set i to 1
            repeat with t in tabs of w
                if URL of t starts with "{url_escaped}" then
                    set active tab index of w to i
                    set index of w to 1
                    activate
                    return "focused"
                end if
                set i to i + 1
            end repeat
        end repeat
    end if
end tell"#
    )
}

/// Bloco `tell application` pra Safari. API difere: `current tab of window`
/// e `URL of tab` (sem `tabs of w` na mesma forma — Safari tem `tabs`
/// indexável mas o setter é `current tab`).
fn safari_tell_block(url_escaped: &str) -> String {
    format!(
        r#"tell application "Safari"
    if it is running then
        repeat with w in windows
            repeat with t in tabs of w
                if URL of t starts with "{url_escaped}" then
                    set current tab of w to t
                    set index of w to 1
                    activate
                    return "focused"
                end if
            end repeat
        end repeat
    end if
end tell"#
    )
}

/// Gera **um único** AppleScript que tenta focar a URL em cada browser de
/// `ordered_browsers` na ordem dada. Cada bloco é envolto em `try / end
/// try` pra que app não-instalado não interrompa a tentativa nos demais.
/// Retorna `"focused"` no primeiro match ou `"not-found"` se nenhum
/// browser tem a URL aberta. Substitui o loop antigo de N spawns de
/// `osascript` por 1 spawn só (ver `//!` no header pra justificativa).
pub fn build_combined_url_focus_script(url: &str, ordered_browsers: &[&str]) -> String {
    let url_escaped = escape_applescript_string(url);
    let mut script = String::new();
    for app in ordered_browsers {
        let app_escaped = escape_applescript_string(app);
        let block = if *app == "Safari" {
            safari_tell_block(&url_escaped)
        } else if is_chromium_family(app) {
            chromium_tell_block(&url_escaped, &app_escaped)
        } else {
            continue;
        };
        script.push_str("try\n");
        script.push_str(&block);
        script.push_str("\nend try\n");
    }
    script.push_str("return \"not-found\"");
    script
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

/// Resolve a ordem final de browsers a tentar: preferred primeiro (se
/// reconhecido), seguido pelos defaults sem repetir o preferred. Pure
/// helper pra deixar `try_focus_url` testável sem rodar osascript.
pub fn resolve_browser_order(preferred_browser: Option<&str>) -> Vec<&'static str> {
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
    order
}

#[cfg(target_os = "macos")]
pub fn try_focus_url(url: &str, preferred_browser: Option<&str>) -> Result<bool, String> {
    // Single-spawn: empacota todos os browsers em um script só. Sem o
    // refator, cada browser custava 1 boot de osascript (~100-300ms);
    // a chamada com 6 candidatos podia gastar 1-2s no pior caso.
    let order = resolve_browser_order(preferred_browser);
    let script = build_combined_url_focus_script(url, &order);
    match run_osascript(&script) {
        Ok(out) => Ok(out == "focused"),
        Err(e) => {
            eprintln!("[focus_macos] osascript falhou: {e}");
            Ok(false)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn combined_script_includes_chromium_block_with_app_and_url() {
        let s =
            build_combined_url_focus_script("https://example.com", &["Google Chrome", "Safari"]);
        assert!(s.contains(r#"tell application "Google Chrome""#));
        assert!(s.contains(r#"starts with "https://example.com""#));
        assert!(s.contains("set active tab index of w"));
    }

    #[test]
    fn combined_script_includes_safari_block_with_current_tab() {
        let s = build_combined_url_focus_script("https://x.test", &["Safari"]);
        assert!(s.contains(r#"tell application "Safari""#));
        assert!(s.contains("set current tab of w to t"));
        assert!(s.contains(r#"starts with "https://x.test""#));
    }

    #[test]
    fn combined_script_wraps_each_browser_in_try_block() {
        // Cada browser precisa ter `try / end try` pra que app não-instalado
        // não interrompa as tentativas dos demais. Conta de blocos = nº de
        // browsers reconhecidos passados. (Conta `end try` em vez de `try\n`
        // pra evitar overlap com `end try\n`.)
        let s = build_combined_url_focus_script(
            "https://x.test",
            &["Google Chrome", "Safari", "Microsoft Edge"],
        );
        assert_eq!(s.matches("end try").count(), 3);
    }

    #[test]
    fn combined_script_ends_with_not_found_fallback() {
        let s = build_combined_url_focus_script("https://x", &["Safari"]);
        assert!(s.trim_end().ends_with(r#"return "not-found""#));
    }

    #[test]
    fn combined_script_skips_unknown_browsers() {
        // "Firefox" não está na família Chromium e não é Safari — deve ser
        // ignorado silenciosamente (Firefox não expõe abas via AppleScript).
        let s = build_combined_url_focus_script("https://x", &["Firefox", "Safari"]);
        assert!(!s.contains(r#"tell application "Firefox""#));
        assert!(s.contains(r#"tell application "Safari""#));
        // Apenas 1 bloco try (Safari), não 2.
        assert_eq!(s.matches("end try").count(), 1);
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
        let s = build_combined_url_focus_script("https://x?q=\"a\"", &["Google Chrome"]);
        // Não deve quebrar o literal AppleScript com aspas cruas.
        assert!(s.contains("https://x?q=\\\"a\\\""));
    }

    #[test]
    fn resolve_browser_order_places_preferred_first() {
        let order = resolve_browser_order(Some("Safari"));
        assert_eq!(order.first().copied(), Some("Safari"));
        // Safari aparece exatamente uma vez (não duplica nos defaults).
        assert_eq!(order.iter().filter(|b| **b == "Safari").count(), 1);
    }

    #[test]
    fn resolve_browser_order_without_preferred_uses_defaults() {
        let order = resolve_browser_order(None);
        assert_eq!(order, DEFAULT_BROWSER_CANDIDATES.to_vec());
    }

    #[test]
    fn resolve_browser_order_ignores_unknown_preferred() {
        // Firefox não é reconhecido como candidato suportado — cai nos
        // defaults sem ele aparecer.
        let order = resolve_browser_order(Some("Firefox"));
        assert_eq!(order, DEFAULT_BROWSER_CANDIDATES.to_vec());
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
