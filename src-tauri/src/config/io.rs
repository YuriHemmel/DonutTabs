use super::schema::Config;
use super::validate::validate;
use crate::errors::{AppError, AppResult};
use std::path::Path;

/// Lê a config do caminho dado. Se o arquivo não existe, retorna `Config::default()`.
/// Se existe mas é inválido (JSON quebrado ou validação falha), retorna erro.
pub fn load_from_path(path: &Path) -> AppResult<Config> {
    if !path.exists() {
        return Ok(Config::default());
    }
    let raw = std::fs::read_to_string(path)?;
    let config: Config = serde_json::from_str(&raw)?;
    validate(&config)?;
    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn returns_default_when_file_missing() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        let cfg = load_from_path(&path).unwrap();
        assert_eq!(cfg, Config::default());
    }

    #[test]
    fn parses_valid_file() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        let cfg = Config::default();
        std::fs::write(&path, serde_json::to_string(&cfg).unwrap()).unwrap();
        let loaded = load_from_path(&path).unwrap();
        assert_eq!(loaded, cfg);
    }

    #[test]
    fn rejects_malformed_json() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(&path, "{ not json").unwrap();
        let err = load_from_path(&path).unwrap_err();
        matches!(err, AppError::Config(_));
    }

    #[test]
    fn rejects_semantically_invalid() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        let mut cfg = Config::default();
        cfg.pagination.items_per_page = 99;
        std::fs::write(&path, serde_json::to_string(&cfg).unwrap()).unwrap();
        let err = load_from_path(&path).unwrap_err();
        matches!(err, AppError::Config(_));
    }
}
