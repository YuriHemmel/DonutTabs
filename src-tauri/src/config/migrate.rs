use super::schema::{Appearance, Config, Profile, Tab};
use super::v1::ConfigV1;
use uuid::Uuid;

/// Converte uma `ConfigV1` (lida do disco) na nova `Config` v2: cria um
/// perfil único chamado "Padrão" contendo as preferências do v1
/// (`shortcut`, `theme`, `tabs`); os campos globais (`interaction`,
/// `pagination`, `system`, `appearance.language`) ficam no nível raiz.
pub fn migrate_to_v2(v1: ConfigV1) -> Config {
    let profile = Profile {
        id: Uuid::new_v4(),
        name: "Padrão".into(),
        icon: None,
        shortcut: v1.shortcut,
        theme: v1.appearance.theme,
        tabs: v1
            .tabs
            .into_iter()
            .map(|t| Tab {
                id: t.id,
                name: t.name,
                icon: t.icon,
                order: t.order,
                open_mode: t.open_mode,
                items: t.items,
                // Plano 16: configs v1 não conheciam sub-donuts.
                children: vec![],
            })
            .collect(),
        // Plano 14: kill-switch default-closed. Configs v1 não conheciam
        // `kind: "script"`, então não há tabs com scripts pra ativar.
        allow_scripts: false,
        // Plano 15: configs v1 não têm overrides cosméticos.
        theme_overrides: None,
    };
    Config {
        version: 2,
        active_profile_id: profile.id,
        profiles: vec![profile],
        appearance: Appearance {
            language: v1.appearance.language,
        },
        interaction: v1.interaction,
        pagination: v1.pagination,
        system: v1.system,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::schema::{
        Item, Language, OpenMode, Pagination, SelectionMode, SpawnPosition, SystemConfig, Theme,
        WheelDirection,
    };
    use crate::config::v1::{AppearanceV1, TabV1};

    fn sample_v1() -> ConfigV1 {
        ConfigV1 {
            version: 1,
            shortcut: "Ctrl+Alt+P".into(),
            appearance: AppearanceV1 {
                theme: Theme::Light,
                language: Language::PtBr,
            },
            interaction: crate::config::schema::Interaction {
                spawn_position: SpawnPosition::Cursor,
                selection_mode: SelectionMode::ClickOrRelease,
                hover_hold_ms: 800,
                search_shortcut: "CommandOrControl+F".into(),
            },
            pagination: Pagination {
                items_per_page: 6,
                wheel_direction: WheelDirection::Standard,
            },
            system: SystemConfig { autostart: false },
            tabs: vec![TabV1 {
                id: Uuid::new_v4(),
                name: Some("aba1".into()),
                icon: None,
                order: 0,
                open_mode: OpenMode::ReuseOrNewWindow,
                items: vec![Item::Url {
                    value: "https://a.test".into(),
                    open_with: None,
                }],
            }],
        }
    }

    #[test]
    fn migrate_v1_preserves_shortcut_theme_and_tabs() {
        let v1 = sample_v1();
        let original_tabs_len = v1.tabs.len();
        let v2 = migrate_to_v2(v1);
        assert_eq!(v2.version, 2);
        assert_eq!(v2.profiles.len(), 1);
        assert_eq!(v2.profiles[0].shortcut, "Ctrl+Alt+P");
        assert_eq!(v2.profiles[0].theme, Theme::Light);
        assert_eq!(v2.profiles[0].name, "Padrão");
        assert_eq!(v2.profiles[0].tabs.len(), original_tabs_len);
        assert_eq!(v2.active_profile_id, v2.profiles[0].id);
    }

    #[test]
    fn migrate_v1_keeps_language_at_root() {
        let v1 = sample_v1();
        let v2 = migrate_to_v2(v1);
        assert_eq!(v2.appearance.language, Language::PtBr);
    }

    #[test]
    fn migrate_v1_preserves_interaction_pagination_system() {
        let v1 = sample_v1();
        let v2 = migrate_to_v2(v1);
        assert_eq!(v2.interaction.hover_hold_ms, 800);
        assert_eq!(v2.pagination.items_per_page, 6);
        assert!(!v2.system.autostart);
    }
}
