use serde::Serialize;
use std::collections::BTreeMap;
use thiserror::Error;

pub type ErrorContext = BTreeMap<String, String>;

#[derive(Debug, Clone, Error, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum AppError {
    #[error("config error: {code}")]
    Config {
        code: String,
        #[serde(default)]
        context: ErrorContext,
    },
    #[error("shortcut error: {code}")]
    Shortcut {
        code: String,
        #[serde(default)]
        context: ErrorContext,
    },
    #[error("launcher error: {code}")]
    Launcher {
        code: String,
        #[serde(default)]
        context: ErrorContext,
    },
    #[error("window error: {code}")]
    Window {
        code: String,
        #[serde(default)]
        context: ErrorContext,
    },
    #[error("io error: {code}")]
    Io {
        code: String,
        #[serde(default)]
        context: ErrorContext,
    },
    #[error("updater error: {code}")]
    Updater {
        code: String,
        #[serde(default)]
        context: ErrorContext,
    },
}

fn ctx(pairs: &[(&str, String)]) -> ErrorContext {
    pairs
        .iter()
        .map(|(k, v)| ((*k).to_string(), v.clone()))
        .collect()
}

impl AppError {
    pub fn config(code: impl Into<String>, pairs: &[(&str, String)]) -> Self {
        AppError::Config {
            code: code.into(),
            context: ctx(pairs),
        }
    }

    pub fn launcher(code: impl Into<String>, pairs: &[(&str, String)]) -> Self {
        AppError::Launcher {
            code: code.into(),
            context: ctx(pairs),
        }
    }

    pub fn window(code: impl Into<String>, pairs: &[(&str, String)]) -> Self {
        AppError::Window {
            code: code.into(),
            context: ctx(pairs),
        }
    }

    pub fn shortcut(code: impl Into<String>, pairs: &[(&str, String)]) -> Self {
        AppError::Shortcut {
            code: code.into(),
            context: ctx(pairs),
        }
    }

    pub fn io(code: impl Into<String>, pairs: &[(&str, String)]) -> Self {
        AppError::Io {
            code: code.into(),
            context: ctx(pairs),
        }
    }

    pub fn updater(code: impl Into<String>, pairs: &[(&str, String)]) -> Self {
        AppError::Updater {
            code: code.into(),
            context: ctx(pairs),
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io {
            code: "io_generic".into(),
            context: [("reason".to_string(), e.to_string())]
                .into_iter()
                .collect(),
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Config {
            code: "json_parse".into(),
            context: [("reason".to_string(), e.to_string())]
                .into_iter()
                .collect(),
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn config_error_serializes_with_code_and_context() {
        let err = AppError::config("items_per_page_out_of_range", &[("got", "99".to_string())]);
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("\"kind\":\"config\""));
        assert!(json.contains("\"code\":\"items_per_page_out_of_range\""));
        assert!(json.contains("\"got\":\"99\""));
    }

    #[test]
    fn launcher_error_with_empty_context() {
        let err = AppError::launcher("tab_not_found", &[]);
        let json = serde_json::to_string(&err).unwrap();
        assert!(json.contains("\"kind\":\"launcher\""));
        assert!(json.contains("\"code\":\"tab_not_found\""));
    }

    #[test]
    fn display_uses_code_as_fallback_text() {
        let err = AppError::config("hover_hold_ms_zero", &[]);
        assert!(format!("{err}").contains("hover_hold_ms_zero"));
    }

    #[test]
    fn io_error_conversion_captures_reason() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "boom");
        let app: AppError = io_err.into();
        match app {
            AppError::Io { code, context } => {
                assert_eq!(code, "io_generic");
                assert!(context.get("reason").is_some_and(|r| r.contains("boom")));
            }
            other => panic!("expected Io variant, got {other:?}"),
        }
    }

    #[test]
    fn serde_json_error_conversion_captures_reason() {
        let je = serde_json::from_str::<serde_json::Value>("not json").unwrap_err();
        let app: AppError = je.into();
        match app {
            AppError::Config { code, context } => {
                assert_eq!(code, "json_parse");
                assert!(context.contains_key("reason"));
            }
            other => panic!("expected Config variant, got {other:?}"),
        }
    }
}
