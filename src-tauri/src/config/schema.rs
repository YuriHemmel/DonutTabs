use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub version: u32,
    pub active_profile_id: Uuid,
    pub profiles: Vec<Profile>,
    pub appearance: Appearance,
    pub interaction: Interaction,
    pub pagination: Pagination,
    pub system: SystemConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: Uuid,
    pub name: String,
    pub icon: Option<String>,
    pub shortcut: String,
    pub theme: Theme,
    pub tabs: Vec<Tab>,
    /// Kill-switch global por perfil para items `kind: "script"`. Default
    /// `false` (princípio do menor privilégio). Quando `false`, o launcher
    /// bloqueia toda execução de script no perfil — independente do flag
    /// `trusted` do item — e o frontend mostra erro localizado em vez do
    /// modal de confirmação. Plano-13 e configs anteriores deserializam
    /// como `false` graças ao `#[serde(default)]`.
    #[serde(default)]
    pub allow_scripts: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub struct Appearance {
    #[serde(default)]
    pub language: Language,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub enum Theme {
    Dark,
    Light,
    Auto,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Default, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub enum Language {
    #[default]
    Auto,
    PtBr,
    En,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub struct Interaction {
    pub spawn_position: SpawnPosition,
    pub selection_mode: SelectionMode,
    pub hover_hold_ms: u32,
    /// Atalho window-level que abre o overlay de busca rápida no donut.
    /// Formato Tauri (`CommandOrControl+F`). Configs do Plano 12 ou
    /// anteriores deserializam usando `default_search_shortcut`.
    #[serde(default = "default_search_shortcut")]
    pub search_shortcut: String,
}

fn default_search_shortcut() -> String {
    "CommandOrControl+F".to_string()
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub enum SpawnPosition {
    Cursor,
    Center,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub enum SelectionMode {
    ClickOrRelease,
    HoverRelease,
    ClickOnly,
}

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
pub enum WheelDirection {
    Standard,
    Inverted,
}

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
pub enum OpenMode {
    ReuseOrNewWindow,
    NewWindow,
    NewTab,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Item {
    #[serde(rename_all = "camelCase")]
    Url {
        value: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        open_with: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    File {
        path: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        open_with: Option<String>,
    },
    #[serde(rename_all = "camelCase")]
    Folder {
        path: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        open_with: Option<String>,
    },
    /// Plano 14 — friendly app name (`"firefox"`, `"Visual Studio Code"`).
    /// Sem `open_with`: apps são spawned por nome via `tauri-plugin-shell`,
    /// não roteados via OS handler.
    #[serde(rename_all = "camelCase")]
    App { name: String },
    /// Plano 14 — comando shell arbitrário. **Alto risco** — gating duplo:
    /// `trusted: false` exige confirmação no `<ScriptConfirmModal>` na
    /// primeira execução; `Profile.allow_scripts: false` bloqueia toda
    /// execução de script no perfil. Configs Plano-13 sem `trusted` no JSON
    /// deserializam como `false`.
    #[serde(rename_all = "camelCase")]
    Script {
        command: String,
        #[serde(default)]
        trusted: bool,
    },
}

impl Default for Profile {
    fn default() -> Self {
        Self {
            id: Uuid::new_v4(),
            name: "Padrão".into(),
            icon: None,
            shortcut: "CommandOrControl+Shift+Space".into(),
            theme: Theme::Dark,
            tabs: vec![],
            allow_scripts: false,
        }
    }
}

impl Default for Config {
    fn default() -> Self {
        let default_profile = Profile::default();
        let active_id = default_profile.id;
        Self {
            version: 2,
            active_profile_id: active_id,
            profiles: vec![default_profile],
            appearance: Appearance {
                language: Language::Auto,
            },
            interaction: Interaction {
                spawn_position: SpawnPosition::Cursor,
                selection_mode: SelectionMode::ClickOrRelease,
                hover_hold_ms: 800,
                search_shortcut: default_search_shortcut(),
            },
            pagination: Pagination {
                items_per_page: 6,
                wheel_direction: WheelDirection::Standard,
            },
            system: SystemConfig { autostart: false },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_config_has_version_2() {
        let cfg = Config::default();
        assert_eq!(cfg.version, 2);
    }

    #[test]
    fn default_config_has_one_profile_with_active_matching_its_id() {
        let cfg = Config::default();
        assert_eq!(cfg.profiles.len(), 1);
        assert_eq!(cfg.active_profile_id, cfg.profiles[0].id);
    }

    #[test]
    fn default_config_roundtrip() {
        let cfg = Config::default();
        let json = serde_json::to_string(&cfg).unwrap();
        let parsed: Config = serde_json::from_str(&json).unwrap();
        assert_eq!(cfg, parsed);
    }

    #[test]
    fn profile_roundtrips() {
        let p = Profile {
            id: Uuid::nil(),
            name: "Trabalho".into(),
            icon: Some("💼".into()),
            shortcut: "Ctrl+Alt+W".into(),
            theme: Theme::Light,
            tabs: vec![Tab {
                id: Uuid::nil(),
                name: Some("aba".into()),
                icon: None,
                order: 0,
                open_mode: OpenMode::ReuseOrNewWindow,
                items: vec![Item::Url {
                    value: "https://example.com".into(),
                    open_with: None,
                }],
            }],
            allow_scripts: false,
        };
        let json = serde_json::to_string(&p).unwrap();
        let parsed: Profile = serde_json::from_str(&json).unwrap();
        assert_eq!(p, parsed);
    }

    #[test]
    fn config_v2_serializes_with_version_2() {
        let cfg = Config::default();
        let json = serde_json::to_string(&cfg).unwrap();
        assert!(json.contains("\"version\":2"));
        assert!(json.contains("\"activeProfileId\""));
        assert!(json.contains("\"profiles\""));
    }

    #[test]
    fn appearance_only_holds_language_now() {
        let json = serde_json::to_string(&Config::default()).unwrap();
        assert!(json.contains("\"appearance\":{\"language\""));
        // theme não vive mais em appearance
        assert!(!json.contains("\"appearance\":{\"theme\""));
    }

    #[test]
    fn camel_case_in_json() {
        let cfg = Config::default();
        let json = serde_json::to_string(&cfg).unwrap();
        assert!(json.contains("hoverHoldMs"));
        assert!(json.contains("itemsPerPage"));
        assert!(json.contains("activeProfileId"));
    }

    #[test]
    fn language_wire_format() {
        assert_eq!(serde_json::to_string(&Language::PtBr).unwrap(), "\"ptBr\"");
        assert_eq!(serde_json::to_string(&Language::En).unwrap(), "\"en\"");
        assert_eq!(serde_json::to_string(&Language::Auto).unwrap(), "\"auto\"");
    }

    #[test]
    fn item_url_wire_format() {
        let it = Item::Url {
            value: "https://x.test".into(),
            open_with: None,
        };
        let json = serde_json::to_string(&it).unwrap();
        assert_eq!(json, "{\"kind\":\"url\",\"value\":\"https://x.test\"}");
        let back: Item = serde_json::from_str(&json).unwrap();
        assert_eq!(it, back);
    }

    #[test]
    fn item_file_wire_format() {
        let it = Item::File {
            path: "C:/Users/me/doc.pdf".into(),
            open_with: None,
        };
        let json = serde_json::to_string(&it).unwrap();
        assert_eq!(json, "{\"kind\":\"file\",\"path\":\"C:/Users/me/doc.pdf\"}");
        let back: Item = serde_json::from_str(&json).unwrap();
        assert_eq!(it, back);
    }

    #[test]
    fn item_folder_wire_format() {
        let it = Item::Folder {
            path: "/home/me/projects".into(),
            open_with: None,
        };
        let json = serde_json::to_string(&it).unwrap();
        assert_eq!(json, "{\"kind\":\"folder\",\"path\":\"/home/me/projects\"}");
        let back: Item = serde_json::from_str(&json).unwrap();
        assert_eq!(it, back);
    }

    #[test]
    fn tab_with_mixed_items_roundtrips() {
        let tab = Tab {
            id: Uuid::nil(),
            name: Some("mix".into()),
            icon: None,
            order: 0,
            open_mode: OpenMode::ReuseOrNewWindow,
            items: vec![
                Item::Url {
                    value: "https://a.test".into(),
                    open_with: None,
                },
                Item::File {
                    path: "/tmp/x.txt".into(),
                    open_with: None,
                },
                Item::Folder {
                    path: "/tmp/dir".into(),
                    open_with: None,
                },
            ],
        };
        let json = serde_json::to_string(&tab).unwrap();
        let back: Tab = serde_json::from_str(&json).unwrap();
        assert_eq!(tab, back);
    }

    #[test]
    fn item_with_open_with_round_trips_and_serializes_field() {
        let it = Item::Url {
            value: "https://x.test".into(),
            open_with: Some("firefox".into()),
        };
        let json = serde_json::to_string(&it).unwrap();
        assert!(json.contains("\"openWith\":\"firefox\""));
        let back: Item = serde_json::from_str(&json).unwrap();
        assert_eq!(it, back);
    }

    #[test]
    fn item_without_open_with_omits_field() {
        let it = Item::File {
            path: "/tmp/x".into(),
            open_with: None,
        };
        let json = serde_json::to_string(&it).unwrap();
        assert!(
            !json.contains("openWith"),
            "field should be skipped when None: {json}"
        );
    }

    #[test]
    fn item_deserializes_legacy_payload_without_open_with() {
        // Plano 10 payloads (no openWith key) must deserialize as None.
        let url: Item = serde_json::from_str(r#"{"kind":"url","value":"https://x"}"#).unwrap();
        assert_eq!(
            url,
            Item::Url {
                value: "https://x".into(),
                open_with: None
            }
        );
        let file: Item = serde_json::from_str(r#"{"kind":"file","path":"/tmp/x"}"#).unwrap();
        assert_eq!(
            file,
            Item::File {
                path: "/tmp/x".into(),
                open_with: None
            }
        );
    }

    #[test]
    fn item_app_wire_format() {
        let it = Item::App {
            name: "firefox".into(),
        };
        let json = serde_json::to_string(&it).unwrap();
        assert_eq!(json, "{\"kind\":\"app\",\"name\":\"firefox\"}");
        let back: Item = serde_json::from_str(&json).unwrap();
        assert_eq!(it, back);
    }

    #[test]
    fn item_script_with_trusted_round_trips() {
        let it = Item::Script {
            command: "git pull".into(),
            trusted: true,
        };
        let json = serde_json::to_string(&it).unwrap();
        assert!(json.contains("\"trusted\":true"));
        let back: Item = serde_json::from_str(&json).unwrap();
        assert_eq!(it, back);
    }

    #[test]
    fn item_script_without_trusted_field_defaults_to_false() {
        // Configs Plano-13 e anteriores não têm `trusted` no JSON; precisa
        // deserializar como `false` (default mais seguro).
        let it: Item = serde_json::from_str(r#"{"kind":"script","command":"ls"}"#).unwrap();
        assert_eq!(
            it,
            Item::Script {
                command: "ls".into(),
                trusted: false
            }
        );
    }

    #[test]
    fn profile_without_allow_scripts_field_defaults_to_false() {
        // Plano-13 payloads (no allowScripts key) need to deserialize with
        // false — kill-switch default-closed.
        let json = r#"{
            "id": "11111111-1111-1111-1111-111111111111",
            "name": "Padrão",
            "icon": null,
            "shortcut": "CommandOrControl+Shift+Space",
            "theme": "dark",
            "tabs": []
        }"#;
        let p: Profile = serde_json::from_str(json).unwrap();
        assert!(!p.allow_scripts);
    }

    #[test]
    fn profile_with_allow_scripts_round_trips() {
        let mut p = Profile::default();
        p.allow_scripts = true;
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("\"allowScripts\":true"));
        let back: Profile = serde_json::from_str(&json).unwrap();
        assert_eq!(p, back);
    }
}
