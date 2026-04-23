use super::schema::*;
use crate::errors::{AppError, AppResult};

/// Retorna `Ok(())` se a config é semanticamente válida.
/// Retorna `Err(AppError::Config(mensagem))` com descrição da primeira violação.
pub fn validate(config: &Config) -> AppResult<()> {
    if !(4..=8).contains(&config.pagination.items_per_page) {
        return Err(AppError::Config(format!(
            "itemsPerPage deve estar entre 4 e 8 (got {})",
            config.pagination.items_per_page
        )));
    }

    if config.interaction.hover_hold_ms == 0 {
        return Err(AppError::Config("hoverHoldMs deve ser > 0".into()));
    }

    for tab in &config.tabs {
        let has_name = tab.name.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false);
        let has_icon = tab.icon.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false);
        if !has_name && !has_icon {
            return Err(AppError::Config(format!(
                "tab {} sem nome e sem ícone", tab.id
            )));
        }
    }

    for tab in &config.tabs {
        for item in &tab.items {
            match item {
                Item::Url { value } => {
                    url::Url::parse(value).map_err(|e| {
                        AppError::Config(format!("URL inválida em tab {}: {}", tab.id, e))
                    })?;
                }
            }
        }
    }

    let mut seen = std::collections::HashSet::new();
    for tab in &config.tabs {
        if !seen.insert(tab.id) {
            return Err(AppError::Config(format!("ID de tab duplicado: {}", tab.id)));
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
        assert!(validate(&cfg).is_err());
    }

    #[test]
    fn tab_with_empty_strings_is_invalid() {
        let mut cfg = base_config();
        cfg.tabs.push(tab_with(Some(""), Some("   "), vec![]));
        assert!(validate(&cfg).is_err());
    }

    #[test]
    fn items_per_page_out_of_range_is_invalid() {
        let mut cfg = base_config();
        cfg.pagination.items_per_page = 3;
        assert!(validate(&cfg).is_err());
        cfg.pagination.items_per_page = 9;
        assert!(validate(&cfg).is_err());
    }

    #[test]
    fn invalid_url_is_rejected() {
        let mut cfg = base_config();
        cfg.tabs.push(tab_with(
            Some("X"),
            None,
            vec![Item::Url { value: "not a url".into() }],
        ));
        assert!(validate(&cfg).is_err());
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
        assert!(validate(&cfg).is_err());
    }
}
