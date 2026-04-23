# DonutTabs — Plano 1: Fundação funcional

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: Use superpowers:subagent-driven-development (recomendada) ou superpowers:executing-plans para implementar este plano tarefa-a-tarefa. Passos usam checkbox (`- [ ]`) para rastreamento.

**Meta:** Entregar a primeira slice vertical funcional do DonutTabs: app vive no tray, responde a atalho global mostrando uma janela transparente com o donut renderizado a partir de um arquivo de config editado manualmente; selecionar uma aba abre todas as URLs no navegador padrão; ESC/clique-fora/blur fecha o donut.

**Arquitetura:** Tauri 2 com núcleo Rust (config read-only, tray, shortcut, donut_window, launcher) e frontend TypeScript/React renderizando o donut em SVG. Config em JSON no `app_config_dir()`. Sem UI de Settings nesta slice — cadastro de abas é feito editando o JSON diretamente; a engrenagem e o "X" no centro do donut são placeholders visuais sem ação.

**Stack:** Tauri 2, Rust (serde, ts-rs, thiserror, uuid, mouse_position), TypeScript, React, Vite, Vitest, cargo test.

**Fora desta slice (vem no Plano 2+):** Janela de configurações, `save_tab`/`delete_tab`, fatia "+", paginação, hover-hold para editar/excluir, sistema de tema claro/auto, auto-start, recovery de config corrompida, testes E2E.

---

## Estrutura de arquivos

### Núcleo Rust (`src-tauri/`)

| Arquivo | Responsabilidade |
|---|---|
| `Cargo.toml` | Dependências: Tauri 2 core, plugins (global-shortcut, opener), serde, ts-rs, thiserror, uuid, mouse_position |
| `tauri.conf.json` | Config do app (identificador, janelas do donut transparente) |
| `build.rs` | Geração de bindings TypeScript via ts-rs (hook no build) |
| `src/main.rs` | Entrypoint; amarração de módulos, setup do tray, registro de comandos |
| `src/config/mod.rs` | Fachada do módulo config (re-exports) |
| `src/config/schema.rs` | Structs `Config`, `Tab`, `Item` com `serde` + `ts-rs` derive |
| `src/config/validate.rs` | Validação semântica (name/icon, URLs, IDs únicos) |
| `src/config/io.rs` | Leitura de disco, caminho via `app_config_dir`, default se ausente |
| `src/tray/mod.rs` | Ícone do tray + menu (Abrir donut, Sair) |
| `src/shortcut/mod.rs` | Registro/desregistro do atalho global e handler |
| `src/donut_window/mod.rs` | Criação/mostra/esconde da janela transparente do donut |
| `src/launcher/mod.rs` | Trait `Opener` + implementação via plugin `opener`; abre URLs de uma aba |
| `src/commands.rs` | Comandos Tauri (`get_config`, `open_tab`, `hide_donut`) |
| `src/errors.rs` | Enum `AppError` via `thiserror` |

### Frontend (`src/`)

| Arquivo | Responsabilidade |
|---|---|
| `package.json` | Deps: react, react-dom, @tauri-apps/api, vite, vitest, @testing-library/react, typescript |
| `tsconfig.json` | Config TS (strict, target ES2022, jsx react-jsx) |
| `vite.config.ts` | Multi-entrypoint (donut.html + index.html) |
| `donut.html` | HTML entrypoint da janela do donut |
| `src/entry/donut.tsx` | Mount React + providers (tema, config) |
| `src/donut/Donut.tsx` | Componente raiz do donut (SVG) |
| `src/donut/Slice.tsx` | Uma fatia SVG (path arc + label) |
| `src/donut/CenterCircle.tsx` | Círculo central estático (engrenagem esquerda + X direita — placeholders) |
| `src/donut/geometry.ts` | Cálculos polares (arco SVG path, ângulo → fatia) |
| `src/donut/useSliceHighlight.ts` | Hook: coordenada do mouse → índice da fatia destacada |
| `src/core/ipc.ts` | Wrapper tipado sobre `invoke` |
| `src/core/types.ts` | Tipos gerados pelo ts-rs (arquivo gerado automaticamente) |
| `src/core/theme.ts` | Tema dark fixo nesta slice (expansível) |

### Testes

| Arquivo | Cobertura |
|---|---|
| `src-tauri/src/config/schema.rs` (mod tests) | Round-trip serde |
| `src-tauri/src/config/validate.rs` (mod tests) | Casos de validação (name/icon, URLs, IDs) |
| `src-tauri/src/config/io.rs` (mod tests) | Default quando ausente, erro em JSON inválido |
| `src-tauri/src/launcher/mod.rs` (mod tests) | Opener mockado, acumulação de erros |
| `src/donut/__tests__/geometry.test.ts` | Cálculos de arco e ângulo |
| `src/donut/__tests__/useSliceHighlight.test.ts` | Hook sob eventos mockados |
| `src/donut/__tests__/Donut.test.tsx` | Renderização com config fake |

---

## Tarefas

### Task 1: Scaffold do projeto Tauri 2

**Arquivos:**
- Criar: estrutura inicial via `create-tauri-app`
- Criar: `src-tauri/` e `src/`

- [ ] **Step 1.1 — Rodar scaffolding**

Na raiz `/home/yuri/DonutTabs`:

```bash
npm create tauri-app@latest -- --template react-ts --identifier com.donuttabs.app . --force
```

Se perguntar sobre sobrescrever arquivos (README.md), aceitar (já temos README simples).

- [ ] **Step 1.2 — Instalar deps**

```bash
npm install
```

- [ ] **Step 1.3 — Verificar que o dev build roda**

```bash
npm run tauri dev
```

Esperado: janela padrão do Tauri abre com "Welcome to Tauri". Fechar a janela.

- [ ] **Step 1.4 — Commit**

```bash
git add -A
git commit -m "feat: scaffold Tauri 2 React+TS project"
```

---

### Task 2: Adicionar plugins Tauri e deps do núcleo

**Arquivos:**
- Modificar: `src-tauri/Cargo.toml`
- Modificar: `package.json`

- [ ] **Step 2.1 — Adicionar crates Rust**

Editar `src-tauri/Cargo.toml`, adicionar na seção `[dependencies]`:

```toml
tauri-plugin-global-shortcut = "2"
tauri-plugin-opener = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "1"
uuid = { version = "1", features = ["v4", "serde"] }
ts-rs = { version = "9", features = ["serde-compat", "uuid-impl"] }
mouse_position = "0.1"
url = "2"
```

Adicionar `[dev-dependencies]`:

```toml
tempfile = "3"
```

- [ ] **Step 2.2 — Adicionar deps npm**

```bash
npm install @tauri-apps/plugin-global-shortcut @tauri-apps/plugin-opener
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitest/ui
```

- [ ] **Step 2.3 — Verificar que compila**

```bash
cd src-tauri && cargo check && cd ..
```

Esperado: compila sem erros (pode ter warnings sobre deps não usadas ainda).

- [ ] **Step 2.4 — Commit**

```bash
git add -A
git commit -m "chore: add Tauri plugins and Rust/npm deps"
```

---

### Task 3: Configurar janelas, permissões e feature `macos-private-api`

**Arquivos:**
- Modificar: `src-tauri/tauri.conf.json`
- Modificar: `src-tauri/Cargo.toml` (feature `macos-private-api` no crate `tauri` — exigido pelo flag `macOSPrivateApi` da config)

- [ ] **Step 3.1 — Substituir seção `app.windows`**

Abrir `src-tauri/tauri.conf.json`. Na chave `app.windows`, deixar **array vazio**: `[]`. As janelas serão criadas programaticamente (permite transparência e configurações específicas).

- [ ] **Step 3.2 — Habilitar `macOSPrivateApi` (necessário para transparência no macOS)**

Em `app`, adicionar:

```json
"macOSPrivateApi": true
```

Também atualizar a linha do crate `tauri` em `src-tauri/Cargo.toml` para habilitar a feature correspondente (Tauri 2 exige paridade entre esse flag e a feature de cargo):

```toml
tauri = { version = "2", features = ["macos-private-api"] }
```

- [ ] **Step 3.3 — Adicionar capabilities**

Criar/editar `src-tauri/capabilities/default.json`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capabilities padrão do DonutTabs",
  "windows": ["donut", "main"],
  "permissions": [
    "core:default",
    "core:window:allow-close",
    "core:window:allow-hide",
    "core:window:allow-show",
    "core:window:allow-set-focus",
    "global-shortcut:default",
    "opener:default",
    "opener:allow-open-url"
  ]
}
```

- [ ] **Step 3.4 — Verificar build**

```bash
cd src-tauri && cargo check && cd ..
```

- [ ] **Step 3.5 — Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/capabilities/default.json src-tauri/Cargo.toml
git commit -m "chore: configure Tauri windows, capabilities and macos-private-api feature"
```

---

### Task 4: Criar skeletons dos módulos Rust

**Arquivos:**
- Criar: `src-tauri/src/config/mod.rs`, `schema.rs`, `validate.rs`, `io.rs`
- Criar: `src-tauri/src/tray/mod.rs`
- Criar: `src-tauri/src/shortcut/mod.rs`
- Criar: `src-tauri/src/donut_window/mod.rs`
- Criar: `src-tauri/src/launcher/mod.rs`
- Criar: `src-tauri/src/commands.rs`
- Criar: `src-tauri/src/errors.rs`
- Modificar: `src-tauri/src/lib.rs` (ou `main.rs` conforme scaffold)

- [ ] **Step 4.1 — Criar `errors.rs`**

```rust
// src-tauri/src/errors.rs
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "kind", content = "message")]
pub enum AppError {
    #[error("config error: {0}")]
    Config(String),
    #[error("shortcut error: {0}")]
    Shortcut(String),
    #[error("launcher error: {0}")]
    Launcher(String),
    #[error("window error: {0}")]
    Window(String),
    #[error("io error: {0}")]
    Io(String),
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self { AppError::Io(e.to_string()) }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self { AppError::Config(e.to_string()) }
}

pub type AppResult<T> = Result<T, AppError>;
```

- [ ] **Step 4.2 — Criar skeletons vazios dos demais módulos**

Cada um dos arquivos abaixo com apenas `// TODO: implementar`:

- `src-tauri/src/config/mod.rs`:
```rust
pub mod schema;
pub mod validate;
pub mod io;

pub use schema::*;
```

- `src-tauri/src/config/schema.rs`, `validate.rs`, `io.rs`: cada um vazio com `// placeholder`.

- `src-tauri/src/tray/mod.rs`, `shortcut/mod.rs`, `donut_window/mod.rs`, `launcher/mod.rs`, `commands.rs`: cada um com `// placeholder`.

- [ ] **Step 4.3 — Registrar módulos em `lib.rs`**

Editar `src-tauri/src/lib.rs` para começar com:

```rust
mod config;
mod tray;
mod shortcut;
mod donut_window;
mod launcher;
mod commands;
mod errors;

// resto do arquivo (função run() do scaffold) preservado por enquanto
```

- [ ] **Step 4.4 — Verificar build**

```bash
cd src-tauri && cargo check && cd ..
```

- [ ] **Step 4.5 — Commit**

```bash
git add -A
git commit -m "chore: create module skeletons for Rust core"
```

---

### Task 5: Implementar schema de config com serde + ts-rs

**Arquivos:**
- Modificar: `src-tauri/src/config/schema.rs`

- [ ] **Step 5.1 — Escrever testes de round-trip (FALHAM)**

Adicionar em `src-tauri/src/config/schema.rs`:

```rust
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
```

- [ ] **Step 5.2 — Rodar os testes (esperado: passam)**

```bash
cd src-tauri && cargo test --lib config::schema && cd ..
```

Esperado: 3 testes passam.

- [ ] **Step 5.3 — Commit**

```bash
git add src-tauri/src/config/schema.rs
git commit -m "feat(config): define Config/Tab/Item schema with serde and ts-rs"
```

---

### Task 6: Validação semântica da config

**Arquivos:**
- Modificar: `src-tauri/src/config/validate.rs`

- [ ] **Step 6.1 — Escrever testes (FALHAM — função não existe)**

```rust
// src-tauri/src/config/validate.rs
use super::schema::*;
use crate::errors::{AppError, AppResult};

/// Retorna `Ok(())` se a config é semanticamente válida.
/// Retorna `Err(AppError::Config(mensagem))` com descrição da primeira violação.
pub fn validate(config: &Config) -> AppResult<()> {
    // pagination.itemsPerPage entre 4 e 8
    if !(4..=8).contains(&config.pagination.items_per_page) {
        return Err(AppError::Config(format!(
            "itemsPerPage deve estar entre 4 e 8 (got {})",
            config.pagination.items_per_page
        )));
    }

    // hoverHoldMs > 0
    if config.interaction.hover_hold_ms == 0 {
        return Err(AppError::Config("hoverHoldMs deve ser > 0".into()));
    }

    // Cada tab: pelo menos name ou icon
    for tab in &config.tabs {
        let has_name = tab.name.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false);
        let has_icon = tab.icon.as_ref().map(|s| !s.trim().is_empty()).unwrap_or(false);
        if !has_name && !has_icon {
            return Err(AppError::Config(format!(
                "tab {} sem nome e sem ícone", tab.id
            )));
        }
    }

    // URLs parseáveis
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

    // IDs únicos
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
```

- [ ] **Step 6.2 — Exportar em `config/mod.rs`**

Garantir que `src-tauri/src/config/mod.rs` contém:

```rust
pub mod schema;
pub mod validate;
pub mod io;

pub use schema::*;
pub use validate::validate;
```

- [ ] **Step 6.3 — Rodar os testes**

```bash
cd src-tauri && cargo test --lib config::validate && cd ..
```

Esperado: 8 testes passam.

- [ ] **Step 6.4 — Commit**

```bash
git add src-tauri/src/config/
git commit -m "feat(config): semantic validation (name/icon, URLs, IDs, ranges)"
```

---

### Task 7: Leitura da config do disco

**Arquivos:**
- Modificar: `src-tauri/src/config/io.rs`

- [ ] **Step 7.1 — Escrever testes**

```rust
// src-tauri/src/config/io.rs
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
```

- [ ] **Step 7.2 — Rodar testes**

```bash
cd src-tauri && cargo test --lib config::io && cd ..
```

Esperado: 4 testes passam.

- [ ] **Step 7.3 — Commit**

```bash
git add src-tauri/src/config/io.rs
git commit -m "feat(config): load_from_path with default fallback"
```

---

### Task 8: Launcher com trait Opener mockável

**Arquivos:**
- Modificar: `src-tauri/src/launcher/mod.rs`

- [ ] **Step 8.1 — Escrever testes + implementação**

```rust
// src-tauri/src/launcher/mod.rs
use crate::config::schema::{Item, Tab};
use crate::errors::{AppError, AppResult};

pub trait Opener: Send + Sync {
    fn open_url(&self, url: &str) -> Result<(), String>;
}

/// Resultado da tentativa de abrir uma aba: lista de erros por item.
/// Se estiver vazio, tudo deu certo.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct LaunchOutcome {
    pub failures: Vec<(String, String)>, // (item_value, erro)
    pub total: usize,
}

pub fn launch_tab(tab: &Tab, opener: &dyn Opener) -> AppResult<LaunchOutcome> {
    let mut outcome = LaunchOutcome { total: tab.items.len(), ..Default::default() };
    for item in &tab.items {
        match item {
            Item::Url { value } => {
                if let Err(e) = opener.open_url(value) {
                    outcome.failures.push((value.clone(), e));
                }
            }
        }
    }
    if outcome.failures.len() == outcome.total && outcome.total > 0 {
        return Err(AppError::Launcher(format!(
            "todos os {} items falharam", outcome.total
        )));
    }
    Ok(outcome)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::schema::{OpenMode, Item, Tab};
    use std::sync::Mutex;
    use uuid::Uuid;

    struct MockOpener {
        calls: Mutex<Vec<String>>,
        fail_on: Vec<String>,
    }

    impl Opener for MockOpener {
        fn open_url(&self, url: &str) -> Result<(), String> {
            self.calls.lock().unwrap().push(url.to_string());
            if self.fail_on.iter().any(|f| f == url) {
                Err("simulated".into())
            } else {
                Ok(())
            }
        }
    }

    fn tab_with(urls: &[&str]) -> Tab {
        Tab {
            id: Uuid::new_v4(),
            name: Some("t".into()),
            icon: None,
            order: 0,
            open_mode: OpenMode::ReuseOrNewWindow,
            items: urls.iter().map(|u| Item::Url { value: (*u).into() }).collect(),
        }
    }

    #[test]
    fn opens_all_urls_in_order() {
        let opener = MockOpener { calls: Mutex::new(vec![]), fail_on: vec![] };
        let tab = tab_with(&["https://a", "https://b", "https://c"]);
        let outcome = launch_tab(&tab, &opener).unwrap();
        assert!(outcome.failures.is_empty());
        assert_eq!(outcome.total, 3);
        assert_eq!(*opener.calls.lock().unwrap(), vec!["https://a", "https://b", "https://c"]);
    }

    #[test]
    fn continues_after_individual_failure() {
        let opener = MockOpener {
            calls: Mutex::new(vec![]),
            fail_on: vec!["https://b".into()],
        };
        let tab = tab_with(&["https://a", "https://b", "https://c"]);
        let outcome = launch_tab(&tab, &opener).unwrap();
        assert_eq!(outcome.failures.len(), 1);
        assert_eq!(outcome.failures[0].0, "https://b");
        assert_eq!(opener.calls.lock().unwrap().len(), 3);
    }

    #[test]
    fn total_failure_returns_error() {
        let opener = MockOpener {
            calls: Mutex::new(vec![]),
            fail_on: vec!["https://a".into(), "https://b".into()],
        };
        let tab = tab_with(&["https://a", "https://b"]);
        assert!(launch_tab(&tab, &opener).is_err());
    }

    #[test]
    fn empty_tab_is_ok() {
        let opener = MockOpener { calls: Mutex::new(vec![]), fail_on: vec![] };
        let tab = tab_with(&[]);
        let outcome = launch_tab(&tab, &opener).unwrap();
        assert_eq!(outcome.total, 0);
    }
}
```

- [ ] **Step 8.2 — Rodar testes**

```bash
cd src-tauri && cargo test --lib launcher && cd ..
```

Esperado: 4 testes passam.

- [ ] **Step 8.3 — Commit**

```bash
git add src-tauri/src/launcher/mod.rs
git commit -m "feat(launcher): launch_tab with Opener trait and error accumulation"
```

---

### Task 9: Implementação real do Opener via plugin Tauri

**Arquivos:**
- Modificar: `src-tauri/src/launcher/mod.rs` (adicionar `TauriOpener`)

- [ ] **Step 9.1 — Adicionar impl real**

Adicionar ao final de `src-tauri/src/launcher/mod.rs` (antes do `#[cfg(test)]`):

```rust
pub struct TauriOpener<'a, R: tauri::Runtime> {
    app: &'a tauri::AppHandle<R>,
}

impl<'a, R: tauri::Runtime> TauriOpener<'a, R> {
    pub fn new(app: &'a tauri::AppHandle<R>) -> Self { Self { app } }
}

impl<'a, R: tauri::Runtime> Opener for TauriOpener<'a, R> {
    fn open_url(&self, url: &str) -> Result<(), String> {
        use tauri_plugin_opener::OpenerExt;
        self.app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
    }
}
```

- [ ] **Step 9.2 — Verificar compila**

```bash
cd src-tauri && cargo check && cd ..
```

- [ ] **Step 9.3 — Commit**

```bash
git add src-tauri/src/launcher/mod.rs
git commit -m "feat(launcher): TauriOpener implementation via opener plugin"
```

---

### Task 10: Estado global e comando `get_config`

**Arquivos:**
- Modificar: `src-tauri/src/commands.rs`
- Modificar: `src-tauri/src/lib.rs`

- [ ] **Step 10.1 — Definir AppState e comandos**

Substituir conteúdo de `src-tauri/src/commands.rs`:

```rust
use crate::config::{schema::Config, io::load_from_path};
use crate::errors::{AppError, AppResult};
use crate::launcher::{launch_tab, TauriOpener};
use std::path::PathBuf;
use std::sync::RwLock;
use tauri::Manager;
use uuid::Uuid;

pub struct AppState {
    pub config: RwLock<Config>,
    pub config_path: PathBuf,
}

#[tauri::command]
pub fn get_config(state: tauri::State<'_, AppState>) -> Config {
    state.config.read().unwrap().clone()
}

#[tauri::command]
pub fn open_tab<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    tab_id: Uuid,
) -> Result<(), AppError> {
    let cfg = state.config.read().unwrap();
    let tab = cfg.tabs.iter().find(|t| t.id == tab_id)
        .ok_or_else(|| AppError::Launcher(format!("tab {} não encontrada", tab_id)))?;
    let opener = TauriOpener::new(&app);
    launch_tab(tab, &opener)?;
    Ok(())
}

#[tauri::command]
pub fn hide_donut<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<(), AppError> {
    if let Some(window) = app.get_webview_window("donut") {
        window.hide().map_err(|e| AppError::Window(e.to_string()))?;
    }
    Ok(())
}

pub fn initial_load(config_path: PathBuf) -> AppResult<AppState> {
    let cfg = load_from_path(&config_path)?;
    Ok(AppState {
        config: RwLock::new(cfg),
        config_path,
    })
}
```

- [ ] **Step 10.2 — Commit**

```bash
git add src-tauri/src/commands.rs
git commit -m "feat(commands): AppState and get_config/open_tab/hide_donut"
```

---

### Task 11: Tray com menu e handlers

**Arquivos:**
- Modificar: `src-tauri/src/tray/mod.rs`

- [ ] **Step 11.1 — Implementar tray**

```rust
// src-tauri/src/tray/mod.rs
use crate::donut_window;
use crate::errors::AppResult;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, Runtime,
};

pub fn setup<R: Runtime>(app: &tauri::App<R>) -> AppResult<()> {
    let open = MenuItem::with_id(app, "open_donut", "Abrir donut", true, None::<&str>)
        .map_err(|e| crate::errors::AppError::Window(e.to_string()))?;
    let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)
        .map_err(|e| crate::errors::AppError::Window(e.to_string()))?;
    let menu = Menu::with_items(app, &[&open, &quit])
        .map_err(|e| crate::errors::AppError::Window(e.to_string()))?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("DonutTabs")
        .menu(&menu)
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "open_donut" => {
                let _ = donut_window::show(app);
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)
        .map_err(|e| crate::errors::AppError::Window(e.to_string()))?;

    Ok(())
}
```

- [ ] **Step 11.2 — Verificar compila (vai falhar — `donut_window::show` não existe ainda)**

Deixar o import `use crate::donut_window;` — a próxima task implementa.

- [ ] **Step 11.3 — Commit**

```bash
git add src-tauri/src/tray/mod.rs
git commit -m "feat(tray): setup tray icon with Open Donut and Quit menu"
```

---

### Task 12: Módulo `donut_window` — criação, posição, show/hide

**Arquivos:**
- Modificar: `src-tauri/src/donut_window/mod.rs`

- [ ] **Step 12.1 — Implementar**

```rust
// src-tauri/src/donut_window/mod.rs
use crate::errors::{AppError, AppResult};
use mouse_position::mouse_position::Mouse;
use tauri::{AppHandle, Manager, PhysicalPosition, Runtime, WebviewUrl, WebviewWindowBuilder};

const DONUT_LABEL: &str = "donut";
const DONUT_SIZE: f64 = 420.0;

pub fn show<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(DONUT_LABEL) {
        position_at_cursor(&window)?;
        window.show().map_err(|e| AppError::Window(e.to_string()))?;
        window.set_focus().map_err(|e| AppError::Window(e.to_string()))?;
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(app, DONUT_LABEL, WebviewUrl::App("donut.html".into()))
        .title("DonutTabs")
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .inner_size(DONUT_SIZE, DONUT_SIZE)
        .visible(false)
        .shadow(false)
        .build()
        .map_err(|e| AppError::Window(e.to_string()))?;

    position_at_cursor(&window)?;
    window.show().map_err(|e| AppError::Window(e.to_string()))?;
    window.set_focus().map_err(|e| AppError::Window(e.to_string()))?;
    Ok(())
}

fn position_at_cursor<R: Runtime>(window: &tauri::WebviewWindow<R>) -> AppResult<()> {
    let pos = match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => (x as f64, y as f64),
        Mouse::Error => return Ok(()), // se falhar, mantém posição padrão
    };

    // Centralizar a janela no cursor (considerando DPI via scale_factor).
    let scale = window.scale_factor().map_err(|e| AppError::Window(e.to_string()))?;
    let half = (DONUT_SIZE / 2.0) * scale;
    let x = (pos.0 - half).round() as i32;
    let y = (pos.1 - half).round() as i32;

    window.set_position(PhysicalPosition::new(x, y))
        .map_err(|e| AppError::Window(e.to_string()))?;
    Ok(())
}
```

- [ ] **Step 12.2 — Commit**

```bash
git add src-tauri/src/donut_window/mod.rs
git commit -m "feat(donut_window): transparent undecorated window centered at cursor"
```

---

### Task 13: Módulo `shortcut` — registro do atalho global

**Arquivos:**
- Modificar: `src-tauri/src/shortcut/mod.rs`

- [ ] **Step 13.1 — Implementar**

```rust
// src-tauri/src/shortcut/mod.rs
use crate::donut_window;
use crate::errors::{AppError, AppResult};
use tauri::{AppHandle, Runtime};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub fn register_from_config<R: Runtime>(
    app: &AppHandle<R>,
    shortcut_str: &str,
) -> AppResult<()> {
    let shortcut: Shortcut = shortcut_str.parse()
        .map_err(|e| AppError::Shortcut(format!("{e}")))?;

    let app_for_handler = app.clone();
    let target = shortcut.clone();

    app.global_shortcut().on_shortcut(target, move |_app, _sc, event| {
        if event.state() == ShortcutState::Pressed {
            let _ = donut_window::show(&app_for_handler);
        }
    }).map_err(|e| AppError::Shortcut(e.to_string()))?;

    Ok(())
}
```

- [ ] **Step 13.2 — Commit**

```bash
git add src-tauri/src/shortcut/mod.rs
git commit -m "feat(shortcut): register global shortcut that opens donut"
```

---

### Task 14: Amarrar tudo em `lib.rs`

**Arquivos:**
- Modificar: `src-tauri/src/lib.rs`

- [ ] **Step 14.1 — Substituir conteúdo**

```rust
// src-tauri/src/lib.rs
mod config;
mod tray;
mod shortcut;
mod donut_window;
mod launcher;
mod commands;
mod errors;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Caminho da config
            let dir = app.path().app_config_dir()
                .map_err(|e| format!("resolver app_config_dir: {e}"))?;
            std::fs::create_dir_all(&dir).ok();
            let config_path = dir.join("config.json");

            // Carregar config + state
            let state = commands::initial_load(config_path)
                .map_err(|e| format!("carregar config: {e}"))?;
            let shortcut_str = state.config.read().unwrap().shortcut.clone();
            app.manage(state);

            // Setup tray
            tray::setup(app).map_err(|e| format!("tray: {e}"))?;

            // Registrar atalho
            shortcut::register_from_config(&app.handle(), &shortcut_str)
                .map_err(|e| format!("shortcut: {e}"))?;

            // Criar janela do donut oculta (pré-aquecimento)
            // Não bloqueante se falhar — será recriada no primeiro show.
            let _ = donut_window::show(&app.handle());
            if let Some(w) = app.get_webview_window("donut") {
                let _ = w.hide();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::open_tab,
            commands::hide_donut,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 14.2 — Ajustar `main.rs` se necessário**

`src-tauri/src/main.rs` deve conter apenas:

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() { app_lib::run(); }
```

(o nome do crate é `app_lib` por padrão — confirmar em `Cargo.toml` chave `[lib]`; ajustar se diferente).

- [ ] **Step 14.3 — Verificar build**

```bash
cd src-tauri && cargo build && cd ..
```

Esperado: compila com warnings aceitáveis.

- [ ] **Step 14.4 — Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/main.rs
git commit -m "feat: wire tray, shortcut, donut_window in app setup"
```

---

### Task 15: Configurar Vite para múltiplos entrypoints + geração de tipos

**Arquivos:**
- Modificar: `vite.config.ts`
- Criar: `donut.html`
- Criar: `src/entry/donut.tsx`
- Criar: `src/core/ipc.ts`

- [ ] **Step 15.1 — Atualizar `vite.config.ts`**

```ts
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        donut: resolve(__dirname, "donut.html"),
      },
    },
  },
});
```

- [ ] **Step 15.2 — Criar `donut.html`**

```html
<!-- donut.html -->
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DonutTabs</title>
    <style>
      html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
      #root { width: 100vw; height: 100vh; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/entry/donut.tsx"></script>
  </body>
</html>
```

- [ ] **Step 15.3 — Criar `src/core/ipc.ts`**

```ts
// src/core/ipc.ts
import { invoke } from "@tauri-apps/api/core";
import type { Config } from "./types/Config";

export const ipc = {
  getConfig: () => invoke<Config>("get_config"),
  openTab: (tabId: string) => invoke<void>("open_tab", { tabId }),
  hideDonut: () => invoke<void>("hide_donut"),
};
```

- [ ] **Step 15.4 — Criar `src/entry/donut.tsx` (stub mínimo)**

```tsx
// src/entry/donut.tsx
import React from "react";
import { createRoot } from "react-dom/client";

function App() {
  return <div style={{ color: "white" }}>donut placeholder</div>;
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
```

- [ ] **Step 15.5 — Gerar tipos ts-rs**

```bash
cd src-tauri && cargo test --lib export_bindings && cd ..
```

(O derive `#[ts(export)]` gera os arquivos durante teste — se o comando não produzir arquivos em `src/core/types/`, rodar `cargo test` completo: `cd src-tauri && cargo test && cd ..`).

Verificar que `src/core/types/Config.ts` (e Tab, Item, etc.) foram gerados.

- [ ] **Step 15.6 — Verificar que `npm run tauri dev` inicia**

```bash
npm run tauri dev
```

Esperado: tray aparece, janela principal NÃO aparece (não criamos nenhuma "main" — se o scaffold criou, a janela ainda pode abrir; isso será resolvido na próxima task). Ao pressionar o atalho `Ctrl+Shift+Space`, a janela do donut aparece com "donut placeholder" no cursor. Clicar fora / ESC ainda não fecham (faltam handlers — próximas tasks).

Fechar o app via menu do tray → "Sair".

- [ ] **Step 15.7 — Commit**

```bash
git add -A
git commit -m "feat(frontend): vite multi-entry, donut html, ipc wrapper, placeholder mount"
```

---

### Task 16: Remover janela principal padrão do scaffold

**Arquivos:**
- Modificar: `src-tauri/tauri.conf.json`
- Remover: `index.html` e `src/main.tsx` (se scaffold criou janela default)

- [ ] **Step 16.1 — Confirmar que `app.windows` em `tauri.conf.json` está vazio (`[]`)**

Se ainda tiver a janela default do scaffold, remover.

- [ ] **Step 16.2 — Ajustar capabilities** (`src-tauri/capabilities/default.json`)

Remover "main" da lista `windows`:

```json
"windows": ["donut"],
```

- [ ] **Step 16.3 — Remover entrypoint `main` do Vite**

Em `vite.config.ts`, remover `main: resolve(__dirname, "index.html")` do `rollupOptions.input`, deixando só `donut`.

Deletar `index.html` e `src/main.tsx`/`src/App.tsx` se existirem (são do scaffold).

- [ ] **Step 16.4 — Verificar `npm run tauri dev`**

Esperado: nenhuma janela visível ao iniciar, só tray. Atalho abre donut.

- [ ] **Step 16.5 — Commit**

```bash
git add -A
git commit -m "chore: remove default scaffold main window"
```

---

### Task 17: Geometria do donut (lógica pura)

**Arquivos:**
- Criar: `src/donut/geometry.ts`
- Criar: `src/donut/__tests__/geometry.test.ts`
- Modificar: `package.json` (script `test`)

- [ ] **Step 17.1 — Adicionar script de teste**

Editar `package.json` para incluir em `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

Adicionar em `package.json` na raiz (fora de scripts):

```json
"vitest": {
  "environment": "jsdom"
}
```

Ou criar `vitest.config.ts`:

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true },
});
```

- [ ] **Step 17.2 — Escrever testes (FALHAM)**

```ts
// src/donut/__tests__/geometry.test.ts
import { describe, it, expect } from "vitest";
import { sliceAngleRange, pointToSliceIndex, arcPath } from "../geometry";

describe("sliceAngleRange", () => {
  it("divides full circle equally among N slices", () => {
    const r = sliceAngleRange(0, 4);
    // Começa no topo (–π/2), vai sentido horário. Slice 0: [–π/2, –π/2 + π/2).
    expect(r.start).toBeCloseTo(-Math.PI / 2);
    expect(r.end).toBeCloseTo(0);
  });

  it("second slice starts where first ends", () => {
    const a = sliceAngleRange(0, 4);
    const b = sliceAngleRange(1, 4);
    expect(b.start).toBeCloseTo(a.end);
  });
});

describe("pointToSliceIndex", () => {
  it("returns 0 for a point straight up from center", () => {
    const idx = pointToSliceIndex({ x: 0, y: -100 }, 4);
    expect(idx).toBe(0);
  });

  it("returns 1 for a point to the right", () => {
    const idx = pointToSliceIndex({ x: 100, y: 0 }, 4);
    expect(idx).toBe(1);
  });

  it("returns null if within inner radius (center dead zone)", () => {
    const idx = pointToSliceIndex({ x: 5, y: 5 }, 4, { innerRadius: 50 });
    expect(idx).toBeNull();
  });

  it("returns null if beyond outer radius", () => {
    const idx = pointToSliceIndex({ x: 1000, y: 0 }, 4, { outerRadius: 200 });
    expect(idx).toBeNull();
  });
});

describe("arcPath", () => {
  it("produces a valid SVG path starting with M", () => {
    const d = arcPath({ cx: 200, cy: 200, innerR: 80, outerR: 180, startAngle: 0, endAngle: Math.PI / 2 });
    expect(d.startsWith("M")).toBe(true);
    expect(d).toMatch(/A /); // contém comando de arco
  });
});
```

- [ ] **Step 17.3 — Implementar `geometry.ts`**

```ts
// src/donut/geometry.ts
export interface Point { x: number; y: number; }
export interface AngleRange { start: number; end: number; }

const START_OFFSET = -Math.PI / 2; // topo do círculo

/** Retorna o intervalo angular da fatia `index` em um donut com `n` fatias. */
export function sliceAngleRange(index: number, n: number): AngleRange {
  const step = (Math.PI * 2) / n;
  const start = START_OFFSET + step * index;
  return { start, end: start + step };
}

export interface SliceLookupOpts {
  innerRadius?: number; // se informado, pontos dentro retornam null
  outerRadius?: number; // se informado, pontos fora retornam null
}

/**
 * Dado um ponto em coordenadas relativas ao centro do donut
 * (x positivo à direita, y positivo para baixo — padrão SVG),
 * retorna o índice da fatia sob o ponto, ou null se fora dos limites.
 */
export function pointToSliceIndex(
  p: Point, n: number, opts: SliceLookupOpts = {}
): number | null {
  const r = Math.hypot(p.x, p.y);
  if (opts.innerRadius !== undefined && r < opts.innerRadius) return null;
  if (opts.outerRadius !== undefined && r > opts.outerRadius) return null;
  // atan2 retorna ângulo com 0 à direita; convertemos para começar no topo.
  let angle = Math.atan2(p.y, p.x) - START_OFFSET;
  angle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const step = (Math.PI * 2) / n;
  return Math.floor(angle / step);
}

export interface ArcPathOpts {
  cx: number; cy: number;
  innerR: number; outerR: number;
  startAngle: number; endAngle: number;
}

/** Gera o atributo `d` de um SVG <path> para uma fatia anelar. */
export function arcPath(o: ArcPathOpts): string {
  const { cx, cy, innerR, outerR, startAngle, endAngle } = o;
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const x1 = cx + outerR * Math.cos(startAngle);
  const y1 = cy + outerR * Math.sin(startAngle);
  const x2 = cx + outerR * Math.cos(endAngle);
  const y2 = cy + outerR * Math.sin(endAngle);
  const x3 = cx + innerR * Math.cos(endAngle);
  const y3 = cy + innerR * Math.sin(endAngle);
  const x4 = cx + innerR * Math.cos(startAngle);
  const y4 = cy + innerR * Math.sin(startAngle);
  return [
    `M ${x1} ${y1}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}
```

- [ ] **Step 17.4 — Rodar testes**

```bash
npm test
```

Esperado: todos os testes de `geometry.test.ts` passam.

- [ ] **Step 17.5 — Commit**

```bash
git add -A
git commit -m "feat(donut): geometry helpers (slice angles, hit-test, arc path)"
```

---

### Task 18: Hook `useSliceHighlight`

**Arquivos:**
- Criar: `src/donut/useSliceHighlight.ts`
- Criar: `src/donut/__tests__/useSliceHighlight.test.ts`

- [ ] **Step 18.1 — Escrever testes**

```ts
// src/donut/__tests__/useSliceHighlight.test.ts
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSliceHighlight } from "../useSliceHighlight";

describe("useSliceHighlight", () => {
  it("starts with null", () => {
    const { result } = renderHook(() => useSliceHighlight({
      center: { x: 200, y: 200 },
      slices: 4,
      innerRadius: 80,
      outerRadius: 200,
    }));
    expect(result.current.highlighted).toBeNull();
  });

  it("updates when mouse moves inside a slice", () => {
    const { result } = renderHook(() => useSliceHighlight({
      center: { x: 200, y: 200 },
      slices: 4,
      innerRadius: 80,
      outerRadius: 200,
    }));
    act(() => {
      // Ponto 150px acima do centro — slice 0 (topo)
      result.current.onMouseMove({ clientX: 200, clientY: 50 } as any);
    });
    expect(result.current.highlighted).toBe(0);
  });

  it("returns null inside inner radius", () => {
    const { result } = renderHook(() => useSliceHighlight({
      center: { x: 200, y: 200 },
      slices: 4,
      innerRadius: 80,
      outerRadius: 200,
    }));
    act(() => {
      result.current.onMouseMove({ clientX: 200, clientY: 200 } as any);
    });
    expect(result.current.highlighted).toBeNull();
  });
});
```

- [ ] **Step 18.2 — Implementar hook**

```ts
// src/donut/useSliceHighlight.ts
import { useCallback, useState } from "react";
import { pointToSliceIndex } from "./geometry";

export interface UseSliceHighlightOpts {
  center: { x: number; y: number };
  slices: number;
  innerRadius: number;
  outerRadius: number;
}

export function useSliceHighlight(opts: UseSliceHighlightOpts) {
  const [highlighted, setHighlighted] = useState<number | null>(null);

  const onMouseMove = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (opts.slices <= 0) { setHighlighted(null); return; }
    const p = { x: e.clientX - opts.center.x, y: e.clientY - opts.center.y };
    const idx = pointToSliceIndex(p, opts.slices, {
      innerRadius: opts.innerRadius,
      outerRadius: opts.outerRadius,
    });
    setHighlighted(idx);
  }, [opts.center.x, opts.center.y, opts.slices, opts.innerRadius, opts.outerRadius]);

  const onMouseLeave = useCallback(() => setHighlighted(null), []);

  return { highlighted, onMouseMove, onMouseLeave };
}
```

- [ ] **Step 18.3 — Rodar testes**

```bash
npm test
```

- [ ] **Step 18.4 — Commit**

```bash
git add -A
git commit -m "feat(donut): useSliceHighlight hook"
```

---

### Task 19: Componente `Slice` (SVG)

**Arquivos:**
- Criar: `src/donut/Slice.tsx`

- [ ] **Step 19.1 — Implementar**

```tsx
// src/donut/Slice.tsx
import React from "react";
import { arcPath } from "./geometry";

export interface SliceProps {
  cx: number; cy: number;
  innerR: number; outerR: number;
  startAngle: number; endAngle: number;
  label?: string;       // nome da aba (opcional)
  icon?: string;        // emoji/caractere (opcional)
  highlighted: boolean;
  onClick: () => void;
}

export const Slice: React.FC<SliceProps> = (p) => {
  const d = arcPath(p);
  const mid = (p.startAngle + p.endAngle) / 2;
  const labelR = (p.innerR + p.outerR) / 2;
  const lx = p.cx + labelR * Math.cos(mid);
  const ly = p.cy + labelR * Math.sin(mid);

  return (
    <g onClick={p.onClick} style={{ cursor: "pointer" }}>
      <path
        d={d}
        fill={p.highlighted ? "#2a3b5a" : "#1b2436"}
        stroke="#3a4968"
        strokeWidth={1}
      />
      <g transform={`translate(${lx} ${ly})`} textAnchor="middle" fill="#eaeaea">
        {p.icon && (
          <text y={p.label ? -8 : 4} fontSize={22}>{p.icon}</text>
        )}
        {p.label && (
          <text y={p.icon ? 18 : 4} fontSize={12}>{p.label}</text>
        )}
      </g>
    </g>
  );
};
```

- [ ] **Step 19.2 — Commit**

```bash
git add src/donut/Slice.tsx
git commit -m "feat(donut): Slice SVG component"
```

---

### Task 20: Componente `CenterCircle` (placeholder estático)

**Arquivos:**
- Criar: `src/donut/CenterCircle.tsx`

- [ ] **Step 20.1 — Implementar**

```tsx
// src/donut/CenterCircle.tsx
import React from "react";

export interface CenterCircleProps {
  cx: number; cy: number;
  r: number;
}

/**
 * Círculo central do donut. Metade esquerda mostra uma engrenagem (abre settings
 * em fases futuras), metade direita mostra um X (função reservada — Perfis na Fase 2).
 * Ambas são não-interativas nesta slice.
 */
export const CenterCircle: React.FC<CenterCircleProps> = ({ cx, cy, r }) => (
  <g>
    <circle cx={cx} cy={cy} r={r} fill="#141a28" stroke="#3a4968" strokeWidth={1} />
    <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="#3a4968" strokeWidth={1} />
    <text x={cx - r / 2} y={cy + 6} textAnchor="middle" fontSize={18} fill="#777">⚙</text>
    <text x={cx + r / 2} y={cy + 6} textAnchor="middle" fontSize={18} fill="#555">✕</text>
  </g>
);
```

- [ ] **Step 20.2 — Commit**

```bash
git add src/donut/CenterCircle.tsx
git commit -m "feat(donut): static CenterCircle placeholder"
```

---

### Task 21: Componente `Donut` compondo tudo

**Arquivos:**
- Criar: `src/donut/Donut.tsx`
- Criar: `src/donut/__tests__/Donut.test.tsx`

- [ ] **Step 21.1 — Escrever teste**

```tsx
// src/donut/__tests__/Donut.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Donut } from "../Donut";
import type { Tab } from "../../core/types/Tab";

function makeTab(id: string, name: string): Tab {
  return {
    id,
    name,
    icon: null,
    order: 0,
    openMode: "reuseOrNewWindow",
    items: [{ kind: "url", value: "https://example.com" }],
  } as unknown as Tab;
}

describe("Donut", () => {
  it("renders one slice per tab", () => {
    const tabs = [makeTab("1", "A"), makeTab("2", "B"), makeTab("3", "C")];
    const { container } = render(<Donut tabs={tabs} size={400} onSelect={() => {}} />);
    // cada fatia é um <path>
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBe(3);
  });

  it("renders empty donut when no tabs", () => {
    const { container } = render(<Donut tabs={[]} size={400} onSelect={() => {}} />);
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBe(0);
  });
});
```

- [ ] **Step 21.2 — Implementar Donut**

```tsx
// src/donut/Donut.tsx
import React from "react";
import type { Tab } from "../core/types/Tab";
import { Slice } from "./Slice";
import { CenterCircle } from "./CenterCircle";
import { sliceAngleRange } from "./geometry";
import { useSliceHighlight } from "./useSliceHighlight";

export interface DonutProps {
  tabs: Tab[];
  size: number;
  onSelect: (tabId: string) => void;
}

export const Donut: React.FC<DonutProps> = ({ tabs, size, onSelect }) => {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.46;
  const innerR = size * 0.22;

  const ordered = [...tabs].sort((a, b) => a.order - b.order);

  const { highlighted, onMouseMove, onMouseLeave } = useSliceHighlight({
    center: { x: cx, y: cy },
    slices: ordered.length,
    innerRadius: innerR,
    outerRadius: outerR,
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {ordered.map((tab, i) => {
        const { start, end } = sliceAngleRange(i, ordered.length);
        return (
          <Slice
            key={tab.id}
            cx={cx}
            cy={cy}
            innerR={innerR}
            outerR={outerR}
            startAngle={start}
            endAngle={end}
            label={tab.name ?? undefined}
            icon={tab.icon ?? undefined}
            highlighted={highlighted === i}
            onClick={() => onSelect(tab.id)}
          />
        );
      })}
      <CenterCircle cx={cx} cy={cy} r={innerR * 0.85} />
    </svg>
  );
};
```

- [ ] **Step 21.3 — Rodar testes**

```bash
npm test
```

- [ ] **Step 21.4 — Commit**

```bash
git add -A
git commit -m "feat(donut): Donut composition with slices and center"
```

---

### Task 22: Entrypoint do donut com IPC + handlers de dismiss

**Arquivos:**
- Modificar: `src/entry/donut.tsx`

- [ ] **Step 22.1 — Reescrever**

```tsx
// src/entry/donut.tsx
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Donut } from "../donut/Donut";
import { ipc } from "../core/ipc";
import type { Config } from "../core/types/Config";

const WINDOW_SIZE = 420;

function App() {
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    ipc.getConfig().then(setConfig).catch(console.error);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void ipc.hideDonut();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const w = getCurrentWindow();
    const unlisten = w.onFocusChanged(({ payload: focused }) => {
      if (!focused) void ipc.hideDonut();
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, []);

  const handleBackdropClick = (e: React.MouseEvent) => {
    // clique que não pegou uma fatia chega aqui (fora do donut)
    if (e.target === e.currentTarget) void ipc.hideDonut();
  };

  const handleSelect = async (tabId: string) => {
    try {
      await ipc.openTab(tabId);
    } finally {
      void ipc.hideDonut();
    }
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "grid",
        placeItems: "center",
        background: "transparent",
      }}
      onClick={handleBackdropClick}
    >
      {config && (
        <Donut tabs={config.tabs} size={WINDOW_SIZE} onSelect={handleSelect} />
      )}
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
```

- [ ] **Step 22.2 — Commit**

```bash
git add src/entry/donut.tsx
git commit -m "feat(donut): entry wires IPC, ESC/blur/outside-click dismissal"
```

---

### Task 23: Fixture de config manual para testar ponta-a-ponta

**Arquivos:**
- Criar: `docs/fixtures/config.example.json`

- [ ] **Step 23.1 — Criar fixture**

```json
{
  "version": 1,
  "shortcut": "CommandOrControl+Shift+Space",
  "appearance": { "theme": "dark" },
  "interaction": {
    "spawnPosition": "cursor",
    "selectionMode": "clickOrRelease",
    "hoverHoldMs": 800
  },
  "pagination": {
    "itemsPerPage": 6,
    "wheelDirection": "standard"
  },
  "system": { "autostart": false },
  "tabs": [
    {
      "id": "11111111-1111-1111-1111-111111111111",
      "name": "Dev",
      "icon": "💻",
      "order": 0,
      "openMode": "reuseOrNewWindow",
      "items": [
        { "kind": "url", "value": "https://github.com" },
        { "kind": "url", "value": "https://stackoverflow.com" }
      ]
    },
    {
      "id": "22222222-2222-2222-2222-222222222222",
      "name": "Notícias",
      "icon": "📰",
      "order": 1,
      "openMode": "reuseOrNewWindow",
      "items": [
        { "kind": "url", "value": "https://news.ycombinator.com" }
      ]
    },
    {
      "id": "33333333-3333-3333-3333-333333333333",
      "name": null,
      "icon": "🎵",
      "order": 2,
      "openMode": "reuseOrNewWindow",
      "items": [
        { "kind": "url", "value": "https://open.spotify.com" }
      ]
    }
  ]
}
```

- [ ] **Step 23.2 — Commit**

```bash
git add docs/fixtures/config.example.json
git commit -m "docs: add example config.json fixture"
```

---

### Task 24: Smoke test manual (três SOs)

**Arquivos:**
- Criar: `docs/qa-smoke.md`

- [ ] **Step 24.1 — Escrever checklist**

```markdown
# Smoke manual — Plano 1

Rodar este checklist antes de considerar o Plano 1 concluído. Repetir em cada SO.

## Pré-requisitos
1. Copiar `docs/fixtures/config.example.json` para o caminho de config do SO:
   - Linux: `~/.config/DonutTabs/config.json`
   - macOS: `~/Library/Application Support/DonutTabs/config.json`
   - Windows: `%APPDATA%\DonutTabs\config.json`

## Casos

- [ ] **Inicialização**: `npm run tauri dev` não abre janela visível. Ícone do DonutTabs aparece no tray do SO.
- [ ] **Atalho global**: `Ctrl+Shift+Space` (ou `Cmd+Shift+Space` no macOS) abre o donut no cursor.
- [ ] **Render**: donut mostra 3 fatias com ícones (💻, 📰, 🎵) e 2 com labels (Dev, Notícias).
- [ ] **Hover**: passar o mouse sobre uma fatia destaca-a visualmente.
- [ ] **Click na aba "Dev"**: navegador padrão abre github.com e stackoverflow.com. Donut fecha.
- [ ] **Atalho novamente**: abre donut de novo, desta vez mais rápido (janela pré-aquecida).
- [ ] **ESC**: com donut aberto, ESC fecha sem abrir nada.
- [ ] **Clique fora do donut** (área transparente): fecha sem abrir nada.
- [ ] **Alt-Tab** com donut aberto: donut fecha ao perder foco.
- [ ] **Tray → Abrir donut**: abre donut (no cursor atual).
- [ ] **Tray → Sair**: app encerra limpamente. Atalho global deixa de responder.

## Checks específicos por SO

- [ ] **Windows**: janela do donut é transparente (sem fundo visível), apenas o SVG renderiza.
- [ ] **macOS**: mesmo; confirma que `macOSPrivateApi: true` está funcionando.
- [ ] **Linux (X11)**: transparência funciona com compositor (KWin, Mutter, Picom, etc.).
- [ ] **Linux (Wayland)**: verificar que atalho global é registrado (alguns DEs bloqueiam — reportar se falhar).
```

- [ ] **Step 24.2 — Rodar smoke no Linux (ambiente de dev atual)**

Executar todos os itens. Marcar. Se algum falhar, abrir issue/corrigir antes de seguir.

- [ ] **Step 24.3 — Commit**

```bash
git add docs/qa-smoke.md
git commit -m "docs: manual QA smoke checklist for Plano 1"
```

---

### Task 25: Verificação final e limpeza

**Arquivos:**
- Nenhum novo — auditoria

- [ ] **Step 25.1 — Rodar toda a suíte**

```bash
cd src-tauri && cargo test && cd ..
npm test
```

Esperado: todos os testes passam.

- [ ] **Step 25.2 — Checar warnings**

```bash
cd src-tauri && cargo clippy -- -D warnings && cd ..
npx tsc --noEmit
```

Corrigir warnings que apareçam (remover imports não usados, etc.).

- [ ] **Step 25.3 — Build release nos três SOs (se disponível)**

```bash
npm run tauri build
```

Rodar localmente em Linux; se tiver acesso a Windows/macOS (ou CI configurado), rodar lá também. Se não, documentar que os builds cross-platform ficam para quando houver acesso — não bloqueia o fechamento do Plano 1 desde que Linux compile e rode.

- [ ] **Step 25.4 — Tag/commit final**

```bash
git tag plano-1-fundacao
git log --oneline | head -30
```

---

## Critérios de "pronto" do Plano 1

Todos os itens abaixo devem ser verdadeiros:

- [ ] `cargo test` e `npm test` passam sem falhas.
- [ ] `cargo clippy -- -D warnings` passa (ou warnings documentados como aceitáveis).
- [ ] `tsc --noEmit` passa.
- [ ] Smoke manual (docs/qa-smoke.md) completo no SO de desenvolvimento.
- [ ] App inicia via `npm run tauri dev` sem janela visível, só tray.
- [ ] Atalho global abre donut transparente no cursor com fatias renderizadas a partir de config fixture.
- [ ] Click em fatia abre URLs no navegador padrão e fecha o donut.
- [ ] ESC/blur/clique fora fecham o donut.

---

## O que vem no Plano 2

- Segunda janela (Settings) com `<TabList>`, `<TabEditor>`, `<ShortcutRecorder>`, `<AppearanceSection>`.
- Comandos `save_tab`, `delete_tab`, `set_shortcut` com write atômica.
- Evento `config-changed` sincronizando as janelas.
- Fatia "+" no donut abrindo Settings no modo "nova aba".
- Sistema de tema dark/light/auto (com tom azul claro no light).
- Validação completa de formulários com mensagens pt-BR.
