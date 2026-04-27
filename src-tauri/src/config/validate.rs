use super::schema::*;
use crate::errors::{AppError, AppResult};

/// Retorna `Ok(())` se a config v2 é semanticamente válida.
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

    if config.profiles.is_empty() {
        return Err(AppError::config("no_profiles", &[]));
    }

    if !config
        .profiles
        .iter()
        .any(|p| p.id == config.active_profile_id)
    {
        return Err(AppError::config(
            "active_profile_not_found",
            &[("activeProfileId", config.active_profile_id.to_string())],
        ));
    }

    let mut seen_profile_ids = std::collections::HashSet::new();
    for profile in &config.profiles {
        if !seen_profile_ids.insert(profile.id) {
            return Err(AppError::config(
                "duplicate_profile_id",
                &[("id", profile.id.to_string())],
            ));
        }
        if profile.name.trim().is_empty() {
            return Err(AppError::config(
                "profile_name_empty",
                &[("profileId", profile.id.to_string())],
            ));
        }
        if profile.shortcut.trim().is_empty() {
            return Err(AppError::config(
                "profile_shortcut_empty",
                &[("profileId", profile.id.to_string())],
            ));
        }
        validate_profile_tabs(profile)?;
    }

    Ok(())
}

fn validate_profile_tabs(profile: &Profile) -> AppResult<()> {
    for tab in &profile.tabs {
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
                &[
                    ("id", tab.id.to_string()),
                    ("profileId", profile.id.to_string()),
                ],
            ));
        }
    }

    for tab in &profile.tabs {
        for item in &tab.items {
            match item {
                Item::Url { value, .. } => {
                    url::Url::parse(value).map_err(|e| {
                        AppError::config(
                            "invalid_url",
                            &[
                                ("tabId", tab.id.to_string()),
                                ("profileId", profile.id.to_string()),
                                ("reason", e.to_string()),
                            ],
                        )
                    })?;
                }
                Item::File { path, .. } | Item::Folder { path, .. } => {
                    if path.trim().is_empty() {
                        return Err(AppError::config(
                            "path_empty",
                            &[
                                ("tabId", tab.id.to_string()),
                                ("profileId", profile.id.to_string()),
                                ("kind", item_kind_label(item).to_string()),
                            ],
                        ));
                    }
                }
            }
            if let Some(ow) = item_open_with(item) {
                if ow.trim().is_empty() {
                    return Err(AppError::config(
                        "open_with_empty",
                        &[
                            ("tabId", tab.id.to_string()),
                            ("profileId", profile.id.to_string()),
                            ("kind", item_kind_label(item).to_string()),
                        ],
                    ));
                }
            }
        }
    }

    let mut seen = std::collections::HashSet::new();
    for tab in &profile.tabs {
        if !seen.insert(tab.id) {
            return Err(AppError::config(
                "duplicate_tab_id",
                &[
                    ("id", tab.id.to_string()),
                    ("profileId", profile.id.to_string()),
                ],
            ));
        }
    }

    Ok(())
}

fn item_kind_label(item: &Item) -> &'static str {
    match item {
        Item::Url { .. } => "url",
        Item::File { .. } => "file",
        Item::Folder { .. } => "folder",
    }
}

fn item_open_with(item: &Item) -> Option<&str> {
    match item {
        Item::Url { open_with, .. }
        | Item::File { open_with, .. }
        | Item::Folder { open_with, .. } => open_with.as_deref(),
    }
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
    fn rejects_empty_profiles_array() {
        let mut cfg = base_config();
        cfg.profiles.clear();
        assert_config_code(validate(&cfg).unwrap_err(), "no_profiles");
    }

    #[test]
    fn rejects_active_profile_not_found() {
        let mut cfg = base_config();
        cfg.active_profile_id = Uuid::new_v4();
        assert_config_code(validate(&cfg).unwrap_err(), "active_profile_not_found");
    }

    #[test]
    fn rejects_profile_with_empty_name() {
        let mut cfg = base_config();
        cfg.profiles[0].name = "  ".into();
        assert_config_code(validate(&cfg).unwrap_err(), "profile_name_empty");
    }

    #[test]
    fn rejects_profile_with_empty_shortcut() {
        let mut cfg = base_config();
        cfg.profiles[0].shortcut = "".into();
        assert_config_code(validate(&cfg).unwrap_err(), "profile_shortcut_empty");
    }

    #[test]
    fn rejects_duplicate_profile_id() {
        let mut cfg = base_config();
        let p2 = Profile {
            id: cfg.profiles[0].id,
            ..Profile::default()
        };
        cfg.profiles.push(p2);
        assert_config_code(validate(&cfg).unwrap_err(), "duplicate_profile_id");
    }

    #[test]
    fn tab_without_name_or_icon_is_invalid() {
        let mut cfg = base_config();
        cfg.profiles[0].tabs.push(tab_with(None, None, vec![]));
        assert_config_code(validate(&cfg).unwrap_err(), "tab_missing_name_and_icon");
    }

    #[test]
    fn items_per_page_out_of_range_is_invalid() {
        let mut cfg = base_config();
        cfg.pagination.items_per_page = 3;
        assert_config_code(validate(&cfg).unwrap_err(), "items_per_page_out_of_range");
        cfg.pagination.items_per_page = 9;
        assert_config_code(validate(&cfg).unwrap_err(), "items_per_page_out_of_range");
    }

    #[test]
    fn invalid_url_is_rejected() {
        let mut cfg = base_config();
        cfg.profiles[0].tabs.push(tab_with(
            Some("X"),
            None,
            vec![Item::Url {
                value: "not a url".into(),
                open_with: None,
            }],
        ));
        match validate(&cfg).unwrap_err() {
            AppError::Config { code, context } => {
                assert_eq!(code, "invalid_url");
                assert!(context.contains_key("tabId"));
                assert!(context.contains_key("profileId"));
                assert!(context.contains_key("reason"));
            }
            other => panic!("expected Config error, got {other:?}"),
        }
    }

    #[test]
    fn duplicate_tab_id_within_profile_is_rejected() {
        let mut cfg = base_config();
        let id = Uuid::new_v4();
        let mut t1 = tab_with(Some("A"), None, vec![]);
        t1.id = id;
        let mut t2 = tab_with(Some("B"), None, vec![]);
        t2.id = id;
        cfg.profiles[0].tabs.push(t1);
        cfg.profiles[0].tabs.push(t2);
        assert_config_code(validate(&cfg).unwrap_err(), "duplicate_tab_id");
    }

    #[test]
    fn hover_hold_ms_zero_is_invalid() {
        let mut cfg = base_config();
        cfg.interaction.hover_hold_ms = 0;
        assert_config_code(validate(&cfg).unwrap_err(), "hover_hold_ms_zero");
    }

    #[test]
    fn file_item_with_non_empty_path_is_valid() {
        let mut cfg = base_config();
        cfg.profiles[0].tabs.push(tab_with(
            Some("F"),
            None,
            vec![Item::File {
                path: "C:/x.txt".into(),
                open_with: None,
            }],
        ));
        assert!(validate(&cfg).is_ok());
    }

    #[test]
    fn folder_item_with_non_empty_path_is_valid() {
        let mut cfg = base_config();
        cfg.profiles[0].tabs.push(tab_with(
            Some("D"),
            None,
            vec![Item::Folder {
                path: "/tmp".into(),
                open_with: None,
            }],
        ));
        assert!(validate(&cfg).is_ok());
    }

    #[test]
    fn file_item_with_empty_path_is_rejected() {
        let mut cfg = base_config();
        cfg.profiles[0].tabs.push(tab_with(
            Some("F"),
            None,
            vec![Item::File {
                path: "".into(),
                open_with: None,
            }],
        ));
        match validate(&cfg).unwrap_err() {
            AppError::Config { code, context } => {
                assert_eq!(code, "path_empty");
                assert_eq!(context.get("kind").map(String::as_str), Some("file"));
            }
            other => panic!("expected Config error, got {other:?}"),
        }
    }

    #[test]
    fn folder_item_with_whitespace_path_is_rejected() {
        let mut cfg = base_config();
        cfg.profiles[0].tabs.push(tab_with(
            Some("D"),
            None,
            vec![Item::Folder {
                path: "   ".into(),
                open_with: None,
            }],
        ));
        match validate(&cfg).unwrap_err() {
            AppError::Config { code, context } => {
                assert_eq!(code, "path_empty");
                assert_eq!(context.get("kind").map(String::as_str), Some("folder"));
            }
            other => panic!("expected Config error, got {other:?}"),
        }
    }

    #[test]
    fn mixed_url_file_folder_items_validate() {
        let mut cfg = base_config();
        cfg.profiles[0].tabs.push(tab_with(
            Some("Mix"),
            None,
            vec![
                Item::Url {
                    value: "https://a.test".into(),
                    open_with: None,
                },
                Item::File {
                    path: "/tmp/x".into(),
                    open_with: None,
                },
                Item::Folder {
                    path: "/tmp".into(),
                    open_with: None,
                },
            ],
        ));
        assert!(validate(&cfg).is_ok());
    }

    #[test]
    fn duplicate_tab_id_across_different_profiles_is_allowed() {
        // Contrato: dedup de tab.id é por-perfil. Mesmo UUID em perfis distintos
        // não é erro — é só improvável na prática (UUID v4).
        let mut cfg = base_config();
        let shared_tab_id = Uuid::new_v4();
        let mut t1 = tab_with(Some("A"), None, vec![]);
        t1.id = shared_tab_id;
        cfg.profiles[0].tabs.push(t1);

        let mut p2 = Profile {
            id: Uuid::new_v4(),
            name: "Outro".into(),
            icon: None,
            shortcut: "Ctrl+Alt+P".into(),
            theme: cfg.profiles[0].theme,
            tabs: vec![],
        };
        let mut t2 = tab_with(Some("B"), None, vec![]);
        t2.id = shared_tab_id;
        p2.tabs.push(t2);
        cfg.profiles.push(p2);

        assert!(validate(&cfg).is_ok());
    }

    #[test]
    fn open_with_some_non_empty_is_valid() {
        let mut cfg = base_config();
        cfg.profiles[0].tabs.push(tab_with(
            Some("Work"),
            None,
            vec![Item::Url {
                value: "https://work.test".into(),
                open_with: Some("firefox".into()),
            }],
        ));
        assert!(validate(&cfg).is_ok());
    }

    #[test]
    fn open_with_none_is_valid() {
        let mut cfg = base_config();
        cfg.profiles[0].tabs.push(tab_with(
            Some("Default"),
            None,
            vec![Item::Url {
                value: "https://x.test".into(),
                open_with: None,
            }],
        ));
        assert!(validate(&cfg).is_ok());
    }

    #[test]
    fn open_with_empty_string_is_rejected() {
        let mut cfg = base_config();
        cfg.profiles[0].tabs.push(tab_with(
            Some("X"),
            None,
            vec![Item::Url {
                value: "https://x.test".into(),
                open_with: Some("".into()),
            }],
        ));
        match validate(&cfg).unwrap_err() {
            AppError::Config { code, context } => {
                assert_eq!(code, "open_with_empty");
                assert_eq!(context.get("kind").map(String::as_str), Some("url"));
            }
            other => panic!("expected Config error, got {other:?}"),
        }
    }

    #[test]
    fn open_with_whitespace_is_rejected() {
        let mut cfg = base_config();
        cfg.profiles[0].tabs.push(tab_with(
            Some("X"),
            None,
            vec![Item::File {
                path: "/tmp/x".into(),
                open_with: Some("   ".into()),
            }],
        ));
        match validate(&cfg).unwrap_err() {
            AppError::Config { code, context } => {
                assert_eq!(code, "open_with_empty");
                assert_eq!(context.get("kind").map(String::as_str), Some("file"));
            }
            other => panic!("expected Config error, got {other:?}"),
        }
    }

    #[test]
    fn mixed_open_with_some_and_none_validates() {
        let mut cfg = base_config();
        cfg.profiles[0].tabs.push(tab_with(
            Some("Mix"),
            None,
            vec![
                Item::Url {
                    value: "https://work.test".into(),
                    open_with: Some("edge".into()),
                },
                Item::Url {
                    value: "https://personal.test".into(),
                    open_with: None,
                },
                Item::File {
                    path: "/tmp/x".into(),
                    open_with: Some("code".into()),
                },
            ],
        ));
        assert!(validate(&cfg).is_ok());
    }
}
