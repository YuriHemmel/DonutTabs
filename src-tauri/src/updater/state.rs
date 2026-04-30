use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Resumo de uma atualização disponível devolvido pelo plugin updater.
/// Frontend consome via comandos Tauri pra renderizar banner/notification.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub struct UpdateSummary {
    pub version: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
}

/// Decide se uma versão remota deve disparar a notificação OS-native no
/// startup. Igualdade strict (`!= last_notified`) — se o backend serve
/// uma versão diferente da última que avisamos (mesmo um rollback), o
/// usuário é notificado de novo. Comparação semver fica a cargo do
/// plugin updater (que decide se há update); este helper resolve só
/// "já avisei essa exata versão antes?".
pub fn should_notify(remote: &str, last_notified: Option<&str>) -> bool {
    match last_notified {
        None => true,
        Some(prev) => prev != remote,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_notify_when_no_prior_record() {
        assert!(should_notify("0.2.0", None));
    }

    #[test]
    fn should_notify_when_remote_differs_from_prior_record() {
        assert!(should_notify("0.2.1", Some("0.2.0")));
    }

    #[test]
    fn should_not_notify_when_remote_matches_prior_record() {
        assert!(!should_notify("0.2.0", Some("0.2.0")));
    }

    #[test]
    fn should_notify_when_remote_appears_to_regress() {
        // Hipotético rollback: gate ainda dispara porque versão é
        // diferente. Decidir se aceita o "downgrade" é responsabilidade
        // do plugin updater (ele rejeita).
        assert!(should_notify("0.1.9", Some("0.2.0")));
    }

    #[test]
    fn update_summary_serializes_with_camel_case() {
        let s = UpdateSummary {
            version: "0.2.0".into(),
            notes: Some("- bugfix".into()),
            date: Some("2026-04-29".into()),
        };
        let json = serde_json::to_string(&s).unwrap();
        assert!(json.contains("\"version\":\"0.2.0\""));
        assert!(json.contains("\"notes\":\"- bugfix\""));
        assert!(json.contains("\"date\":\"2026-04-29\""));
        let back: UpdateSummary = serde_json::from_str(&json).unwrap();
        assert_eq!(s, back);
    }

    #[test]
    fn update_summary_omits_optional_fields_when_none() {
        let s = UpdateSummary {
            version: "0.2.0".into(),
            notes: None,
            date: None,
        };
        let json = serde_json::to_string(&s).unwrap();
        assert!(!json.contains("notes"), "notes should be skipped: {json}");
        assert!(!json.contains("date"), "date should be skipped: {json}");
    }
}
