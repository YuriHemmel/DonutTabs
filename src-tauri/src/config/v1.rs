//! Snapshot do schema v1 — usado **somente** para deserialização de configs
//! antigas no `load_from_path`. Os campos correspondem ao schema do MVP
//! (Plano 1 + Plano 2). Não derivam `TS` porque não vão para o frontend.

use super::schema::{Interaction, Item, Language, OpenMode, Pagination, SystemConfig, Theme};
use serde::Deserialize;
use uuid::Uuid;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigV1 {
    #[allow(dead_code)]
    pub version: u32,
    pub shortcut: String,
    pub appearance: AppearanceV1,
    pub interaction: Interaction,
    pub pagination: Pagination,
    pub system: SystemConfig,
    pub tabs: Vec<TabV1>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceV1 {
    pub theme: Theme,
    #[serde(default)]
    pub language: Language,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabV1 {
    pub id: Uuid,
    pub name: Option<String>,
    pub icon: Option<String>,
    pub order: u32,
    pub open_mode: OpenMode,
    pub items: Vec<Item>,
}
