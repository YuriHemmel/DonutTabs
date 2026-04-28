use super::schema::*;
use crate::errors::{AppError, AppResult};
use crate::shortcut;

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

    if config.interaction.search_shortcut.trim().is_empty() {
        return Err(AppError::config("search_shortcut_empty", &[]));
    }
    shortcut::validate_combo(&config.interaction.search_shortcut)?;

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
        if let Some(overrides) = &profile.theme_overrides {
            validate_theme_overrides(profile, overrides)?;
        }
    }

    Ok(())
}

/// Aceita `#RGB` ou `#RRGGBB` (case-insensitive). Sem alpha — alpha vive em
/// `ThemeAlpha`. Sem `rgb()`/nomes/hsl — formato canônico via color picker
/// nativo do navegador é sempre `#RRGGBB`.
pub(crate) fn is_hex_color(s: &str) -> bool {
    let bytes = s.as_bytes();
    if bytes.first() != Some(&b'#') {
        return false;
    }
    let rest = &bytes[1..];
    if rest.len() != 3 && rest.len() != 6 {
        return false;
    }
    rest.iter().all(|b| b.is_ascii_hexdigit())
}

fn validate_theme_overrides(profile: &Profile, overrides: &ThemeOverrides) -> AppResult<()> {
    if let Some(colors) = &overrides.colors {
        let entries = [
            ("sliceFill", colors.slice_fill.as_deref()),
            ("sliceHighlight", colors.slice_highlight.as_deref()),
            ("sliceStroke", colors.slice_stroke.as_deref()),
            ("centerFill", colors.center_fill.as_deref()),
            ("text", colors.text.as_deref()),
        ];
        for (field, value) in entries {
            if let Some(v) = value {
                if !is_hex_color(v) {
                    return Err(AppError::config(
                        "theme_color_invalid",
                        &[
                            ("profileId", profile.id.to_string()),
                            ("field", field.to_string()),
                            ("value", v.to_string()),
                        ],
                    ));
                }
            }
        }
    }
    if let Some(alpha) = &overrides.alpha {
        if let Some(v) = alpha.overlay {
            if !v.is_finite() || !(0.0..=1.0).contains(&v) {
                return Err(AppError::config(
                    "theme_alpha_out_of_range",
                    &[
                        ("profileId", profile.id.to_string()),
                        ("field", "overlay".to_string()),
                        ("value", v.to_string()),
                    ],
                ));
            }
        }
    }
    if let Some(dims) = &overrides.dimensions {
        if let Some(inner) = dims.inner_ratio {
            if !inner.is_finite() || !(0.05..=0.45).contains(&inner) {
                return Err(AppError::config(
                    "theme_radius_out_of_range",
                    &[
                        ("profileId", profile.id.to_string()),
                        ("field", "innerRatio".to_string()),
                        ("value", inner.to_string()),
                    ],
                ));
            }
        }
        if let Some(outer) = dims.outer_ratio {
            if !outer.is_finite() || !(0.30..=0.50).contains(&outer) {
                return Err(AppError::config(
                    "theme_radius_out_of_range",
                    &[
                        ("profileId", profile.id.to_string()),
                        ("field", "outerRatio".to_string()),
                        ("value", outer.to_string()),
                    ],
                ));
            }
        }
        if let (Some(inner), Some(outer)) = (dims.inner_ratio, dims.outer_ratio) {
            if inner >= outer {
                return Err(AppError::config(
                    "theme_radius_inverted",
                    &[
                        ("profileId", profile.id.to_string()),
                        ("inner", inner.to_string()),
                        ("outer", outer.to_string()),
                    ],
                ));
            }
        }
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
                Item::App { name } => {
                    if name.trim().is_empty() {
                        return Err(AppError::config(
                            "app_name_empty",
                            &[
                                ("tabId", tab.id.to_string()),
                                ("profileId", profile.id.to_string()),
                            ],
                        ));
                    }
                }
                Item::Script { command, .. } => {
                    if command.trim().is_empty() {
                        return Err(AppError::config(
                            "script_command_empty",
                            &[
                                ("tabId", tab.id.to_string()),
                                ("profileId", profile.id.to_string()),
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
        Item::App { .. } => "app",
        Item::Script { .. } => "script",
    }
}

fn item_open_with(item: &Item) -> Option<&str> {
    match item {
        Item::Url { open_with, .. }
        | Item::File { open_with, .. }
        | Item::Folder { open_with, .. } => open_with.as_deref(),
        // App e Script não têm open_with — apps são spawned por nome,
        // scripts via shell. Routing por OS handler não se aplica.
        Item::App { .. } | Item::Script { .. } => None,
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
            allow_scripts: false,
            theme_overrides: None,
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

    #[test]
    fn default_search_shortcut_is_valid() {
        // Default config carrega `CommandOrControl+F` — bate com `validate_combo`.
        assert!(validate(&base_config()).is_ok());
    }

    #[test]
    fn search_shortcut_empty_is_rejected() {
        let mut cfg = base_config();
        cfg.interaction.search_shortcut = "".into();
        assert_config_code(validate(&cfg).unwrap_err(), "search_shortcut_empty");
    }

    #[test]
    fn search_shortcut_whitespace_is_rejected() {
        let mut cfg = base_config();
        cfg.interaction.search_shortcut = "   ".into();
        assert_config_code(validate(&cfg).unwrap_err(), "search_shortcut_empty");
    }

    #[test]
    fn search_shortcut_garbage_is_rejected() {
        let mut cfg = base_config();
        cfg.interaction.search_shortcut = "garbage".into();
        // `validate_combo` propaga `shortcut_parse_failed`.
        match validate(&cfg).unwrap_err() {
            AppError::Shortcut { code, .. } => assert_eq!(code, "shortcut_parse_failed"),
            other => panic!("expected Shortcut error, got {other:?}"),
        }
    }

    #[test]
    fn legacy_config_without_search_shortcut_deserializes_with_default() {
        // Plano-12 payload (sem `searchShortcut` em `interaction`) precisa
        // sobreviver ao roundtrip via `serde` graças ao `#[serde(default)]`.
        let json = r#"{
            "version": 2,
            "activeProfileId": "11111111-1111-1111-1111-111111111111",
            "profiles": [
                {
                    "id": "11111111-1111-1111-1111-111111111111",
                    "name": "Padrão",
                    "icon": null,
                    "shortcut": "CommandOrControl+Shift+Space",
                    "theme": "dark",
                    "tabs": []
                }
            ],
            "appearance": { "language": "auto" },
            "interaction": {
                "spawnPosition": "cursor",
                "selectionMode": "clickOrRelease",
                "hoverHoldMs": 800
            },
            "pagination": { "itemsPerPage": 6, "wheelDirection": "standard" },
            "system": { "autostart": false }
        }"#;
        let cfg: Config = serde_json::from_str(json).unwrap();
        assert_eq!(cfg.interaction.search_shortcut, "CommandOrControl+F");
        assert!(validate(&cfg).is_ok());
    }

    #[test]
    fn app_item_with_non_empty_name_is_valid() {
        let mut cfg = base_config();
        cfg.profiles[0].tabs.push(tab_with(
            Some("Browser"),
            None,
            vec![Item::App {
                name: "firefox".into(),
            }],
        ));
        assert!(validate(&cfg).is_ok());
    }

    #[test]
    fn app_item_with_empty_name_is_rejected() {
        let mut cfg = base_config();
        cfg.profiles[0].tabs.push(tab_with(
            Some("X"),
            None,
            vec![Item::App { name: "".into() }],
        ));
        assert_config_code(validate(&cfg).unwrap_err(), "app_name_empty");
    }

    #[test]
    fn app_item_with_whitespace_name_is_rejected() {
        let mut cfg = base_config();
        cfg.profiles[0].tabs.push(tab_with(
            Some("X"),
            None,
            vec![Item::App { name: "   ".into() }],
        ));
        assert_config_code(validate(&cfg).unwrap_err(), "app_name_empty");
    }

    #[test]
    fn script_item_with_non_empty_command_is_valid() {
        let mut cfg = base_config();
        cfg.profiles[0].tabs.push(tab_with(
            Some("Build"),
            None,
            vec![Item::Script {
                command: "cargo build".into(),
                trusted: false,
            }],
        ));
        // Validate is structural — não importa se profile.allow_scripts é
        // false ou trusted é false; runtime gating cuida disso.
        assert!(validate(&cfg).is_ok());
    }

    #[test]
    fn script_item_with_empty_command_is_rejected() {
        let mut cfg = base_config();
        cfg.profiles[0].tabs.push(tab_with(
            Some("X"),
            None,
            vec![Item::Script {
                command: "".into(),
                trusted: false,
            }],
        ));
        assert_config_code(validate(&cfg).unwrap_err(), "script_command_empty");
    }

    #[test]
    fn is_hex_color_accepts_rgb_and_rrggbb() {
        assert!(is_hex_color("#abc"));
        assert!(is_hex_color("#ABC"));
        assert!(is_hex_color("#aabbcc"));
        assert!(is_hex_color("#AABBCC"));
        assert!(is_hex_color("#0f0"));
        assert!(is_hex_color("#123456"));
    }

    #[test]
    fn is_hex_color_rejects_invalid_formats() {
        assert!(!is_hex_color(""));
        assert!(!is_hex_color("abc"));
        assert!(!is_hex_color("#"));
        assert!(!is_hex_color("#xx"));
        assert!(!is_hex_color("#1234"));
        assert!(!is_hex_color("#12345"));
        assert!(!is_hex_color("#1234567"));
        assert!(!is_hex_color("#abcdeg"));
        assert!(!is_hex_color("red"));
        assert!(!is_hex_color("rgb(1,2,3)"));
    }

    #[test]
    fn theme_overrides_none_validates() {
        let mut cfg = base_config();
        cfg.profiles[0].theme_overrides = None;
        assert!(validate(&cfg).is_ok());
    }

    #[test]
    fn theme_overrides_valid_colors_validate() {
        let mut cfg = base_config();
        cfg.profiles[0].theme_overrides = Some(ThemeOverrides {
            colors: Some(ThemeColors {
                slice_fill: Some("#102030".into()),
                slice_highlight: Some("#abc".into()),
                slice_stroke: Some("#3a4968".into()),
                center_fill: None,
                text: Some("#ffffff".into()),
            }),
            dimensions: None,
            alpha: None,
        });
        assert!(validate(&cfg).is_ok());
    }

    #[test]
    fn theme_overrides_invalid_color_is_rejected() {
        let mut cfg = base_config();
        cfg.profiles[0].theme_overrides = Some(ThemeOverrides {
            colors: Some(ThemeColors {
                slice_fill: Some("not-a-color".into()),
                ..ThemeColors::default()
            }),
            dimensions: None,
            alpha: None,
        });
        match validate(&cfg).unwrap_err() {
            AppError::Config { code, context } => {
                assert_eq!(code, "theme_color_invalid");
                assert_eq!(context.get("field").map(String::as_str), Some("sliceFill"));
                assert_eq!(
                    context.get("value").map(String::as_str),
                    Some("not-a-color"),
                );
            }
            other => panic!("expected Config error, got {other:?}"),
        }
    }

    #[test]
    fn theme_overrides_alpha_in_bounds_validates() {
        let mut cfg = base_config();
        cfg.profiles[0].theme_overrides = Some(ThemeOverrides {
            colors: None,
            dimensions: None,
            alpha: Some(ThemeAlpha { overlay: Some(0.0) }),
        });
        assert!(validate(&cfg).is_ok());
        cfg.profiles[0].theme_overrides = Some(ThemeOverrides {
            colors: None,
            dimensions: None,
            alpha: Some(ThemeAlpha { overlay: Some(1.0) }),
        });
        assert!(validate(&cfg).is_ok());
        cfg.profiles[0].theme_overrides = Some(ThemeOverrides {
            colors: None,
            dimensions: None,
            alpha: Some(ThemeAlpha { overlay: Some(0.5) }),
        });
        assert!(validate(&cfg).is_ok());
    }

    #[test]
    fn theme_overrides_alpha_out_of_range_is_rejected() {
        let mut cfg = base_config();
        cfg.profiles[0].theme_overrides = Some(ThemeOverrides {
            colors: None,
            dimensions: None,
            alpha: Some(ThemeAlpha {
                overlay: Some(-0.1),
            }),
        });
        assert_config_code(validate(&cfg).unwrap_err(), "theme_alpha_out_of_range");
        cfg.profiles[0].theme_overrides = Some(ThemeOverrides {
            colors: None,
            dimensions: None,
            alpha: Some(ThemeAlpha { overlay: Some(1.5) }),
        });
        assert_config_code(validate(&cfg).unwrap_err(), "theme_alpha_out_of_range");
    }

    #[test]
    fn theme_overrides_alpha_nan_is_rejected() {
        let mut cfg = base_config();
        cfg.profiles[0].theme_overrides = Some(ThemeOverrides {
            colors: None,
            dimensions: None,
            alpha: Some(ThemeAlpha {
                overlay: Some(f32::NAN),
            }),
        });
        assert_config_code(validate(&cfg).unwrap_err(), "theme_alpha_out_of_range");
    }

    #[test]
    fn theme_overrides_radius_in_bounds_validate() {
        let mut cfg = base_config();
        cfg.profiles[0].theme_overrides = Some(ThemeOverrides {
            colors: None,
            dimensions: Some(ThemeDimensions {
                inner_ratio: Some(0.05),
                outer_ratio: Some(0.50),
            }),
            alpha: None,
        });
        assert!(validate(&cfg).is_ok());
        cfg.profiles[0].theme_overrides = Some(ThemeOverrides {
            colors: None,
            dimensions: Some(ThemeDimensions {
                inner_ratio: Some(0.45),
                outer_ratio: Some(0.50),
            }),
            alpha: None,
        });
        assert!(validate(&cfg).is_ok());
        cfg.profiles[0].theme_overrides = Some(ThemeOverrides {
            colors: None,
            dimensions: Some(ThemeDimensions {
                inner_ratio: Some(0.20),
                outer_ratio: Some(0.30),
            }),
            alpha: None,
        });
        assert!(validate(&cfg).is_ok());
    }

    #[test]
    fn theme_overrides_inner_radius_out_of_range_is_rejected() {
        let mut cfg = base_config();
        cfg.profiles[0].theme_overrides = Some(ThemeOverrides {
            colors: None,
            dimensions: Some(ThemeDimensions {
                inner_ratio: Some(0.04),
                outer_ratio: None,
            }),
            alpha: None,
        });
        match validate(&cfg).unwrap_err() {
            AppError::Config { code, context } => {
                assert_eq!(code, "theme_radius_out_of_range");
                assert_eq!(context.get("field").map(String::as_str), Some("innerRatio"),);
            }
            other => panic!("expected Config error, got {other:?}"),
        }

        cfg.profiles[0].theme_overrides = Some(ThemeOverrides {
            colors: None,
            dimensions: Some(ThemeDimensions {
                inner_ratio: Some(0.46),
                outer_ratio: None,
            }),
            alpha: None,
        });
        assert_config_code(validate(&cfg).unwrap_err(), "theme_radius_out_of_range");
    }

    #[test]
    fn theme_overrides_outer_radius_out_of_range_is_rejected() {
        let mut cfg = base_config();
        cfg.profiles[0].theme_overrides = Some(ThemeOverrides {
            colors: None,
            dimensions: Some(ThemeDimensions {
                inner_ratio: None,
                outer_ratio: Some(0.29),
            }),
            alpha: None,
        });
        match validate(&cfg).unwrap_err() {
            AppError::Config { code, context } => {
                assert_eq!(code, "theme_radius_out_of_range");
                assert_eq!(context.get("field").map(String::as_str), Some("outerRatio"),);
            }
            other => panic!("expected Config error, got {other:?}"),
        }

        cfg.profiles[0].theme_overrides = Some(ThemeOverrides {
            colors: None,
            dimensions: Some(ThemeDimensions {
                inner_ratio: None,
                outer_ratio: Some(0.51),
            }),
            alpha: None,
        });
        assert_config_code(validate(&cfg).unwrap_err(), "theme_radius_out_of_range");
    }

    #[test]
    fn theme_overrides_inverted_radius_is_rejected() {
        let mut cfg = base_config();
        cfg.profiles[0].theme_overrides = Some(ThemeOverrides {
            colors: None,
            dimensions: Some(ThemeDimensions {
                inner_ratio: Some(0.40),
                outer_ratio: Some(0.30),
            }),
            alpha: None,
        });
        assert_config_code(validate(&cfg).unwrap_err(), "theme_radius_inverted");

        // inner == outer também é inválido (donut degeneraria em anel zero).
        cfg.profiles[0].theme_overrides = Some(ThemeOverrides {
            colors: None,
            dimensions: Some(ThemeDimensions {
                inner_ratio: Some(0.40),
                outer_ratio: Some(0.40),
            }),
            alpha: None,
        });
        assert_config_code(validate(&cfg).unwrap_err(), "theme_radius_inverted");
    }

    #[test]
    fn theme_overrides_partial_dimensions_skips_inversion_check() {
        // Só inner setado: não há como comparar — só valida o range individual.
        let mut cfg = base_config();
        cfg.profiles[0].theme_overrides = Some(ThemeOverrides {
            colors: None,
            dimensions: Some(ThemeDimensions {
                inner_ratio: Some(0.40),
                outer_ratio: None,
            }),
            alpha: None,
        });
        assert!(validate(&cfg).is_ok());
    }

    #[test]
    fn full_mix_of_five_item_kinds_validates() {
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
                Item::App {
                    name: "code".into(),
                },
                Item::Script {
                    command: "git pull".into(),
                    trusted: false,
                },
            ],
        ));
        assert!(validate(&cfg).is_ok());
    }
}
