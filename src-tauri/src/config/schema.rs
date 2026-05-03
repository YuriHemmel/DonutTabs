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
    /// Plano 15 — overrides cosméticos que se aplicam por cima do preset
    /// `theme` (cores, transparência do overlay, ratios de raio interno/
    /// externo). `None` = usa apenas o preset. Cada campo de cor/dimensão
    /// dentro do struct também é `Option`, então o usuário customiza só
    /// um subset. Configs Plano-14 e anteriores deserializam como `None`
    /// graças ao `#[serde(default)]`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub theme_overrides: Option<ThemeOverrides>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub struct ThemeOverrides {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub colors: Option<ThemeColors>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub dimensions: Option<ThemeDimensions>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alpha: Option<ThemeAlpha>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub struct ThemeColors {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub slice_fill: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub slice_highlight: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub slice_stroke: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub center_fill: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Default, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub struct ThemeDimensions {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub inner_ratio: Option<f32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub outer_ratio: Option<f32>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Default, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub struct ThemeAlpha {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub overlay: Option<f32>,
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
    /// Plano 18 — quando `true`, a app dispara um check de atualização no
    /// startup e exibe notificação OS-native (uma única vez por versão
    /// remota nova) caso encontre versão maior. Default `true`. Configs
    /// Plano-17 e anteriores deserializam com `true` graças ao
    /// `#[serde(default = "default_auto_check_updates")]`.
    #[serde(default = "default_auto_check_updates")]
    pub auto_check_updates: bool,
    /// Plano 18 — última versão pra qual o usuário já recebeu a
    /// notificação OS-native no startup. Gate `should_notify` evita
    /// re-notificar a mesma versão. Field é estado interno persistido pelo
    /// updater; user pode editar manualmente sem efeito colateral
    /// (resetar = re-notifica). `None` em configs Plano-17 e anteriores;
    /// `skip_serializing_if = "Option::is_none"` mantém o JSON enxuto
    /// enquanto nenhum check rodou.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_notified_update_version: Option<String>,
    /// Plano 19 — quando `true`, a execução de items `kind: "script"`
    /// captura stdout/stderr em `AppState.script_history` (in-memory
    /// bounded queue) e exibe na aba "Histórico" do Settings. Quando
    /// `false`, scripts voltam ao path Plano-14 (fire-and-forget, sem
    /// captura). Default `true`. Configs Plano-18 e anteriores
    /// deserializam com `true` graças ao
    /// `#[serde(default = "default_script_history_enabled")]`.
    #[serde(default = "default_script_history_enabled")]
    pub script_history_enabled: bool,
}

fn default_auto_check_updates() -> bool {
    true
}

fn default_script_history_enabled() -> bool {
    true
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
    /// Plano 16 — sub-donuts. Quando `kind == Group`, esta aba abre um
    /// sub-donut com `children`; quando `kind == Leaf`, abre os `items`.
    /// `#[serde(default)]` faz configs Plano-15 carregarem como `Leaf` sem
    /// migração; `skip_serializing_if = is_leaf_kind` mantém o JSON enxuto
    /// pra leaves (caso comum). Persistir o kind explicitamente resolve o
    /// caso ambíguo de tab vazia (items=[] && children=[]) — sem isso,
    /// não há como distinguir um group vazio de um leaf vazio depois do
    /// round-trip.
    #[serde(default, skip_serializing_if = "is_leaf_kind")]
    pub kind: TabKind,
    /// Plano 16 — sub-donuts. Quando `kind == Group`, lista os filhos
    /// (vazio é permitido como draft). Quando `kind == Leaf`, deve ser
    /// vazio (validate rejeita). `#[serde(default, skip_serializing_if =
    /// "Vec::is_empty")]` mantém configs Plano-15 carregando sem migração
    /// e não polui JSON de leaves.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<Tab>,
}

#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub enum TabKind {
    #[default]
    Leaf,
    Group,
}

fn is_leaf_kind(k: &TabKind) -> bool {
    matches!(k, TabKind::Leaf)
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
            theme_overrides: None,
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
            system: SystemConfig {
                autostart: false,
                auto_check_updates: true,
                last_notified_update_version: None,
                script_history_enabled: true,
            },
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
                kind: TabKind::Leaf,
                children: vec![],
            }],
            allow_scripts: false,
            theme_overrides: None,
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
            kind: TabKind::Leaf,
            children: vec![],
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

    #[test]
    fn profile_default_omits_theme_overrides_in_json() {
        // Plano 15: theme_overrides=None deve ser elidido no JSON pra não
        // poluir configs de usuários que não customizaram nada.
        let p = Profile::default();
        let json = serde_json::to_string(&p).unwrap();
        assert!(
            !json.contains("themeOverrides"),
            "field should be skipped when None: {json}"
        );
    }

    #[test]
    fn profile_without_theme_overrides_field_defaults_to_none() {
        // Plano 14 e anteriores não têm `themeOverrides` no JSON; precisa
        // deserializar como `None`.
        let json = r#"{
            "id": "11111111-1111-1111-1111-111111111111",
            "name": "Padrão",
            "icon": null,
            "shortcut": "CommandOrControl+Shift+Space",
            "theme": "dark",
            "tabs": [],
            "allowScripts": false
        }"#;
        let p: Profile = serde_json::from_str(json).unwrap();
        assert!(p.theme_overrides.is_none());
    }

    #[test]
    fn profile_with_theme_overrides_round_trips() {
        let mut p = Profile::default();
        p.theme_overrides = Some(ThemeOverrides {
            colors: Some(ThemeColors {
                slice_fill: Some("#abc123".into()),
                slice_highlight: None,
                slice_stroke: None,
                center_fill: None,
                text: Some("#ffffff".into()),
            }),
            dimensions: Some(ThemeDimensions {
                inner_ratio: Some(0.25),
                outer_ratio: None,
            }),
            alpha: Some(ThemeAlpha { overlay: Some(0.7) }),
        });
        let json = serde_json::to_string(&p).unwrap();
        assert!(json.contains("\"themeOverrides\""));
        assert!(json.contains("\"sliceFill\":\"#abc123\""));
        assert!(json.contains("\"innerRatio\":0.25"));
        assert!(json.contains("\"overlay\":0.7"));
        let back: Profile = serde_json::from_str(&json).unwrap();
        assert_eq!(p, back);
    }

    #[test]
    fn theme_overrides_partial_subset_omits_unset_subgroups() {
        // Override apenas em `colors`: `dimensions` e `alpha` ausentes não
        // serializam nem como `null` nem como objeto vazio.
        let o = ThemeOverrides {
            colors: Some(ThemeColors {
                slice_fill: Some("#102030".into()),
                ..ThemeColors::default()
            }),
            dimensions: None,
            alpha: None,
        };
        let json = serde_json::to_string(&o).unwrap();
        assert!(json.contains("\"colors\""));
        assert!(!json.contains("\"dimensions\""));
        assert!(!json.contains("\"alpha\""));
        // E as cores não-setadas dentro de `colors` também são elididas.
        assert!(!json.contains("\"sliceHighlight\""));
        assert!(!json.contains("\"centerFill\""));
    }

    #[test]
    fn theme_overrides_default_is_empty_struct() {
        // `ThemeOverrides::default()` deve serializar como `{}` — sem campos.
        let o = ThemeOverrides::default();
        let json = serde_json::to_string(&o).unwrap();
        assert_eq!(json, "{}");
        let back: ThemeOverrides = serde_json::from_str(&json).unwrap();
        assert_eq!(o, back);
    }

    #[test]
    fn tab_default_omits_children_and_kind_in_json() {
        // Plano 16: children=[] e kind=Leaf são elididos no JSON pra não
        // poluir configs Plano-15.
        let tab = Tab {
            id: Uuid::nil(),
            name: Some("leaf".into()),
            icon: None,
            order: 0,
            open_mode: OpenMode::ReuseOrNewWindow,
            items: vec![Item::Url {
                value: "https://x".into(),
                open_with: None,
            }],
            kind: TabKind::Leaf,
            children: vec![],
        };
        let json = serde_json::to_string(&tab).unwrap();
        assert!(
            !json.contains("children"),
            "children should be skipped when empty: {json}"
        );
        // Item::Url também serializa um `"kind":"url"` interno; checar
        // especificamente a variante leaf no nível do Tab.
        assert!(
            !json.contains("\"kind\":\"leaf\""),
            "kind=Leaf should be skipped: {json}"
        );
    }

    #[test]
    fn tab_without_kind_or_children_deserializes_as_leaf() {
        // Plano 15 e anteriores não têm `kind` nem `children` no JSON.
        let json = r#"{
            "id": "11111111-1111-1111-1111-111111111111",
            "name": "x",
            "icon": null,
            "order": 0,
            "openMode": "reuseOrNewWindow",
            "items": [{"kind":"url","value":"https://x"}]
        }"#;
        let t: Tab = serde_json::from_str(json).unwrap();
        assert!(t.children.is_empty());
        assert_eq!(t.kind, TabKind::Leaf);
    }

    #[test]
    fn tab_with_children_round_trips() {
        let child = Tab {
            id: Uuid::nil(),
            name: Some("child".into()),
            icon: None,
            order: 0,
            open_mode: OpenMode::ReuseOrNewWindow,
            items: vec![Item::Url {
                value: "https://child".into(),
                open_with: None,
            }],
            kind: TabKind::Leaf,
            children: vec![],
        };
        let group = Tab {
            id: Uuid::nil(),
            name: Some("group".into()),
            icon: Some("📁".into()),
            order: 0,
            open_mode: OpenMode::ReuseOrNewWindow,
            items: vec![],
            kind: TabKind::Group,
            children: vec![child],
        };
        let json = serde_json::to_string(&group).unwrap();
        assert!(json.contains("\"children\""));
        assert!(json.contains("\"kind\":\"group\""));
        assert!(json.contains("\"name\":\"child\""));
        let back: Tab = serde_json::from_str(&json).unwrap();
        assert_eq!(group, back);
    }

    #[test]
    fn empty_group_round_trips_with_kind() {
        // Plano 16: o cenário-chave que motivou `kind` explícito —
        // group sem children sobrevive ao round-trip mantendo a
        // classificação.
        let group = Tab {
            id: Uuid::nil(),
            name: Some("empty".into()),
            icon: None,
            order: 0,
            open_mode: OpenMode::ReuseOrNewWindow,
            items: vec![],
            kind: TabKind::Group,
            children: vec![],
        };
        let json = serde_json::to_string(&group).unwrap();
        assert!(json.contains("\"kind\":\"group\""));
        let back: Tab = serde_json::from_str(&json).unwrap();
        assert_eq!(group, back);
        assert_eq!(back.kind, TabKind::Group);
    }

    #[test]
    fn tab_three_level_nesting_round_trips() {
        // root (group) -> mid (group) -> leaf
        let leaf = Tab {
            id: Uuid::nil(),
            name: Some("L".into()),
            icon: None,
            order: 0,
            open_mode: OpenMode::ReuseOrNewWindow,
            items: vec![Item::Url {
                value: "https://l".into(),
                open_with: None,
            }],
            kind: TabKind::Leaf,
            children: vec![],
        };
        let mid = Tab {
            id: Uuid::nil(),
            name: Some("M".into()),
            icon: None,
            order: 0,
            open_mode: OpenMode::ReuseOrNewWindow,
            items: vec![],
            kind: TabKind::Group,
            children: vec![leaf],
        };
        let root = Tab {
            id: Uuid::nil(),
            name: Some("R".into()),
            icon: None,
            order: 0,
            open_mode: OpenMode::ReuseOrNewWindow,
            items: vec![],
            kind: TabKind::Group,
            children: vec![mid],
        };
        let json = serde_json::to_string(&root).unwrap();
        let back: Tab = serde_json::from_str(&json).unwrap();
        assert_eq!(root, back);
    }

    #[test]
    fn theme_overrides_deserializes_empty_subgroups() {
        // `{"colors":{}}` deve virar `Some(ThemeColors::default())`, não None.
        // Isso documenta que `Option` está no nível do sub-grupo, não dentro.
        let o: ThemeOverrides = serde_json::from_str(r#"{"colors":{}}"#).unwrap();
        assert!(o.colors.is_some());
        assert_eq!(o.colors.unwrap(), ThemeColors::default());
    }

    #[test]
    fn system_config_defaults_auto_check_updates_to_true_when_absent() {
        // Plano-17 e anteriores: payload `{"autostart": false}` continua válido.
        let s: SystemConfig = serde_json::from_str(r#"{"autostart":false}"#).unwrap();
        assert!(s.auto_check_updates);
        assert_eq!(s.last_notified_update_version, None);
    }

    #[test]
    fn system_config_round_trip_with_update_fields() {
        let s = SystemConfig {
            autostart: false,
            auto_check_updates: false,
            last_notified_update_version: Some("0.2.0".into()),
            script_history_enabled: true,
        };
        let json = serde_json::to_string(&s).unwrap();
        assert!(json.contains("\"autoCheckUpdates\":false"));
        assert!(json.contains("\"lastNotifiedUpdateVersion\":\"0.2.0\""));
        let back: SystemConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(s, back);
    }

    #[test]
    fn system_config_omits_last_notified_update_version_when_none() {
        let s = SystemConfig {
            autostart: false,
            auto_check_updates: true,
            last_notified_update_version: None,
            script_history_enabled: true,
        };
        let json = serde_json::to_string(&s).unwrap();
        assert!(
            !json.contains("lastNotifiedUpdateVersion"),
            "field should be skipped when None: {json}"
        );
    }

    #[test]
    fn default_config_enables_auto_check_updates() {
        let cfg = Config::default();
        assert!(cfg.system.auto_check_updates);
        assert_eq!(cfg.system.last_notified_update_version, None);
    }

    #[test]
    fn system_config_defaults_script_history_enabled_to_true_when_absent() {
        // Plano-18 e anteriores: payload sem o campo precisa virar `true`.
        let s: SystemConfig = serde_json::from_str(r#"{"autostart":false}"#).unwrap();
        assert!(s.script_history_enabled);
    }

    #[test]
    fn system_config_round_trip_with_script_history_disabled() {
        let s = SystemConfig {
            autostart: false,
            auto_check_updates: true,
            last_notified_update_version: None,
            script_history_enabled: false,
        };
        let json = serde_json::to_string(&s).unwrap();
        assert!(json.contains("\"scriptHistoryEnabled\":false"));
        let back: SystemConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(s, back);
    }

    #[test]
    fn default_config_enables_script_history() {
        let cfg = Config::default();
        assert!(cfg.system.script_history_enabled);
    }
}
