use super::schema::*;
use crate::errors::{AppError, AppResult};

/// Retorna `Ok(())` se a config é semanticamente válida.
/// Retorna `Err(AppError::Config { code, context })` com o primeiro erro encontrado.
pub fn validate(config: &Config) -> AppResult<()> {
    if !(4..=8).contains(&config.pagination.items_per_page) {
        return Err(AppError::config(
            "items_per_page_out_of_range",
            &[("got", config.pagination.items_per_page.to_string())],
        ));
    }

    if config.interaction.hover_hold_ms == 0 {
        return Err(AppError::config("hover_hold_ms_zero", &[]));
    }

    for tab in &config.tabs {
        let has_name = tab
            .name
            .as_ref()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
        let has_icon = tab
            .icon
            .as_ref()
            .map(|s| !s.trim().is_empty())
            .unwrap_or(false);
        if !has_name && !has_icon {
            return Err(AppError::config(
                "tab_missing_name_and_icon",
                &[("id", tab.id.to_string())],
            ));
        }
    }

    for tab in &config.tabs {
        for item in &tab.items {
            match item {
                Item::Url { value } => {
                    url::Url::parse(value).map_err(|e| {
                        AppError::config(
                            "invalid_url",
                            &[("tabId", tab.id.to_string()), ("reason", e.to_string())],
                        )
                    })?;
                }
            }
        }
    }

    let mut seen = std::collections::HashSet::new();
    for tab in &config.tabs {
        if !seen.insert(tab.id) {
            return Err(AppError::config(
                "duplicate_tab_id",
                &[("id", tab.id.to_string())],
            ));
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn tab_with(name: Option<&str>, icon: Option<&str>, items: Vec<Item>) -> Tab {
        Tab {
            id: Uuid::new_v4(),
            name: name.map(String::from),
            icon: icon.map(String::from),
            order: 0,
            open_mode: OpenMode::ReuseOrNewWindow,
            items,
        }
    }

    fn base_config() -> Config {
        Config::default()
    }

    fn assert_config_code(err: AppError, expected_code: &str) {
        match err {
            AppError::Config { code, .. } => assert_eq!(code, expected_code),
            other => panic!("expected Config error with code {expected_code}, got {other:?}"),
        }
    }

    #[test]
    fn default_is_valid() {
        assert!(validate(&base_config()).is_ok());
    }

    #[test]
    fn tab_with_only_name_is_valid() {
        let mut cfg = base_config();
        cfg.tabs.push(tab_with(Some("Trabalho"), None, vec![]));
        assert!(validate(&cfg).is_ok());
    }

    #[test]
    fn tab_with_only_icon_is_valid() {
        let mut cfg = base_config();
        cfg.tabs.push(tab_with(None, Some("💼"), vec![]));
        assert!(validate(&cfg).is_ok());
    }

    #[test]
    fn tab_without_name_or_icon_is_invalid() {
        let mut cfg = base_config();
        cfg.tabs.push(tab_with(None, None, vec![]));
        assert_config_code(validate(&cfg).unwrap_err(), "tab_missing_name_and_icon");
    }

    #[test]
    fn tab_with_empty_strings_is_invalid() {
        let mut cfg = base_config();
        cfg.tabs.push(tab_with(Some(""), Some("   "), vec![]));
        assert_config_code(validate(&cfg).unwrap_err(), "tab_missing_name_and_icon");
    }

    #[test]
    fn items_per_page_out_of_range_is_invalid() {
        let mut cfg = base_config();
        cfg.pagination.items_per_page = 3;
        match validate(&cfg).unwrap_err() {
            AppError::Config { code, context } => {
                assert_eq!(code, "items_per_page_out_of_range");
                assert_eq!(context.get("got").map(String::as_str), Some("3"));
            }
            other => panic!("expected Config error, got {other:?}"),
        }

        cfg.pagination.items_per_page = 9;
        assert_config_code(validate(&cfg).unwrap_err(), "items_per_page_out_of_range");
    }

    #[test]
    fn invalid_url_is_rejected() {
        let mut cfg = base_config();
        cfg.tabs.push(tab_with(
            Some("X"),
            None,
            vec![Item::Url {
                value: "not a url".into(),
            }],
        ));
        match validate(&cfg).unwrap_err() {
            AppError::Config { code, context } => {
                assert_eq!(code, "invalid_url");
                assert!(context.contains_key("tabId"));
                assert!(context.contains_key("reason"));
            }
            other => panic!("expected Config error, got {other:?}"),
        }
    }

    #[test]
    fn duplicate_ids_are_rejected() {
        let mut cfg = base_config();
        let id = Uuid::new_v4();
        let mut t1 = tab_with(Some("A"), None, vec![]);
        t1.id = id;
        let mut t2 = tab_with(Some("B"), None, vec![]);
        t2.id = id;
        cfg.tabs.push(t1);
        cfg.tabs.push(t2);
        match validate(&cfg).unwrap_err() {
            AppError::Config { code, context } => {
                assert_eq!(code, "duplicate_tab_id");
                assert_eq!(
                    context.get("id").map(String::as_str),
                    Some(id.to_string().as_str())
                );
            }
            other => panic!("expected Config error, got {other:?}"),
        }
    }
}
