use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub version: u32,
    pub shortcut: String,
    pub appearance: Appearance,
    pub interaction: Interaction,
    pub pagination: Pagination,
    pub system: SystemConfig,
    pub tabs: Vec<Tab>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub struct Appearance {
    pub theme: Theme,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub enum Theme { Dark, Light, Auto }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub struct Interaction {
    pub spawn_position: SpawnPosition,
    pub selection_mode: SelectionMode,
    pub hover_hold_ms: u32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub enum SpawnPosition { Cursor, Center }

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub enum SelectionMode { ClickOrRelease, HoverRelease, ClickOnly }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub struct Pagination {
    pub items_per_page: u8,
    pub wheel_direction: WheelDirection,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub enum WheelDirection { Standard, Inverted }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub struct SystemConfig {
    pub autostart: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub struct Tab {
    pub id: Uuid,
    pub name: Option<String>,
    pub icon: Option<String>,
    pub order: u32,
    pub open_mode: OpenMode,
    pub items: Vec<Item>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub enum OpenMode { ReuseOrNewWindow, NewWindow, NewTab }

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Item {
    #[serde(rename_all = "camelCase")]
    Url { value: String },
}

impl Default for Config {
    fn default() -> Self {
        Self {
            version: 1,
            shortcut: "CommandOrControl+Shift+Space".into(),
            appearance: Appearance { theme: Theme::Dark },
            interaction: Interaction {
                spawn_position: SpawnPosition::Cursor,
                selection_mode: SelectionMode::ClickOrRelease,
                hover_hold_ms: 800,
            },
            pagination: Pagination {
                items_per_page: 6,
                wheel_direction: WheelDirection::Standard,
            },
            system: SystemConfig { autostart: false },
            tabs: vec![],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_roundtrip() {
        let cfg = Config::default();
        let json = serde_json::to_string(&cfg).unwrap();
        let parsed: Config = serde_json::from_str(&json).unwrap();
        assert_eq!(cfg, parsed);
    }

    #[test]
    fn tab_with_url_items_roundtrips() {
        let tab = Tab {
            id: Uuid::nil(),
            name: Some("Trabalho".into()),
            icon: Some("💼".into()),
            order: 0,
            open_mode: OpenMode::ReuseOrNewWindow,
            items: vec![Item::Url { value: "https://example.com".into() }],
        };
        let json = serde_json::to_string(&tab).unwrap();
        let parsed: Tab = serde_json::from_str(&json).unwrap();
        assert_eq!(tab, parsed);
    }

    #[test]
    fn camel_case_in_json() {
        let cfg = Config::default();
        let json = serde_json::to_string(&cfg).unwrap();
        assert!(json.contains("hoverHoldMs"));
        assert!(json.contains("itemsPerPage"));
    }
}
