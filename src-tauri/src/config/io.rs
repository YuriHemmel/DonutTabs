use super::migrate::migrate_to_v2;
use super::schema::Config;
use super::v1::ConfigV1;
use super::validate::validate;
use crate::errors::AppResult;
use std::io::Write;
use std::path::Path;

/// Lê a config do caminho dado. Se o arquivo não existe, retorna `Config::default()`.
/// Se existe e tem `version: 1` (ou qualquer valor que não seja 2), trata como
/// v1 e migra para v2 em memória — sem reescrever o disco automaticamente
/// (próxima mutação grava em v2).
pub fn load_from_path(path: &Path) -> AppResult<Config> {
    if !path.exists() {
        return Ok(Config::default());
    }
    let raw = std::fs::read_to_string(path)?;
    let value: serde_json::Value = serde_json::from_str(&raw)?;
    let version = value.get("version").and_then(|v| v.as_u64()).unwrap_or(1);
    let config = if version >= 2 {
        serde_json::from_str::<Config>(&raw)?
    } else {
        let v1: ConfigV1 = serde_json::from_str(&raw)?;
        migrate_to_v2(v1)
    };
    validate(&config)?;
    Ok(config)
}

/// Grava a config em disco de forma atômica: valida, escreve em `<path>.tmp`,
/// renomeia para `<path>`. Falhar antes do rename deixa o arquivo original intacto.
pub fn save_atomic(path: &Path, config: &Config) -> AppResult<()> {
    validate(config)?;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let tmp_path = path.with_extension("json.tmp");
    let json = serde_json::to_string_pretty(config)?;

    {
        let mut file = std::fs::File::create(&tmp_path)?;
        file.write_all(json.as_bytes())?;
        // best-effort fsync; Windows não garante fsync de diretório
        let _ = file.sync_all();
    }

    std::fs::rename(&tmp_path, path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::errors::AppError;
    use tempfile::TempDir;

    #[test]
    fn returns_default_when_file_missing() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        let cfg = load_from_path(&path).unwrap();
        // Não compara igualdade total porque `Config::default()` gera um UUID
        // novo a cada chamada para o perfil "Padrão". Verifica forma.
        assert_eq!(cfg.version, 2);
        assert_eq!(cfg.profiles.len(), 1);
        assert_eq!(cfg.active_profile_id, cfg.profiles[0].id);
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
        assert!(matches!(err, AppError::Config { .. }), "got: {err:?}");
    }

    #[test]
    fn rejects_semantically_invalid() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        let mut cfg = Config::default();
        cfg.pagination.items_per_page = 99;
        std::fs::write(&path, serde_json::to_string(&cfg).unwrap()).unwrap();
        let err = load_from_path(&path).unwrap_err();
        assert!(matches!(err, AppError::Config { .. }), "got: {err:?}");
    }

    #[test]
    fn save_atomic_writes_then_renames() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        let cfg = Config::default();

        save_atomic(&path, &cfg).unwrap();

        assert!(path.exists());
        assert!(!path.with_extension("json.tmp").exists());

        let loaded = load_from_path(&path).unwrap();
        assert_eq!(loaded, cfg);
    }

    #[test]
    fn save_atomic_overwrites_existing_file() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        let cfg1 = Config::default();
        save_atomic(&path, &cfg1).unwrap();

        let mut cfg2 = cfg1.clone();
        cfg2.pagination.items_per_page = 7;
        save_atomic(&path, &cfg2).unwrap();

        let loaded = load_from_path(&path).unwrap();
        assert_eq!(loaded.pagination.items_per_page, 7);
    }

    #[test]
    fn save_atomic_creates_parent_dir_if_missing() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("nested").join("sub").join("config.json");
        let cfg = Config::default();
        save_atomic(&path, &cfg).unwrap();
        assert!(path.exists());
    }

    #[test]
    fn save_atomic_rejects_invalid_config() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        let mut cfg = Config::default();
        cfg.pagination.items_per_page = 99;
        let err = save_atomic(&path, &cfg).unwrap_err();
        assert!(matches!(err, AppError::Config { .. }));
        // Arquivo não foi criado — falhou antes de abrir o .tmp.
        assert!(!path.exists());
        assert!(!path.with_extension("json.tmp").exists());
    }

    #[test]
    fn save_atomic_preserves_previous_file_on_identical_save() {
        // Sanidade do contrato: uma segunda gravação idêntica resulta em conteúdo igual.
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        let cfg = Config::default();
        save_atomic(&path, &cfg).unwrap();
        let before = std::fs::read_to_string(&path).unwrap();

        save_atomic(&path, &cfg).unwrap();
        let after = std::fs::read_to_string(&path).unwrap();
        assert_eq!(before, after);
    }

    #[test]
    fn loads_v1_config_without_language_field_and_migrates() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(
            &path,
            r#"{
                "version": 1,
                "shortcut": "CommandOrControl+Shift+Space",
                "appearance": { "theme": "dark" },
                "interaction": { "spawnPosition": "cursor", "selectionMode": "clickOrRelease", "hoverHoldMs": 800 },
                "pagination": { "itemsPerPage": 6, "wheelDirection": "standard" },
                "system": { "autostart": false },
                "tabs": []
            }"#,
        )
        .unwrap();
        let cfg = load_from_path(&path).unwrap();
        // migrou para v2
        assert_eq!(cfg.version, 2);
        assert_eq!(cfg.profiles.len(), 1);
        assert_eq!(
            cfg.appearance.language,
            crate::config::schema::Language::Auto
        );
    }

    #[test]
    fn load_does_not_rewrite_v1_file_on_disk() {
        // Contrato: migração v1→v2 acontece em memória; o arquivo no disco
        // permanece v1 até a próxima mutação chamar `save_atomic`. Protege o
        // usuário de rollback em caso de bug na v2.
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        let raw = r#"{
                "version": 1,
                "shortcut": "Ctrl+Shift+J",
                "appearance": { "theme": "light", "language": "en" },
                "interaction": { "spawnPosition": "cursor", "selectionMode": "clickOrRelease", "hoverHoldMs": 800 },
                "pagination": { "itemsPerPage": 6, "wheelDirection": "standard" },
                "system": { "autostart": false },
                "tabs": []
            }"#;
        std::fs::write(&path, raw).unwrap();
        let _cfg = load_from_path(&path).unwrap();
        let after = std::fs::read_to_string(&path).unwrap();
        assert_eq!(after, raw, "load_from_path não pode reescrever o disco");
    }

    #[test]
    fn loads_v1_with_tabs_and_migrates_to_default_profile() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(
            &path,
            r#"{
                "version": 1,
                "shortcut": "Ctrl+Shift+J",
                "appearance": { "theme": "light", "language": "en" },
                "interaction": { "spawnPosition": "cursor", "selectionMode": "clickOrRelease", "hoverHoldMs": 800 },
                "pagination": { "itemsPerPage": 6, "wheelDirection": "standard" },
                "system": { "autostart": false },
                "tabs": [
                    { "id": "11111111-1111-1111-1111-111111111111", "name": "T", "icon": null, "order": 0, "openMode": "reuseOrNewWindow", "items": [{ "kind": "url", "value": "https://x.test" }] }
                ]
            }"#,
        )
        .unwrap();
        let cfg = load_from_path(&path).unwrap();
        assert_eq!(cfg.version, 2);
        assert_eq!(cfg.profiles.len(), 1);
        let p = &cfg.profiles[0];
        assert_eq!(p.shortcut, "Ctrl+Shift+J");
        assert_eq!(p.theme, crate::config::schema::Theme::Light);
        assert_eq!(p.tabs.len(), 1);
        assert_eq!(p.tabs[0].name.as_deref(), Some("T"));
        assert_eq!(cfg.active_profile_id, p.id);
    }
}
