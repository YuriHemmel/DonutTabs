//! Plano 24 — implementação Linux de `try_focus_app`. URLs ficam pra Fase 2
//! (depende de extensão Chrome/Edge + native messaging host).
//!
//! Estratégia: delega pra `wmctrl -a <name>`. O `wmctrl` ativa a primeira
//! janela cujo título **contenha** `name` (substring case-insensitive).
//! `exit_code == 0` = ativou; `!= 0` = não encontrou. `wmctrl` ausente
//! retorna `Ok(false)` pra cair no fallback de spawn.
//!
//! Wayland sessions: `wmctrl` é X11-only. Em Wayland puro, o comando
//! falha; tratamos como "não focou" — caller cai no spawn normal, que
//! continua funcionando porque o app é spawnado via OS handler.

#![cfg_attr(not(target_os = "linux"), allow(dead_code))]

/// Normaliza o `name` removendo extensão e path (paridade com Windows).
/// `wmctrl -a` usa substring no título da janela, então isso só ajuda a
/// evitar passar `/usr/bin/firefox` (que falharia sempre). Split manual
/// pra funcionar em testes rodando em qualquer host.
pub fn normalize_app_name(input: &str) -> String {
    let trimmed = input.trim();
    let base = trimmed.rsplit(['/', '\\']).next().unwrap_or(trimmed);
    base.trim_end_matches(".AppImage").to_string()
}

#[cfg(target_os = "linux")]
pub fn try_focus_app(name: &str) -> Result<bool, String> {
    use std::process::Command;
    let normalized = normalize_app_name(name);
    let status = Command::new("wmctrl").args(["-a", &normalized]).status();
    match status {
        Ok(s) if s.success() => Ok(true),
        Ok(_) => Ok(false),
        // wmctrl ausente ou erro de spawn — cai no fallback.
        Err(e) => {
            eprintln!("[focus_linux] wmctrl indisponível ou falhou: {e}");
            Ok(false)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_strips_path_and_appimage_suffix() {
        assert_eq!(normalize_app_name("/usr/bin/firefox"), "firefox");
        assert_eq!(normalize_app_name("firefox"), "firefox");
        assert_eq!(
            normalize_app_name("/opt/Cursor/Cursor-1.0.0.AppImage"),
            "Cursor-1.0.0"
        );
        assert_eq!(normalize_app_name("  code  "), "code");
    }
}
