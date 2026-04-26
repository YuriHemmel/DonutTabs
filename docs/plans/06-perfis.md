# DonutTabs — Plano 6: Perfis (schema v2)

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: Use `superpowers:subagent-driven-development` (recomendada) ou `superpowers:executing-plans` para implementar este plano tarefa-a-tarefa. Passos usam checkbox (`- [ ]`) para rastreamento.

**Meta:** Suporte a múltiplos perfis (cada um com **abas, atalho global e tema próprios**). Schema v1 atual é migrado automaticamente para v2 no boot, gerando um perfil único contendo a config existente. UI ganha:

- **Profile switcher** no lado direito do `<CenterCircle>` do donut — click entra em "modo perfil"; fatias externas viram opções de perfil + "+" para criar novo (leva ao Settings).
- **Seletor de perfil no topo da Settings** — usuário escolhe qual perfil está editando; mutações de aba/atalho/tema escopam ao perfil selecionado.

**Arquitetura:** `Config` v2 separa estado **global** (idioma, interaction, pagination, autostart) de estado **por perfil** (shortcut, theme, tabs, name, icon). Comandos existentes (`save_tab` / `delete_tab` / `set_shortcut` / `set_theme`) passam a operar **sobre o perfil ativo**; comando dedicado `set_active_profile` troca o perfil corrente, re-registra o atalho e emite `config-changed`. `Language` permanece global (idioma da UI, não do perfil).

**Stack adicional:** nenhuma.

**Fora desta slice:**
- Drag-and-drop pra reordenar perfis (Plano 7).
- Compartilhar abas entre perfis / sincronização (futuro).
- Per-profile pagination/interaction/language (decisão deliberada — só shortcut/theme/tabs por perfil).

---

## Pré-requisitos (estado atual pós-merge do Plano 5)

- [src-tauri/src/config/schema.rs](../../src-tauri/src/config/schema.rs:1): `Config` v1 monolítico — `shortcut`, `appearance { theme, language }`, `tabs` todos no mesmo nível.
- [src-tauri/src/config/io.rs](../../src-tauri/src/config/io.rs:1): `load_from_path` lê e valida; `save_atomic` valida e grava. Sem migração.
- [src-tauri/src/commands.rs](../../src-tauri/src/commands.rs:1): `AppState { config, config_path, pending_settings_intent, active_shortcut }`. `save_tab` / `delete_tab` / `set_shortcut` / `set_theme` / `set_language` operam direto em `cfg.*`.
- [src/donut/CenterCircle.tsx](../../src/donut/CenterCircle.tsx:1): mostra ⚙ (esquerda, clicável) + 👤 (direita, `pointer-events: none`). Right-half é o slot reservado para o switcher.
- [src/settings/SettingsApp.tsx](../../src/settings/SettingsApp.tsx:1): `useConfig` é a fonte única; helpers `saveTab`/`setTheme`/`setShortcut` round-trip pelo IPC.
- [src/locales/{pt-BR,en}.json](../../src/locales): chaves cobrem Settings + erros; nada de perfil ainda.

---

## Estrutura de arquivos

### Novos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src-tauri/src/config/migrate.rs` | `migrate_to_v2(v1: ConfigV1) -> ConfigV2` puro + testes |
| `src-tauri/src/config/v1.rs` | Snapshot do schema v1 (somente para deserialize na migração — não derive `TS`) |
| `src/donut/ProfileSwitcher.tsx` | Renderiza fatias de perfis no donut quando em "modo perfil"; "+" no fim para criar |
| `src/settings/ProfilePicker.tsx` | Dropdown/lista no topo da Settings — seleciona qual perfil editar |
| `src/settings/__tests__/ProfilePicker.test.tsx` | Render, seleção, criação |
| `src/donut/__tests__/ProfileSwitcher.test.tsx` | Renderiza N fatias + "+", click chama callback |
| `src-tauri/src/config/__tests__/migrate_v1_v2.json` (fixture inline ou arquivo) | Snapshot real de config v1 para teste de migração |

### Arquivos modificados (mudanças grandes)

| Arquivo | Mudança |
|---|---|
| `src-tauri/src/config/schema.rs` | `Config` vira v2: `version: 2`, `activeProfileId`, `profiles: Vec<Profile>`, `appearance { language }` (só idioma), `interaction`, `pagination`, `system`. Novo struct `Profile { id, name, icon, shortcut, theme, tabs }` |
| `src-tauri/src/config/io.rs` | `load_from_path` tenta v2 primeiro; se `version: 1` (ou ausente), deserializa como v1 e roda `migrate_to_v2`; salva atômico em formato v2 |
| `src-tauri/src/config/validate.rs` | Valida `activeProfileId` aponta para perfil existente; cada perfil valida `shortcut`, `tabs` (regras antigas) |
| `src-tauri/src/commands.rs` | Comandos refatorados: `save_tab`/`delete_tab`/`set_shortcut`/`set_theme` operam no `active_profile` (lookup helper). Novos: `set_active_profile`, `create_profile`, `delete_profile`, `update_profile`. `set_language` continua global (não por perfil). `set_active_profile` re-registra o atalho do novo perfil |
| `src-tauri/src/lib.rs` | Setup registra atalho do perfil ativo (não mais `cfg.shortcut`) |
| `src/core/types/` | `Config.ts`, novo `Profile.ts`, `Appearance.ts` (sem `theme`) regenerados pelo ts-rs |
| `src/core/ipc.ts` | Wrappers `setActiveProfile`, `createProfile`, `deleteProfile`, `updateProfile` |
| `src/settings/useConfig.ts` | Expõe os novos helpers; `saveTab`/`setTheme`/`setShortcut` continuam com mesma assinatura mas internamente atuam no perfil ativo |
| `src/settings/SettingsApp.tsx` | `<ProfilePicker>` no topo (acima do `<SectionTabs>`); seções `Abas`/`Aparência`/`Atalho` operam no perfil **selecionado** (não necessariamente o ativo). Texto sutil indica "Editando perfil X". Intent `edit-tab:<id>` agora deve incluir o perfil dono — discutido abaixo |
| `src/donut/CenterCircle.tsx` | Right-half vira clicável quando `onProfileSwitcherClick` for fornecido |
| `src/donut/Donut.tsx` | Estado `mode: "tabs" \| "profiles"`; em `profiles` renderiza `<ProfileSwitcher>` em vez de fatias de aba |
| `src/entry/donut.tsx` | Forward de `onProfileSwitcherClick`, `onSelectProfile`, `onCreateProfile` |
| `src/locales/pt-BR.json` + `en.json` | Novas chaves `settings.profile.*`, `donut.profile.*`, `errors.config.*` (validação de perfil) |
| `CLAUDE.md` | Atualizar arquitetura, conventions, "Looking ahead" → Plano 7 |

---

## Tarefas

### Task 1: Schema v2 + struct `Profile`

**Arquivos:**
- Modificar: `src-tauri/src/config/schema.rs`

- [ ] **Step 1.1 — Definir `Profile` e novo `Config`**

```rust
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
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, TS)]
#[ts(export, export_to = "../../src/core/types/")]
#[serde(rename_all = "camelCase")]
pub struct Config {
    pub version: u32,                   // = 2
    pub active_profile_id: Uuid,
    pub profiles: Vec<Profile>,
    pub appearance: Appearance,         // { language } só
    pub interaction: Interaction,
    pub pagination: Pagination,
    pub system: SystemConfig,
}
```

`Appearance` perde `theme` (vai para `Profile`). Mantém `language`:

```rust
pub struct Appearance {
    #[serde(default)]
    pub language: Language,
}
```

- [ ] **Step 1.2 — `Config::default()` com 1 perfil**

```rust
impl Default for Config {
    fn default() -> Self {
        let default_profile = Profile {
            id: Uuid::new_v4(),
            name: "Padrão".into(),
            icon: None,
            shortcut: "CommandOrControl+Shift+Space".into(),
            theme: Theme::Dark,
            tabs: vec![],
        };
        Self {
            version: 2,
            active_profile_id: default_profile.id,
            profiles: vec![default_profile],
            appearance: Appearance { language: Language::Auto },
            interaction: Interaction { /* ... */ },
            pagination: Pagination { /* ... */ },
            system: SystemConfig { autostart: false },
        }
    }
}
```

Nota: o teste `default_config_roundtrip` precisa atualizar — o `id` muda a cada chamada de `Config::default()`. Solução: o teste continua válido (compara o JSON consigo mesmo), só não pode hardcodar UUIDs.

- [ ] **Step 1.3 — Tests**

- `default_config_has_one_profile_with_active_id_matching` — `cfg.profiles.len() == 1 && cfg.active_profile_id == cfg.profiles[0].id`.
- `profile_roundtrips` — serialize+deserialize um Profile com tabs e bate.
- `config_v2_serializes_with_version_2` — `json contains "\"version\":2"`.

- [ ] **Step 1.4 — Build**

```bash
cd src-tauri && cargo build --lib
```

Esperado: erros de compilação em `commands.rs`/`validate.rs`/`io.rs` que ainda referenciam `cfg.shortcut`, `cfg.tabs`, `cfg.appearance.theme`. Isso é resolvido nas tasks seguintes.

- [ ] **Step 1.5 — Sem commit ainda** — schema sozinho deixa o app inconsistente. Próximas tasks fecham.

---

### Task 2: Snapshot v1 + migração

**Arquivos:**
- Criar: `src-tauri/src/config/v1.rs`, `src-tauri/src/config/migrate.rs`
- Modificar: `src-tauri/src/config/mod.rs`, `src-tauri/src/config/io.rs`

- [ ] **Step 2.1 — Snapshot v1**

Em `v1.rs`, copiar os structs antigos sem `ts-rs` (não exportam para o frontend; vivem só no Rust):

```rust
use serde::Deserialize;
use uuid::Uuid;
use super::schema::{Interaction, Item, Language, OpenMode, Pagination, SystemConfig, Theme};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigV1 {
    pub version: u32,                  // == 1
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
```

- [ ] **Step 2.2 — `migrate_to_v2(v1: ConfigV1) -> ConfigV2`**

```rust
pub fn migrate_to_v2(v1: ConfigV1) -> Config {
    let profile = Profile {
        id: Uuid::new_v4(),
        name: "Padrão".into(),
        icon: None,
        shortcut: v1.shortcut,
        theme: v1.appearance.theme,
        tabs: v1.tabs.into_iter().map(|t| Tab {
            id: t.id, name: t.name, icon: t.icon, order: t.order,
            open_mode: t.open_mode, items: t.items,
        }).collect(),
    };
    Config {
        version: 2,
        active_profile_id: profile.id,
        profiles: vec![profile],
        appearance: Appearance { language: v1.appearance.language },
        interaction: v1.interaction,
        pagination: v1.pagination,
        system: v1.system,
    }
}
```

- [ ] **Step 2.3 — Testes da migração**

```rust
#[test]
fn migrate_v1_preserves_shortcut_theme_and_tabs() {
    let v1 = ConfigV1 {
        version: 1,
        shortcut: "Ctrl+Alt+P".into(),
        appearance: AppearanceV1 { theme: Theme::Light, language: Language::PtBr },
        interaction: /* ... */,
        pagination: /* ... */,
        system: /* ... */,
        tabs: vec![TabV1 { /* exemplo */ }],
    };
    let v2 = migrate_to_v2(v1);
    assert_eq!(v2.version, 2);
    assert_eq!(v2.profiles.len(), 1);
    assert_eq!(v2.profiles[0].shortcut, "Ctrl+Alt+P");
    assert_eq!(v2.profiles[0].theme, Theme::Light);
    assert_eq!(v2.profiles[0].tabs.len(), 1);
    assert_eq!(v2.appearance.language, Language::PtBr);
    assert_eq!(v2.active_profile_id, v2.profiles[0].id);
}
```

- [ ] **Step 2.4 — `io.rs::load_from_path` faz migração**

```rust
pub fn load_from_path(path: &Path) -> AppResult<Config> {
    if !path.exists() { return Ok(Config::default()); }
    let raw = std::fs::read_to_string(path)?;
    // Detectar versão pelo campo "version" do JSON cru
    let v: serde_json::Value = serde_json::from_str(&raw)?;
    let version = v.get("version").and_then(|v| v.as_u64()).unwrap_or(1);
    let config = match version {
        2 => serde_json::from_str::<Config>(&raw)?,
        _ => {
            // Trata como v1 (versão 1 ou desconhecida com layout v1)
            let v1: super::v1::ConfigV1 = serde_json::from_str(&raw)?;
            super::migrate::migrate_to_v2(v1)
        }
    };
    validate(&config)?;
    Ok(config)
}
```

- [ ] **Step 2.5 — Teste de integração `io::tests::loads_and_migrates_v1_file`**

```rust
#[test]
fn loads_and_migrates_v1_file() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("config.json");
    std::fs::write(&path, r#"{"version":1,"shortcut":"Ctrl+Shift+J","appearance":{"theme":"light","language":"en"},"interaction":{"spawnPosition":"cursor","selectionMode":"clickOrRelease","hoverHoldMs":800},"pagination":{"itemsPerPage":6,"wheelDirection":"standard"},"system":{"autostart":false},"tabs":[]}"#).unwrap();
    let cfg = load_from_path(&path).unwrap();
    assert_eq!(cfg.version, 2);
    assert_eq!(cfg.profiles.len(), 1);
    assert_eq!(cfg.profiles[0].shortcut, "Ctrl+Shift+J");
    assert_eq!(cfg.profiles[0].theme, Theme::Light);
}
```

Nota: ainda **não** persiste em v2 automaticamente — só em memória. A primeira mutação (que dispara `save_atomic`) é que escreve v2. Decisão deliberada: usuário pode dar rollback caso algo dê errado.

---

### Task 3: Validação atualizada

**Arquivos:**
- Modificar: `src-tauri/src/config/validate.rs`

- [ ] **Step 3.1 — `validate(&Config)`**

```rust
pub fn validate(cfg: &Config) -> AppResult<()> {
    // pagination, interaction iguais (globais)
    if !(4..=8).contains(&cfg.pagination.items_per_page) { /* ... */ }
    if cfg.interaction.hover_hold_ms == 0 { /* ... */ }

    // Pelo menos 1 perfil
    if cfg.profiles.is_empty() {
        return Err(AppError::config("no_profiles", &[]));
    }
    // active aponta para perfil existente
    if !cfg.profiles.iter().any(|p| p.id == cfg.active_profile_id) {
        return Err(AppError::config("active_profile_not_found",
            &[("activeProfileId", cfg.active_profile_id.to_string())]));
    }
    // Cada perfil: shortcut não-vazio, name não-vazio, valida tabs
    for p in &cfg.profiles {
        if p.shortcut.trim().is_empty() {
            return Err(AppError::config("profile_shortcut_empty",
                &[("profileId", p.id.to_string())]));
        }
        if p.name.trim().is_empty() {
            return Err(AppError::config("profile_name_empty",
                &[("profileId", p.id.to_string())]));
        }
        // valida tabs (mesmas regras do v1)
        // ...
    }
    Ok(())
}
```

- [ ] **Step 3.2 — Testes**

- `validates_default_v2_config` — `Config::default()` é OK.
- `rejects_empty_profiles_array` — código `no_profiles`.
- `rejects_active_profile_not_found` — código `active_profile_not_found`.
- `rejects_profile_with_empty_shortcut` — código `profile_shortcut_empty`.
- `rejects_profile_with_empty_name` — código `profile_name_empty`.
- Testes antigos (`tab_without_name_or_icon_is_invalid`, etc.) precisam adaptar para inserir aba dentro de um perfil em vez de `cfg.tabs`.

- [ ] **Step 3.3 — Locales** — adicionar `errors.config.noProfiles`, `activeProfileNotFound`, `profileShortcutEmpty`, `profileNameEmpty` em pt-BR e en.

---

### Task 4: Comandos refatorados + novos

**Arquivos:**
- Modificar: `src-tauri/src/commands.rs`
- Modificar: `src-tauri/src/lib.rs`

- [ ] **Step 4.1 — Helpers privados**

```rust
fn active_profile_mut(cfg: &mut Config) -> AppResult<&mut Profile> {
    let id = cfg.active_profile_id;
    cfg.profiles.iter_mut().find(|p| p.id == id)
        .ok_or_else(|| AppError::config("active_profile_not_found",
            &[("activeProfileId", id.to_string())]))
}

fn profile_by_id_mut(cfg: &mut Config, id: Uuid) -> AppResult<&mut Profile> { /* ... */ }
```

- [ ] **Step 4.2 — Refator `save_tab` / `delete_tab` para escopar ao perfil ativo**

Assinatura mantém compat (frontend continua chamando `ipc.saveTab(tab)`), mas internamente o helper opera no perfil correto. **Adicionar parâmetro opcional** `profile_id: Option<Uuid>` para o caso de a Settings estar editando outro perfil que não o ativo:

```rust
#[tauri::command]
pub fn save_tab<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    tab: Tab,
    profile_id: Option<Uuid>,
) -> Result<Config, AppError> {
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        let target = profile_id.unwrap_or(cfg.active_profile_id);
        let profile = profile_by_id_mut(&mut cfg, target)?;
        apply_save_in_profile(profile, tab);
        save_with_rollback(&mut cfg, &state.config_path)?;
        cfg.clone()
    };
    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok(snapshot)
}
```

`set_shortcut`, `set_theme` ganham mesmo parâmetro opcional. `set_shortcut` adiciona validação extra: **só re-registra o atalho global se o perfil-alvo é o ativo** (mudanças em perfis inativos só escrevem disco, não tocam o atalho corrente).

- [ ] **Step 4.3 — Comandos novos**

```rust
#[tauri::command]
pub fn set_active_profile<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    profile_id: Uuid,
) -> Result<Config, AppError> {
    // 1. Lê o atalho do novo perfil (sem segurar lock durante o registro).
    let new_combo = {
        let cfg = state.config.read().unwrap();
        cfg.profiles.iter().find(|p| p.id == profile_id)
            .ok_or_else(|| AppError::config("profile_not_found",
                &[("profileId", profile_id.to_string())]))?
            .shortcut.clone()
    };

    // 2. Tenta trocar o atalho global. Conflict-aware (set_from_config).
    crate::shortcut::set_from_config(&app, &state.active_shortcut, &new_combo)?;

    // 3. Atualiza active_profile_id e persiste. Rollback do atalho se IO falhar.
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        let old_active = cfg.active_profile_id;
        cfg.active_profile_id = profile_id;
        if let Err(e) = save_atomic(&state.config_path, &cfg) {
            cfg.active_profile_id = old_active;
            // restaurar atalho do perfil antigo
            if let Some(old_shortcut) = cfg.profiles.iter().find(|p| p.id == old_active).map(|p| p.shortcut.clone()) {
                let _ = crate::shortcut::set_from_config(&app, &state.active_shortcut, &old_shortcut);
            }
            return Err(e);
        }
        cfg.clone()
    };
    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub fn create_profile<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    name: String,
    icon: Option<String>,
) -> Result<(Config, Uuid), AppError> {
    let new_id = Uuid::new_v4();
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        cfg.profiles.push(Profile {
            id: new_id,
            name,
            icon,
            shortcut: cfg.profiles[0].shortcut.clone(), // herda do primeiro como base
            theme: Theme::Dark,
            tabs: vec![],
        });
        save_with_rollback(&mut cfg, &state.config_path)?;
        cfg.clone()
    };
    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok((snapshot, new_id))
}

#[tauri::command]
pub fn delete_profile<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    profile_id: Uuid,
) -> Result<Config, AppError> {
    // 1. Bloqueia se for o último perfil
    // 2. Se for o ativo, transfere active_profile_id para o primeiro restante
    //    e re-registra o atalho desse novo ativo
    // 3. Remove
    // 4. Persiste (com rollback do atalho se IO falhar)
    // ...
}

#[tauri::command]
pub fn update_profile<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    profile_id: Uuid,
    name: Option<String>,
    icon: Option<Option<String>>,
) -> Result<Config, AppError> {
    // edita campos não-críticos (name/icon). shortcut e theme têm comandos
    // dedicados (set_shortcut/set_theme com profile_id).
}
```

- [ ] **Step 4.4 — Setup em `lib.rs`**

```rust
let shortcut_str = {
    let state: tauri::State<'_, AppState> = app.state();
    let cfg = state.config.read().unwrap();
    cfg.profiles.iter().find(|p| p.id == cfg.active_profile_id)
        .map(|p| p.shortcut.clone())
        .unwrap_or_else(|| "CommandOrControl+Shift+Space".into())
};
// ... register_from_config(...) inalterado
```

- [ ] **Step 4.5 — Registrar novos comandos no `generate_handler!`**

```rust
commands::set_active_profile,
commands::create_profile,
commands::delete_profile,
commands::update_profile,
```

- [ ] **Step 4.6 — Testes Rust** (puros, no estilo dos `apply_save`/`apply_delete`)

- `apply_save_in_profile_appends_with_correct_order`
- `apply_save_in_profile_updates_existing_preserving_order`
- `apply_delete_in_profile_renormalizes_order`
- `delete_profile_blocks_when_only_one_left`
- `delete_profile_reassigns_active_when_active_is_deleted`

- [ ] **Step 4.7 — `cargo test --lib && cargo clippy --lib -- -D warnings && cargo fmt --check`**

---

### Task 5: TS bindings + IPC + useConfig

**Arquivos:**
- Regenerados: `src/core/types/{Profile.ts, Config.ts, Appearance.ts}`
- Modificar: `src/core/ipc.ts`, `src/settings/useConfig.ts`

- [ ] **Step 5.1 — Regerar bindings**

```bash
cd src-tauri && cargo test --lib config::schema
```

Stage `src/core/types/`. **Apagar** `src/core/types/Theme.ts` se ts-rs não regerar (Theme agora vive em Profile).

- [ ] **Step 5.2 — `ipc.ts`**

```ts
import type { Profile } from "./types/Profile";

export const ipc = {
  // ... antigos ...
  saveTab: (tab: Tab, profileId?: string) =>
    invoke<Config>("save_tab", { tab, profileId: profileId ?? null }),
  deleteTab: (tabId: string, profileId?: string) =>
    invoke<Config>("delete_tab", { tabId, profileId: profileId ?? null }),
  setShortcut: (combo: string, profileId?: string) =>
    invoke<Config>("set_shortcut", { combo, profileId: profileId ?? null }),
  setTheme: (theme: Theme, profileId?: string) =>
    invoke<Config>("set_theme", { theme, profileId: profileId ?? null }),
  // novos
  setActiveProfile: (profileId: string) =>
    invoke<Config>("set_active_profile", { profileId }),
  createProfile: (name: string, icon?: string) =>
    invoke<[Config, string]>("create_profile", { name, icon: icon ?? null }),
  deleteProfile: (profileId: string) =>
    invoke<Config>("delete_profile", { profileId }),
  updateProfile: (profileId: string, name?: string, icon?: string | null) =>
    invoke<Config>("update_profile", { profileId, name: name ?? null, icon: icon === undefined ? null : icon }),
};
```

- [ ] **Step 5.3 — `useConfig` ganha helpers de perfil + propaga `profileId`**

```ts
const saveTab = useCallback((tab: Tab, profileId?: string) => ipc.saveTab(tab, profileId).then(setConfig), []);
// idem deleteTab/setShortcut/setTheme

const setActiveProfile = useCallback((id: string) => ipc.setActiveProfile(id).then(setConfig), []);
const createProfile = useCallback(async (name: string, icon?: string) => {
  const [next, newId] = await ipc.createProfile(name, icon);
  setConfig(next);
  return newId;
}, []);
const deleteProfile = useCallback((id: string) => ipc.deleteProfile(id).then(setConfig), []);
const updateProfile = useCallback((id: string, name?: string, icon?: string | null) => ipc.updateProfile(id, name, icon).then(setConfig), []);
```

- [ ] **Step 5.4 — Atualizar mocks dos testes** (`useConfig.test.tsx`, `SettingsApp.test.tsx`) com os novos comandos. Fixtures de config v2.

- [ ] **Step 5.5 — `npm test -- --run` + `npx tsc --noEmit`**

---

### Task 6: Settings — `<ProfilePicker>` + scoping

**Arquivos:**
- Criar: `src/settings/ProfilePicker.tsx`, `src/settings/__tests__/ProfilePicker.test.tsx`
- Modificar: `src/settings/SettingsApp.tsx`, `src/settings/{TabList,TabEditor,AppearanceSection,ShortcutSection}.tsx` (para receberem o `selectedProfileId` e propagarem ao IPC)

- [ ] **Step 6.1 — `<ProfilePicker>`**

Topbar acima do `<SectionTabs>`:

```
[ Perfil: ▼ Padrão ]   [ + Novo ]
```

- Select com todos os perfis.
- Botão "+ Novo" abre prompt simples (em primeira iteração: `window.prompt`) para nome → cria → seleciona.
- Botão "Excluir" só aparece se `profiles.length > 1` e não é o ativo (ou com confirm dedicado).

- [ ] **Step 6.2 — `SettingsApp` mantém `selectedProfileId` separado de `config.activeProfileId`**

Default: `selectedProfileId = config.activeProfileId`. Usuário pode editar outro perfil sem trocar o ativo. UI sutilmente sinaliza: "Editando perfil X (ativo: Y)" se diferente. Salvar uma aba/atalho/tema → escopa ao `selectedProfileId`.

- [ ] **Step 6.3 — Intent `edit-tab:<id>` precisa achar o perfil dono da aba**

`applyIntent` busca a aba por id em **todos os perfis**, e ajusta `selectedProfileId` para o perfil que a contém. Se não achar, ignora (igual ao Plano 5).

- [ ] **Step 6.4 — Testes**

- `ProfilePicker.test.tsx`: render com 2 perfis → 2 options; selecionar muda; clique "+ Novo" chama callback.
- `SettingsApp.test.tsx`: editing-profile-defaults-to-active, switching-profile-doesnt-change-active, intent-edit-tab-finds-profile-owner.

---

### Task 7: Donut — `<ProfileSwitcher>` + CenterCircle direita clicável

**Arquivos:**
- Modificar: `src/donut/CenterCircle.tsx`
- Criar: `src/donut/ProfileSwitcher.tsx`, `src/donut/__tests__/ProfileSwitcher.test.tsx`
- Modificar: `src/donut/Donut.tsx`, `src/entry/donut.tsx`
- Modificar: `src/locales/`

- [ ] **Step 7.1 — `CenterCircle` aceita `onProfileSwitcherClick`**

Igual ao gear-hit do Plano 3, mas para a metade direita (rect `cx..cx+r`). Visual: 👤 sem mudança quando inativo; durante o "modo perfil" pode receber realce — opcional.

- [ ] **Step 7.2 — `<ProfileSwitcher>`**

Renderiza N+1 fatias (N perfis + "+"). Cada fatia mostra `icon ?? primeira-letra-do-nome`. Click:
- Em perfil → `onSelectProfile(id)` → fecha modo perfil e troca o ativo
- Em "+" → `onCreateProfile()` → abre Settings (intent `new-profile`?) — para a primeira iteração, basta abrir Settings normal e o usuário usa o `<ProfilePicker>`

Opcional: o perfil ativo recebe destaque visual (borda dourada, p.ex.).

- [ ] **Step 7.3 — `<Donut>` ganha `mode` interno**

```ts
const [mode, setMode] = useState<"tabs" | "profiles">("tabs");
```

Em `mode === "profiles"`, renderiza `<ProfileSwitcher>` em vez das fatias de aba. Wheel/hover-hold/dots ficam suprimidos no modo perfil. ESC volta para `tabs`.

- [ ] **Step 7.4 — `donut.tsx` entrypoint**

`onSelectProfile(id)` → `ipc.setActiveProfile(id)` → o `config-changed` que chega refresca o donut → modo volta para `"tabs"`.
`onCreateProfile()` → `ipc.openSettings("new-profile")` (intent novo) + `ipc.hideDonut()`. Settings reconhece `new-profile` em `applyIntent`, foca o `<ProfilePicker>` com prompt aberto.

- [ ] **Step 7.5 — Locales** — chaves `donut.profile.switcherLabel`, `donut.profile.create`, `settings.profile.{title, new, delete, name, icon, active, editing}`.

- [ ] **Step 7.6 — Testes**

- `ProfileSwitcher.test.tsx`: render N+1, click em perfil chama `onSelectProfile`, click no "+" chama `onCreateProfile`.
- `CenterCircle.test.tsx` (se ainda não existir, criar): right-half clica → `onProfileSwitcherClick`.
- `Donut.test.tsx`: ao clicar no profile-hit, `mode` muda; ao clicar num perfil dentro do switcher, callback dispara.

---

### Task 8: CLAUDE.md + smoke + PR

- [ ] **Step 8.1 — Pipeline local**

```bash
npm test -- --run
npx tsc --noEmit
cd src-tauri && cargo fmt --check && cargo clippy --lib -- -D warnings && cargo test --lib && cd ..
```

- [ ] **Step 8.2 — CLAUDE.md**

- "Rust modules": `config/migrate.rs`, `config/v1.rs`, novo struct `Profile`.
- `commands.rs`: lista de comandos atualizada com profile-aware versões.
- "Frontend": `ProfilePicker`, `ProfileSwitcher`, novo `mode` no Donut.
- "Looking ahead": Plano 7 (polimento).
- "Conventions": "Mutações que tocam atalho/tema/abas escopam ao perfil ativo por padrão; comandos aceitam `profile_id` opcional para permitir edição cross-profile pela Settings."

- [ ] **Step 8.3 — Smoke manual**

- App migrou config v1 antiga sem perda? Verificar `%APPDATA%\DonutTabs\config.json` — deve permanecer v1 até primeira mutação. Após salvar uma aba, deve virar v2 com 1 perfil.
- Trocar perfil pelo donut → atalho global do novo perfil passa a funcionar; tema visual atualiza.
- Criar perfil novo → aparece no switcher; suas abas estão vazias.
- Excluir perfil ativo → app reassigna ativo automaticamente.

- [ ] **Step 8.4 — Commit final + push + PR**

```bash
git add CLAUDE.md docs/plans/06-perfis.md
git commit -m "docs(claude): mark Plano 6 (profiles) complete"
git push -u origin HEAD
gh pr create --title "Plano 6 — Perfis (schema v2)" --body-file tmp/pr-N-body.md
```

---

## Resumo dos commits previstos

1. `feat(config): schema v2 with Profile struct`
2. `feat(config): migrate v1 → v2 transparently on load`
3. `feat(config): validate profiles array and active reference`
4. `feat(commands): profile-aware mutations + set_active_profile/create/delete/update`
5. `feat(ipc): profile commands + profileId opcional nos mutadores existentes`
6. `feat(settings): ProfilePicker on top + section scoping to selected profile`
7. `feat(donut): right-half profile switcher + ProfileSwitcher mode`
8. `docs(claude): mark Plano 6 (profiles) complete`

---

## Critérios de aceitação

- [ ] App com `config.json` v1 antigo no disco abre sem perda de dados; primeira mutação salva v2.
- [ ] Múltiplos perfis convivem; cada um com seu shortcut, theme e tabs.
- [ ] Switcher pelo donut troca o perfil ativo, re-registra o atalho, atualiza o tema visualmente.
- [ ] Settings permite editar qualquer perfil sem trocar o ativo (sutil indicação de "editando ≠ ativo").
- [ ] Excluir perfil ativo reassigna o ativo automaticamente; bloqueia se for o último.
- [ ] `cargo clippy --lib -- -D warnings` verde.
- [ ] CI verde nas três plataformas.

---

## Notas para quem for implementar

- **Migração v1→v2 não persiste imediatamente.** Carrega em memória v2; só a primeira mutação grava o JSON novo. Isso protege contra rollback caso a v2 introduza bug — usuário ainda tem o v1 em disco.
- **Atalho re-registrado no `set_active_profile`** usa `shortcut::set_from_config` (conflict-aware). Falha de registro mantém o atalho atual (que é o do perfil antigo) — bom padrão.
- **`set_shortcut` / `set_theme` para perfil INATIVO**: só escreve disco. Não toca o atalho corrente nem aplica tema. O Donut/Settings respeitam isso ao mostrar o tema do perfil **ativo**, não do selecionado.
- **`Theme` continua global na Settings de bootstrap** — usa o tema do perfil ativo para aplicar `data-theme` no `<html>`. Quando muda perfil ativo, o `config-changed` listener reaplica `applyTheme(activeProfile.theme)`.
- **`Language` continua global**, fora do perfil. Idioma da UI é decisão do usuário, não do perfil.
- **Não engenheirar excessivamente o `<ProfileSwitcher>`** — primeira iteração pode ser fatias simples N+1 sem hover-hold (gestos do Plano 5 só fazem sentido em abas, não em perfis). Edição/exclusão de perfil mora no Settings.
