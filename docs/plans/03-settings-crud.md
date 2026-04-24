# DonutTabs — Plano 3: Janela Settings (CRUD de abas)

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: Use `superpowers:subagent-driven-development` (recomendada) ou `superpowers:executing-plans` para implementar este plano tarefa-a-tarefa. Passos usam checkbox (`- [ ]`) para rastreamento.

**Meta:** Entregar uma janela de configurações decorada que permita ao usuário **criar, editar e excluir abas** pela UI, substituindo a edição manual do `config.json`. Inclui as peças de infraestrutura que as próximas fases (preferências, "+" no donut, perfis) vão consumir: write atômica em disco, evento `config-changed` que sincroniza janelas abertas, e a fronteira de comandos `save_tab` / `delete_tab`.

**Arquitetura:** Adiciona uma segunda webview (`settings`) no mesmo projeto Vite (multi-entry). A janela é normal (decorada, redimensionável). A janela do donut segue existindo inalterada em termos de UX; passa a escutar `config-changed` para refletir mudanças em tempo real. O Rust ganha um módulo `settings_window/` e os comandos `save_tab`, `delete_tab`, `open_settings` e `close_settings`, todos consumindo o `AppState` já existente. `config/io.rs` ganha `save_atomic` (escreve em `config.json.tmp` + `rename`).

**Stack adicional:** nenhuma crate nova. Frontend usa apenas React + i18next já instalados; o formulário é nativo (sem lib de forms).

**Fora desta slice (vem em planos seguintes):**
- `ShortcutRecorder`, `AppearanceSection`, `set_shortcut` (Plano 4 — preferências).
- Fatia "+" no donut, paginação, hover-hold editar/excluir (Plano 5 — gestos do donut).
- Perfis, schema v2 (Plano 6).
- Drag-and-drop para reordenar, menu de contexto, favicons, autostart (Plano 7).

---

## Pré-requisitos (estado atual após Plano 2 mergeado)

- [src-tauri/src/commands.rs](../../src-tauri/src/commands.rs) — `AppState { config: RwLock<Config>, config_path }`. `config_path` já está capturado, só falta usá-lo. Comandos existentes: `get_config`, `open_tab`, `hide_donut`.
- [src-tauri/src/config/io.rs](../../src-tauri/src/config/io.rs) — apenas `load_from_path`. Sem escrita.
- [src-tauri/src/errors.rs](../../src-tauri/src/errors.rs) — `AppError { code, context }` com helpers `AppError::config/launcher/window/shortcut`.
- [src-tauri/src/tray/mod.rs](../../src-tauri/src/tray/mod.rs) — menu com "Abrir donut" / "Sair". Sem "Configurações".
- [src-tauri/tauri.conf.json](../../src-tauri/tauri.conf.json) — `app.windows: []`; janelas criadas programaticamente.
- [src-tauri/capabilities/default.json](../../src-tauri/capabilities/default.json) — `windows: ["donut"]`; sem permissões de evento.
- [vite.config.ts](../../vite.config.ts) — multi-entry já estabelecido (`donut`); só precisa adicionar `settings`.
- [src/entry/donut.tsx](../../src/entry/donut.tsx) — faz bootstrap do i18n e renderiza o donut. Ainda não escuta `config-changed`.
- [src/donut/CenterCircle.tsx](../../src/donut/CenterCircle.tsx) — engrenagem ⚙ é placeholder visual (sem click handler).
- [src/locales/{pt-BR,en}.json](../../src/locales/) — contêm chaves de erro; nenhuma chave de UI do Settings ainda.

---

## Estrutura de arquivos

### Novos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `settings.html` | HTML entrypoint da janela Settings (análogo a `donut.html`) |
| `src/entry/settings.tsx` | Bootstrap do i18n + mount do `<SettingsApp>` |
| `src/settings/SettingsApp.tsx` | Layout da janela (sidebar/lista + detalhe) + estado global da config |
| `src/settings/TabList.tsx` | Lista de abas com botão "Adicionar aba" e seleção |
| `src/settings/TabEditor.tsx` | Formulário (name, icon, openMode, lista de URLs) |
| `src/settings/UrlListEditor.tsx` | Sub-componente com input + ✕ por URL + botão "Adicionar URL" |
| `src/settings/useConfig.ts` | Hook que carrega `get_config`, escuta `config-changed`, expõe `saveTab`/`deleteTab` |
| `src/settings/__tests__/TabEditor.test.tsx` | Validações de formulário |
| `src/settings/__tests__/TabList.test.tsx` | Seleção e empty state |
| `src/settings/__tests__/useConfig.test.tsx` | Reação a `config-changed` (mock de listen) |
| `src-tauri/src/settings_window/mod.rs` | `show()` / `focus()` / `close()` + criação da `WebviewWindow` |
| `src-tauri/capabilities/settings.json` | Permissões específicas da janela Settings (events, window sizing) |

### Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `vite.config.ts` | Adicionar `settings: resolve(__dirname, "settings.html")` nos inputs |
| `src-tauri/tauri.conf.json` | (sem mudança — janelas continuam criadas via código) |
| `src-tauri/capabilities/default.json` | Adicionar `"settings"` em `windows`; permissões `core:event:default` para ambas |
| `src-tauri/src/config/io.rs` | `save_atomic(path, &Config)` com write atômica + testes |
| `src-tauri/src/commands.rs` | `save_tab`, `delete_tab`, `open_settings`, `close_settings`; emit de `config-changed` |
| `src-tauri/src/lib.rs` | Registrar novos comandos; declarar módulo `settings_window` |
| `src-tauri/src/tray/mod.rs` | Adicionar item "Configurações" antes de "Sair" |
| `src/core/ipc.ts` | Wrappers tipados `saveTab`, `deleteTab`, `openSettings`, `closeSettings` |
| `src/donut/CenterCircle.tsx` | Torna a engrenagem ⚙ clicável → `openSettings` + `hideDonut` |
| `src/entry/donut.tsx` | Escuta `config-changed` e atualiza `config` state |
| `src/locales/pt-BR.json` | Novas chaves `settings.*` + erros novos |
| `src/locales/en.json` | Idem |
| `CLAUDE.md` | Atualizar "Looking ahead" → Plano 4 em diante |

---

## Tarefas

### Task 1: Multi-entrypoint — `settings.html` e Vite input

**Arquivos:**
- Criar: `settings.html`
- Modificar: `vite.config.ts`

- [ ] **Step 1.1 — Criar `settings.html`**

Decorado, com `lang="pt-BR"` (o i18n troca a semântica interna; o atributo HTML inicial apenas indica a preferência padrão e pode ficar estático). Fundo opaco (não-transparente, diferente do donut):

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DonutTabs — Configurações</title>
    <style>
      html, body { margin: 0; padding: 0; height: 100%; background: #0f1320; color: #dde; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
      #root { width: 100vw; height: 100vh; }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/entry/settings.tsx"></script>
  </body>
</html>
```

- [ ] **Step 1.2 — Atualizar `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        donut: resolve(__dirname, "donut.html"),
        settings: resolve(__dirname, "settings.html"),
      },
    },
  },
});
```

- [ ] **Step 1.3 — Stub do entrypoint para o build não quebrar**

Criar `src/entry/settings.tsx` com o mínimo renderizável (substituído na Task 10):

```tsx
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <div style={{ padding: 24 }}>DonutTabs — Settings (wip)</div>,
);
```

- [ ] **Step 1.4 — `npm run build` para verificar**

```bash
npm run build
```

Esperado: dois bundles emitidos (`dist/donut.html` e `dist/settings.html`).

- [ ] **Step 1.5 — Commit**

```bash
git add settings.html vite.config.ts src/entry/settings.tsx
git commit -m "chore(settings): add settings.html entry and vite multi-input"
```

---

### Task 2: Módulo Rust `settings_window/` e permissões

**Arquivos:**
- Criar: `src-tauri/src/settings_window/mod.rs`
- Criar: `src-tauri/capabilities/settings.json`
- Modificar: `src-tauri/capabilities/default.json`
- Modificar: `src-tauri/src/lib.rs`

- [ ] **Step 2.1 — Criar `src-tauri/src/settings_window/mod.rs`**

```rust
use crate::errors::{AppError, AppResult};
use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindowBuilder};

pub const SETTINGS_LABEL: &str = "settings";
const SETTINGS_MIN_SIZE: (f64, f64) = (720.0, 520.0);
const SETTINGS_INITIAL_SIZE: (f64, f64) = (960.0, 640.0);

pub fn show<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        window
            .show()
            .map_err(|e| AppError::window("window_show_failed", &[("reason", e.to_string())]))?;
        window.set_focus().map_err(|e| {
            AppError::window("window_set_focus_failed", &[("reason", e.to_string())])
        })?;
        return Ok(());
    }

    WebviewWindowBuilder::new(app, SETTINGS_LABEL, WebviewUrl::App("settings.html".into()))
        .title("DonutTabs — Configurações")
        .inner_size(SETTINGS_INITIAL_SIZE.0, SETTINGS_INITIAL_SIZE.1)
        .min_inner_size(SETTINGS_MIN_SIZE.0, SETTINGS_MIN_SIZE.1)
        .resizable(true)
        .decorations(true)
        .visible(true)
        .build()
        .map_err(|e| AppError::window("window_build_failed", &[("reason", e.to_string())]))?;

    Ok(())
}

pub fn close<R: Runtime>(app: &AppHandle<R>) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        window
            .close()
            .map_err(|e| AppError::window("window_close_failed", &[("reason", e.to_string())]))?;
    }
    Ok(())
}
```

- [ ] **Step 2.2 — Declarar o módulo em `lib.rs`**

```rust
mod settings_window;
```

- [ ] **Step 2.3 — Atualizar `capabilities/default.json`**

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capabilities padrão do DonutTabs",
  "windows": ["donut", "settings"],
  "permissions": [
    "core:default",
    "core:window:allow-close",
    "core:window:allow-hide",
    "core:window:allow-show",
    "core:window:allow-set-focus",
    "core:event:default",
    "global-shortcut:default",
    "opener:default",
    "opener:allow-open-url"
  ]
}
```

`core:event:default` cobre `emit`/`listen` em ambas as janelas. `settings.json` separado não é necessário ainda — entra no Plano 4 se houver permissão exclusiva.

- [ ] **Step 2.4 — Build de sanidade**

```bash
cd src-tauri && cargo check && cd ..
```

- [ ] **Step 2.5 — Commit**

```bash
git add src-tauri/src/settings_window/mod.rs src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "feat(settings-window): module + capabilities for the settings webview"
```

---

### Task 3: Write atômica em `config/io.rs`

**Arquivos:**
- Modificar: `src-tauri/src/config/io.rs`

- [ ] **Step 3.1 — Escrever testes (FALHAM — função não existe)**

No `#[cfg(test)] mod tests` de `src-tauri/src/config/io.rs`, adicionar:

```rust
#[test]
fn save_atomic_writes_then_renames() {
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("config.json");
    let cfg = Config::default();

    save_atomic(&path, &cfg).unwrap();

    assert!(path.exists());
    // Nenhum .tmp sobra após sucesso.
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
    // Arquivo não foi criado porque falhou antes da escrita.
    assert!(!path.exists());
}

#[test]
fn save_atomic_leaves_previous_file_on_serialization_success() {
    // Sanity check do contrato: entre abrir o .tmp e o rename, a versão antiga
    // permanece acessível. Aqui só verificamos que o rename acontece no fim.
    let dir = TempDir::new().unwrap();
    let path = dir.path().join("config.json");
    let cfg1 = Config::default();
    save_atomic(&path, &cfg1).unwrap();
    let content_before = std::fs::read_to_string(&path).unwrap();

    let cfg2 = cfg1.clone();
    save_atomic(&path, &cfg2).unwrap();
    let content_after = std::fs::read_to_string(&path).unwrap();
    assert_eq!(content_before, content_after);
}
```

Rodar:

```bash
cd src-tauri && cargo test --lib config::io && cd ..
```

Esperado: compile-error (`save_atomic` não existe).

- [ ] **Step 3.2 — Implementar `save_atomic`**

Em `src-tauri/src/config/io.rs`, adicionar:

```rust
use std::io::Write;

/// Grava a config em disco de forma atômica: escreve em `<path>.tmp` e depois
/// renomeia para `<path>`. Valida antes de escrever — falha aborta sem
/// tocar no arquivo existente.
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
        file.sync_all().ok(); // best-effort; Windows não garante fsync de dir
    }

    std::fs::rename(&tmp_path, path)?;
    Ok(())
}
```

Nota: o nome `.tmp` é determinístico (um por processo é suficiente — não há múltiplas escritas concorrentes no MVP). Se no futuro isso mudar, trocamos para `tempfile::NamedTempFile::persist`.

- [ ] **Step 3.3 — Rodar tests**

```bash
cd src-tauri && cargo test --lib config::io && cd ..
```

Esperado: 9 testes passam (4 antigos + 5 novos).

- [ ] **Step 3.4 — Commit**

```bash
git add src-tauri/src/config/io.rs
git commit -m "feat(config): save_atomic writes to .tmp then renames"
```

---

### Task 4: Comandos `save_tab`, `delete_tab`, `open_settings`, `close_settings` + evento `config-changed`

**Arquivos:**
- Modificar: `src-tauri/src/commands.rs`
- Modificar: `src-tauri/src/lib.rs`
- Modificar: `src-tauri/src/locales` (via testes — descrito abaixo)

- [ ] **Step 4.1 — Escrever teste de lógica (FALHAM)**

A lógica de mutação (inserir nova aba / atualizar existente / excluir) é pura — vale extrair para uma função testável. Criar em `src-tauri/src/commands.rs` no `#[cfg(test)]`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::schema::{Item, OpenMode, Tab};
    use uuid::Uuid;

    fn sample_tab(name: &str) -> Tab {
        Tab {
            id: Uuid::new_v4(),
            name: Some(name.into()),
            icon: None,
            order: 0,
            open_mode: OpenMode::ReuseOrNewWindow,
            items: vec![Item::Url {
                value: "https://example.com".into(),
            }],
        }
    }

    #[test]
    fn apply_save_appends_new_tab_with_next_order() {
        let mut cfg = Config::default();
        cfg.tabs.push(sample_tab("A")); // order 0
        cfg.tabs[0].order = 0;

        let new_tab = sample_tab("B");
        apply_save(&mut cfg, new_tab.clone());

        assert_eq!(cfg.tabs.len(), 2);
        assert_eq!(cfg.tabs[1].id, new_tab.id);
        assert_eq!(cfg.tabs[1].order, 1);
    }

    #[test]
    fn apply_save_updates_existing_tab_preserving_order() {
        let mut cfg = Config::default();
        let mut t = sample_tab("A");
        t.order = 3;
        let id = t.id;
        cfg.tabs.push(t);

        let mut updated = sample_tab("A-renamed");
        updated.id = id;
        updated.order = 99; // valor fornecido pelo cliente deve ser ignorado
        apply_save(&mut cfg, updated);

        assert_eq!(cfg.tabs.len(), 1);
        assert_eq!(cfg.tabs[0].name.as_deref(), Some("A-renamed"));
        assert_eq!(cfg.tabs[0].order, 3);
    }

    #[test]
    fn apply_delete_removes_and_renormalizes_order() {
        let mut cfg = Config::default();
        let t0 = {
            let mut t = sample_tab("A");
            t.order = 0;
            t
        };
        let t1 = {
            let mut t = sample_tab("B");
            t.order = 1;
            t
        };
        let t2 = {
            let mut t = sample_tab("C");
            t.order = 2;
            t
        };
        let id1 = t1.id;
        cfg.tabs.push(t0);
        cfg.tabs.push(t1);
        cfg.tabs.push(t2);

        apply_delete(&mut cfg, id1);

        assert_eq!(cfg.tabs.len(), 2);
        assert_eq!(cfg.tabs[0].order, 0);
        assert_eq!(cfg.tabs[1].order, 1);
        assert!(cfg.tabs.iter().all(|t| t.id != id1));
    }

    #[test]
    fn apply_delete_on_missing_id_is_noop() {
        let mut cfg = Config::default();
        cfg.tabs.push(sample_tab("A"));
        let before = cfg.tabs.len();

        apply_delete(&mut cfg, Uuid::new_v4());

        assert_eq!(cfg.tabs.len(), before);
    }
}
```

Rodar:

```bash
cd src-tauri && cargo test --lib commands && cd ..
```

Esperado: compile-error — `apply_save` / `apply_delete` não existem.

- [ ] **Step 4.2 — Implementar `apply_save` / `apply_delete`**

Em `src-tauri/src/commands.rs`:

```rust
use crate::config::io::save_atomic;

fn apply_save(cfg: &mut Config, incoming: Tab) {
    if let Some(existing) = cfg.tabs.iter_mut().find(|t| t.id == incoming.id) {
        // Preserva a ordem antiga; tudo mais vem do payload.
        let order = existing.order;
        *existing = Tab {
            order,
            ..incoming
        };
    } else {
        let order = cfg.tabs.len() as u32;
        cfg.tabs.push(Tab { order, ..incoming });
    }
}

fn apply_delete(cfg: &mut Config, id: Uuid) {
    cfg.tabs.retain(|t| t.id != id);
    for (i, t) in cfg.tabs.iter_mut().enumerate() {
        t.order = i as u32;
    }
}
```

Adicionar ao topo do arquivo:

```rust
use crate::config::schema::Tab;
use tauri::{Emitter, Manager}; // Manager já estava
```

- [ ] **Step 4.3 — Implementar comandos Tauri**

Ainda em `commands.rs`:

```rust
pub const CONFIG_CHANGED_EVENT: &str = "config-changed";

#[tauri::command]
pub fn save_tab<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    tab: Tab,
) -> Result<Config, AppError> {
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        apply_save(&mut cfg, tab);
        // Valida e persiste. Se falhar, revertemos o estado em memória.
        if let Err(e) = save_atomic(&state.config_path, &cfg) {
            // Recarrega do disco para que a memória reflita o último estado bom.
            if let Ok(fresh) = crate::config::io::load_from_path(&state.config_path) {
                *cfg = fresh;
            }
            return Err(e);
        }
        cfg.clone()
    };

    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub fn delete_tab<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    tab_id: Uuid,
) -> Result<Config, AppError> {
    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        apply_delete(&mut cfg, tab_id);
        if let Err(e) = save_atomic(&state.config_path, &cfg) {
            if let Ok(fresh) = crate::config::io::load_from_path(&state.config_path) {
                *cfg = fresh;
            }
            return Err(e);
        }
        cfg.clone()
    };

    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok(snapshot)
}

#[tauri::command]
pub fn open_settings<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<(), AppError> {
    crate::settings_window::show(&app)
}

#[tauri::command]
pub fn close_settings<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<(), AppError> {
    crate::settings_window::close(&app)
}
```

Remover o `#[allow(dead_code)]` acima de `config_path` em `AppState` — agora é consumido.

- [ ] **Step 4.4 — Registrar os comandos em `lib.rs`**

```rust
.invoke_handler(tauri::generate_handler![
    commands::get_config,
    commands::open_tab,
    commands::hide_donut,
    commands::save_tab,
    commands::delete_tab,
    commands::open_settings,
    commands::close_settings,
])
```

- [ ] **Step 4.5 — Rodar todos os testes Rust**

```bash
cd src-tauri && cargo test --lib && cargo clippy --lib && cargo fmt --check && cd ..
```

Esperado: tudo verde (os testes de mutação pura rodam sem Tauri).

- [ ] **Step 4.6 — Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat(commands): save_tab/delete_tab with atomic write and config-changed event"
```

---

### Task 5: Tray ganha item "Configurações"

**Arquivos:**
- Modificar: `src-tauri/src/tray/mod.rs`
- Modificar: `src/locales/{pt-BR,en}.json` (**nada** — o tray do Tauri exige strings no momento do build, fora do sistema i18n do React. Mantemos PT fixo; se em fases futuras o tray precisar alternar idioma, implementa-se troca dinâmica via evento)

- [ ] **Step 5.1 — Adicionar item**

Em `src-tauri/src/tray/mod.rs`, antes do `quit`:

```rust
let settings = MenuItem::with_id(app, "open_settings", "Configurações", true, None::<&str>)
    .map_err(|e| AppError::window("tray_menu_item_failed", &[("reason", e.to_string())]))?;
```

Atualizar `Menu::with_items(app, &[&open, &settings, &quit])`.

No `on_menu_event`, adicionar braço:

```rust
"open_settings" => {
    let _ = crate::settings_window::show(app);
}
```

- [ ] **Step 5.2 — Smoke local**

```bash
npm run tauri dev
```

Clicar no ícone do tray → "Configurações" → aparece a janela stub "DonutTabs — Settings (wip)". Fechar.

- [ ] **Step 5.3 — Commit**

```bash
git add src-tauri/src/tray/mod.rs
git commit -m "feat(tray): add Configurações menu item"
```

---

### Task 6: IPC typed + strings traduzíveis do Settings

**Arquivos:**
- Modificar: `src/core/ipc.ts`
- Modificar: `src/locales/pt-BR.json`, `src/locales/en.json`

- [ ] **Step 6.1 — Atualizar `src/core/ipc.ts`**

```ts
import { invoke } from "@tauri-apps/api/core";
import type { Config } from "./types/Config";
import type { Tab } from "./types/Tab";

export const ipc = {
  getConfig: () => invoke<Config>("get_config"),
  openTab: (tabId: string) => invoke<void>("open_tab", { tabId }),
  hideDonut: () => invoke<void>("hide_donut"),
  saveTab: (tab: Tab) => invoke<Config>("save_tab", { tab }),
  deleteTab: (tabId: string) => invoke<Config>("delete_tab", { tabId }),
  openSettings: () => invoke<void>("open_settings"),
  closeSettings: () => invoke<void>("close_settings"),
};

export const CONFIG_CHANGED_EVENT = "config-changed";
```

- [ ] **Step 6.2 — Adicionar chaves nos locales**

Em `src/locales/pt-BR.json`, adicionar à raiz:

```json
"settings": {
  "title": "Configurações",
  "tabs": {
    "sectionTitle": "Abas",
    "addTab": "Adicionar aba",
    "empty": "Nenhuma aba cadastrada. Clique em \"Adicionar aba\" para começar.",
    "selectPrompt": "Selecione uma aba para editar ou clique em \"Adicionar aba\"."
  },
  "editor": {
    "newTabTitle": "Nova aba",
    "name": "Nome",
    "namePlaceholder": "Trabalho",
    "icon": "Ícone",
    "iconPlaceholder": "💼",
    "iconHint": "Um emoji ou caractere curto. Nome ou ícone são obrigatórios.",
    "openMode": "Modo de abertura",
    "openModeReuseOrNewWindow": "Reutilizar ou nova janela",
    "openModeNewWindow": "Nova janela",
    "openModeNewTab": "Nova aba",
    "urls": "URLs",
    "urlPlaceholder": "https://…",
    "addUrl": "Adicionar URL",
    "removeUrl": "Remover URL",
    "save": "Salvar",
    "saving": "Salvando…",
    "cancel": "Cancelar",
    "delete": "Excluir",
    "confirmDelete": "Excluir aba \"{{label}}\"? Essa ação não pode ser desfeita.",
    "validationNameOrIcon": "Preencha nome ou ícone.",
    "validationAtLeastOneUrl": "Adicione ao menos uma URL.",
    "validationInvalidUrl": "URL inválida: {{value}}"
  }
}
```

E completar a seção `errors.config` com a chave que o `save_atomic` pode produzir (não há nova — as de `validate` já cobrem; mas adicionar `ioGeneric` fallback se ainda não existir — já existe do Plano 2).

Em `src/locales/en.json`, espelhar:

```json
"settings": {
  "title": "Settings",
  "tabs": {
    "sectionTitle": "Tabs",
    "addTab": "Add tab",
    "empty": "No tabs yet. Click \"Add tab\" to begin.",
    "selectPrompt": "Select a tab to edit, or click \"Add tab\"."
  },
  "editor": {
    "newTabTitle": "New tab",
    "name": "Name",
    "namePlaceholder": "Work",
    "icon": "Icon",
    "iconPlaceholder": "💼",
    "iconHint": "An emoji or short character. Name or icon is required.",
    "openMode": "Open mode",
    "openModeReuseOrNewWindow": "Reuse or new window",
    "openModeNewWindow": "New window",
    "openModeNewTab": "New tab",
    "urls": "URLs",
    "urlPlaceholder": "https://…",
    "addUrl": "Add URL",
    "removeUrl": "Remove URL",
    "save": "Save",
    "saving": "Saving…",
    "cancel": "Cancel",
    "delete": "Delete",
    "confirmDelete": "Delete tab \"{{label}}\"? This cannot be undone.",
    "validationNameOrIcon": "Provide a name or an icon.",
    "validationAtLeastOneUrl": "Add at least one URL.",
    "validationInvalidUrl": "Invalid URL: {{value}}"
  }
}
```

- [ ] **Step 6.3 — Typecheck**

```bash
npx tsc --noEmit
```

- [ ] **Step 6.4 — Commit**

```bash
git add src/core/ipc.ts src/locales/
git commit -m "feat(ipc): typed wrappers for settings commands and locale keys"
```

---

### Task 7: Hook `useConfig`

**Arquivos:**
- Criar: `src/settings/useConfig.ts`
- Criar: `src/settings/__tests__/useConfig.test.tsx`

Responsabilidade: única fonte de verdade do estado de `config` na janela Settings. Faz `getConfig()` no mount, escuta `config-changed` para reagir a mudanças vindas do próprio save (ou de um futuro fluxo externo), e expõe `saveTab`/`deleteTab` que atualizam otimisticamente + chamam IPC.

- [ ] **Step 7.1 — Escrever testes (FALHAM)**

```tsx
// src/settings/__tests__/useConfig.test.tsx
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useConfig } from "../useConfig";

type Listener = (e: { payload: unknown }) => void;

vi.mock("@tauri-apps/api/event", () => {
  const listeners = new Map<string, Set<Listener>>();
  return {
    listen: vi.fn(async (name: string, cb: Listener) => {
      const set = listeners.get(name) ?? new Set<Listener>();
      set.add(cb);
      listeners.set(name, set);
      return () => {
        set.delete(cb);
      };
    }),
    __emit: (name: string, payload: unknown) => {
      listeners.get(name)?.forEach((cb) => cb({ payload }));
    },
  };
});

vi.mock("../../core/ipc", () => ({
  ipc: {
    getConfig: vi.fn(),
    saveTab: vi.fn(),
    deleteTab: vi.fn(),
    openSettings: vi.fn(),
    closeSettings: vi.fn(),
    openTab: vi.fn(),
    hideDonut: vi.fn(),
  },
  CONFIG_CHANGED_EVENT: "config-changed",
}));

import { ipc } from "../../core/ipc";
import * as events from "@tauri-apps/api/event";

const makeConfig = (overrides: Partial<{ tabs: unknown[] }> = {}) => ({
  version: 1,
  shortcut: "CommandOrControl+Shift+Space",
  appearance: { theme: "dark", language: "auto" },
  interaction: { spawnPosition: "cursor", selectionMode: "clickOrRelease", hoverHoldMs: 800 },
  pagination: { itemsPerPage: 6, wheelDirection: "standard" },
  system: { autostart: false },
  tabs: [],
  ...overrides,
});

describe("useConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads config on mount", async () => {
    const cfg = makeConfig();
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(cfg);
    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.config).toEqual(cfg));
  });

  it("applies config-changed event updates", async () => {
    const initial = makeConfig();
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(initial);
    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.config).toEqual(initial));

    const updated = makeConfig({ tabs: [{ id: "x" } as unknown] });
    act(() => {
      (events as unknown as { __emit: (n: string, p: unknown) => void }).__emit(
        "config-changed",
        updated,
      );
    });
    await waitFor(() => expect(result.current.config).toEqual(updated));
  });

  it("saveTab delegates to ipc and returns the new config", async () => {
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(makeConfig());
    const updated = makeConfig({ tabs: [{ id: "n" } as unknown] });
    (ipc.saveTab as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.config).not.toBeNull());

    const tab = { id: "n", name: "N", icon: null, order: 0, openMode: "newTab", items: [] } as never;
    const returned = await act(() => result.current.saveTab(tab));
    expect(returned).toEqual(updated);
    expect(ipc.saveTab).toHaveBeenCalledWith(tab);
  });

  it("deleteTab delegates to ipc", async () => {
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(makeConfig());
    const updated = makeConfig();
    (ipc.deleteTab as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.config).not.toBeNull());

    await act(() => result.current.deleteTab("some-id"));
    expect(ipc.deleteTab).toHaveBeenCalledWith("some-id");
  });
});
```

- [ ] **Step 7.2 — Implementar `useConfig`**

```ts
// src/settings/useConfig.ts
import { useEffect, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { ipc, CONFIG_CHANGED_EVENT } from "../core/ipc";
import type { Config } from "../core/types/Config";
import type { Tab } from "../core/types/Tab";

export interface UseConfig {
  config: Config | null;
  loadError: unknown;
  saveTab: (tab: Tab) => Promise<Config>;
  deleteTab: (tabId: string) => Promise<Config>;
}

export function useConfig(): UseConfig {
  const [config, setConfig] = useState<Config | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  useEffect(() => {
    let disposed = false;
    ipc
      .getConfig()
      .then((c) => {
        if (!disposed) setConfig(c);
      })
      .catch((e) => {
        if (!disposed) setLoadError(e);
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<Config>(CONFIG_CHANGED_EVENT, (e) => {
      setConfig(e.payload);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  const saveTab = useCallback(async (tab: Tab) => {
    const next = await ipc.saveTab(tab);
    setConfig(next);
    return next;
  }, []);

  const deleteTab = useCallback(async (tabId: string) => {
    const next = await ipc.deleteTab(tabId);
    setConfig(next);
    return next;
  }, []);

  return { config, loadError, saveTab, deleteTab };
}
```

- [ ] **Step 7.3 — Rodar testes**

```bash
npm test -- --run src/settings/__tests__/useConfig.test.tsx
```

- [ ] **Step 7.4 — Commit**

```bash
git add src/settings/useConfig.ts src/settings/__tests__/useConfig.test.tsx
git commit -m "feat(settings): useConfig hook with config-changed subscription"
```

---

### Task 8: `<TabList>`

**Arquivos:**
- Criar: `src/settings/TabList.tsx`
- Criar: `src/settings/__tests__/TabList.test.tsx`

- [ ] **Step 8.1 — Escrever testes (FALHAM)**

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../core/i18n";
import { TabList } from "../TabList";
import type { Tab } from "../../core/types/Tab";

async function renderWithI18n(ui: React.ReactElement) {
  const i18n = await createI18n("pt-BR");
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

const tab = (id: string, name: string, order: number): Tab => ({
  id,
  name,
  icon: null,
  order,
  openMode: "reuseOrNewWindow",
  items: [],
});

describe("TabList", () => {
  it("renders empty state when there are no tabs", async () => {
    const onSelect = vi.fn();
    const onAdd = vi.fn();
    await renderWithI18n(<TabList tabs={[]} selectedId={null} onSelect={onSelect} onAdd={onAdd} />);
    expect(screen.getByText(/nenhuma aba cadastrada/i)).toBeTruthy();
  });

  it("renders tabs sorted by order and highlights the selected one", async () => {
    const t0 = tab("a", "A", 1);
    const t1 = tab("b", "B", 0);
    await renderWithI18n(
      <TabList tabs={[t0, t1]} selectedId="a" onSelect={() => {}} onAdd={() => {}} />,
    );
    const items = screen.getAllByRole("button").filter((b) => b.getAttribute("data-testid") === "tab-row");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("B");
    expect(items[1]).toHaveTextContent("A");
    expect(items[1]).toHaveAttribute("data-selected", "true");
  });

  it("calls onSelect with the tab id on click", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    await renderWithI18n(
      <TabList tabs={[tab("a", "A", 0)]} selectedId={null} onSelect={onSelect} onAdd={() => {}} />,
    );
    await user.click(screen.getByText("A"));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("calls onAdd when clicking the add button", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    await renderWithI18n(
      <TabList tabs={[]} selectedId={null} onSelect={() => {}} onAdd={onAdd} />,
    );
    await user.click(screen.getByRole("button", { name: /adicionar aba/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 8.2 — Implementar `TabList.tsx`**

```tsx
import React from "react";
import { useTranslation } from "react-i18next";
import type { Tab } from "../core/types/Tab";

export interface TabListProps {
  tabs: Tab[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
}

export const TabList: React.FC<TabListProps> = ({ tabs, selectedId, onSelect, onAdd }) => {
  const { t } = useTranslation();
  const ordered = [...tabs].sort((a, b) => a.order - b.order);

  return (
    <aside
      style={{
        width: 260,
        borderRight: "1px solid #23304d",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 12,
        background: "#0c1020",
      }}
    >
      <header style={{ fontSize: 13, color: "#8ea", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {t("settings.tabs.sectionTitle")}
      </header>
      <button
        type="button"
        onClick={onAdd}
        style={{
          background: "#1d2a4a",
          color: "#dde",
          border: "1px solid #334",
          borderRadius: 6,
          padding: "8px 10px",
          cursor: "pointer",
          font: "inherit",
          textAlign: "left",
        }}
      >
        + {t("settings.tabs.addTab")}
      </button>

      {ordered.length === 0 ? (
        <p style={{ color: "#889", fontSize: 13, lineHeight: 1.4 }}>
          {t("settings.tabs.empty")}
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {ordered.map((tab) => {
            const selected = tab.id === selectedId;
            const label = tab.name ?? tab.icon ?? tab.id.slice(0, 6);
            return (
              <li key={tab.id}>
                <button
                  type="button"
                  data-testid="tab-row"
                  data-selected={selected ? "true" : "false"}
                  onClick={() => onSelect(tab.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: selected ? "#253e6b" : "transparent",
                    color: "#dde",
                    border: "1px solid " + (selected ? "#3e63a8" : "transparent"),
                    borderRadius: 6,
                    padding: "8px 10px",
                    cursor: "pointer",
                    font: "inherit",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ width: 20, textAlign: "center" }}>{tab.icon ?? "•"}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
};
```

- [ ] **Step 8.3 — Instalar `@testing-library/user-event` se ainda não tiver**

```bash
npm install -D @testing-library/user-event
```

- [ ] **Step 8.4 — Rodar tests**

```bash
npm test -- --run src/settings/__tests__/TabList.test.tsx
```

- [ ] **Step 8.5 — Commit**

```bash
git add src/settings/TabList.tsx src/settings/__tests__/TabList.test.tsx package.json package-lock.json
git commit -m "feat(settings): TabList component"
```

---

### Task 9: `<UrlListEditor>` + `<TabEditor>`

**Arquivos:**
- Criar: `src/settings/UrlListEditor.tsx`
- Criar: `src/settings/TabEditor.tsx`
- Criar: `src/settings/__tests__/TabEditor.test.tsx`

- [ ] **Step 9.1 — Escrever testes (FALHAM)**

Cobrem: validações client-side, submit chamando `onSave`, cancel, delete com confirm, exibição dos modos.

```tsx
// src/settings/__tests__/TabEditor.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../core/i18n";
import { TabEditor } from "../TabEditor";
import type { Tab } from "../../core/types/Tab";

async function renderEditor(props: Partial<Parameters<typeof TabEditor>[0]> = {}) {
  const i18n = await createI18n("pt-BR");
  const merged = {
    mode: "new" as const,
    initial: null,
    onSave: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn(),
    onDelete: vi.fn().mockResolvedValue(undefined),
    ...props,
  };
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <TabEditor {...merged} />
    </I18nextProvider>,
  );
  return { ...utils, props: merged };
}

const existing: Tab = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Trabalho",
  icon: "💼",
  order: 0,
  openMode: "reuseOrNewWindow",
  items: [{ kind: "url", value: "https://example.com" }],
};

describe("TabEditor", () => {
  it("requires name or icon", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor();
    await user.type(screen.getByLabelText(/url/i), "https://ok.test");
    await user.click(screen.getByRole("button", { name: /salvar/i }));
    expect(screen.getByText(/preencha nome ou ícone/i)).toBeTruthy();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("requires at least one URL", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor();
    await user.type(screen.getByLabelText(/nome/i), "A");
    await user.click(screen.getByRole("button", { name: /remover url/i }));
    await user.click(screen.getByRole("button", { name: /salvar/i }));
    expect(screen.getByText(/adicione ao menos uma url/i)).toBeTruthy();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("rejects malformed URLs client-side", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor();
    await user.type(screen.getByLabelText(/nome/i), "A");
    await user.type(screen.getByLabelText(/url/i), "not a url");
    await user.click(screen.getByRole("button", { name: /salvar/i }));
    expect(screen.getByText(/url inválida/i)).toBeTruthy();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("saves a valid new tab with only-icon", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor();
    await user.type(screen.getByLabelText(/ícone/i), "📝");
    await user.type(screen.getByLabelText(/url/i), "https://a.test");
    await user.click(screen.getByRole("button", { name: /salvar/i }));
    expect(props.onSave).toHaveBeenCalledTimes(1);
    const payload = (props.onSave as ReturnType<typeof vi.fn>).mock.calls[0][0] as Tab;
    expect(payload.icon).toBe("📝");
    expect(payload.name).toBeNull();
    expect(payload.items).toHaveLength(1);
  });

  it("prefills fields when editing an existing tab", async () => {
    await renderEditor({ mode: "edit", initial: existing });
    expect((screen.getByLabelText(/nome/i) as HTMLInputElement).value).toBe("Trabalho");
    expect((screen.getByLabelText(/ícone/i) as HTMLInputElement).value).toBe("💼");
    const urlInputs = screen.getAllByLabelText(/url/i);
    expect((urlInputs[0] as HTMLInputElement).value).toBe("https://example.com");
  });

  it("delete is only shown in edit mode and calls onDelete after confirm", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      const { props } = await renderEditor({ mode: "edit", initial: existing });
      await user.click(screen.getByRole("button", { name: /excluir/i }));
      expect(confirmSpy).toHaveBeenCalled();
      expect(props.onDelete).toHaveBeenCalledWith(existing.id);
    } finally {
      confirmSpy.mockRestore();
    }
  });
});
```

- [ ] **Step 9.2 — Implementar `UrlListEditor.tsx`**

```tsx
import React from "react";
import { useTranslation } from "react-i18next";

export interface UrlListEditorProps {
  values: string[];
  onChange: (next: string[]) => void;
}

export const UrlListEditor: React.FC<UrlListEditorProps> = ({ values, onChange }) => {
  const { t } = useTranslation();

  const update = (i: number, v: string) => {
    const next = [...values];
    next[i] = v;
    onChange(next);
  };

  const remove = (i: number) => {
    const next = values.filter((_, idx) => idx !== i);
    onChange(next);
  };

  const add = () => onChange([...values, ""]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {values.map((v, i) => (
        <div key={i} style={{ display: "flex", gap: 6 }}>
          <input
            aria-label={`URL ${i + 1}`}
            value={v}
            onChange={(e) => update(i, e.target.value)}
            placeholder={t("settings.editor.urlPlaceholder")}
            style={{
              flex: 1,
              background: "#12192c",
              color: "#dde",
              border: "1px solid #2a3557",
              borderRadius: 4,
              padding: "6px 8px",
              font: "inherit",
            }}
          />
          <button
            type="button"
            aria-label={t("settings.editor.removeUrl")}
            onClick={() => remove(i)}
            style={{
              background: "transparent",
              color: "#a77",
              border: "1px solid #532",
              borderRadius: 4,
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        style={{
          alignSelf: "flex-start",
          background: "transparent",
          color: "#8ea",
          border: "1px dashed #355",
          borderRadius: 4,
          padding: "4px 10px",
          cursor: "pointer",
          fontSize: 12,
        }}
      >
        + {t("settings.editor.addUrl")}
      </button>
    </div>
  );
};
```

- [ ] **Step 9.3 — Implementar `TabEditor.tsx`**

```tsx
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { UrlListEditor } from "./UrlListEditor";
import { translateAppError } from "../core/errors";
import type { Tab } from "../core/types/Tab";
import type { OpenMode } from "../core/types/OpenMode";

type Mode = "new" | "edit";

export interface TabEditorProps {
  mode: Mode;
  initial: Tab | null;
  onSave: (tab: Tab) => Promise<void>;
  onCancel: () => void;
  onDelete: (tabId: string) => Promise<void>;
}

interface FormState {
  id: string;
  name: string;
  icon: string;
  openMode: OpenMode;
  urls: string[];
}

const OPEN_MODES: OpenMode[] = ["reuseOrNewWindow", "newWindow", "newTab"];

function randomUuid(): string {
  // crypto.randomUUID está disponível em WebView modernas (Chromium/Webkit).
  return crypto.randomUUID();
}

function fromTab(tab: Tab | null): FormState {
  if (!tab) {
    return { id: randomUuid(), name: "", icon: "", openMode: "reuseOrNewWindow", urls: [""] };
  }
  return {
    id: tab.id,
    name: tab.name ?? "",
    icon: tab.icon ?? "",
    openMode: tab.openMode,
    urls: tab.items.length
      ? tab.items.map((it) => (it.kind === "url" ? it.value : ""))
      : [""],
  };
}

export const TabEditor: React.FC<TabEditorProps> = ({ mode, initial, onSave, onCancel, onDelete }) => {
  const { t } = useTranslation();
  const [state, setState] = useState<FormState>(() => fromTab(initial));
  const [validation, setValidation] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setState(fromTab(initial));
    setValidation(null);
    setServerError(null);
  }, [initial, mode]);

  const openModeLabels = useMemo<Record<OpenMode, string>>(
    () => ({
      reuseOrNewWindow: t("settings.editor.openModeReuseOrNewWindow"),
      newWindow: t("settings.editor.openModeNewWindow"),
      newTab: t("settings.editor.openModeNewTab"),
    }),
    [t],
  );

  const submit = async () => {
    setServerError(null);

    const name = state.name.trim();
    const icon = state.icon.trim();
    if (!name && !icon) {
      setValidation(t("settings.editor.validationNameOrIcon"));
      return;
    }

    const urls = state.urls.map((u) => u.trim()).filter((u) => u.length > 0);
    if (urls.length === 0) {
      setValidation(t("settings.editor.validationAtLeastOneUrl"));
      return;
    }

    for (const u of urls) {
      try {
        new URL(u);
      } catch {
        setValidation(t("settings.editor.validationInvalidUrl", { value: u }));
        return;
      }
    }

    setValidation(null);

    const payload: Tab = {
      id: state.id,
      name: name.length > 0 ? name : null,
      icon: icon.length > 0 ? icon : null,
      order: initial?.order ?? 0, // o Rust normaliza
      openMode: state.openMode,
      items: urls.map((value) => ({ kind: "url", value })),
    };

    setSaving(true);
    try {
      await onSave(payload);
    } catch (err) {
      setServerError(translateAppError(err, t));
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = async () => {
    if (!initial) return;
    const label = initial.name ?? initial.icon ?? initial.id.slice(0, 6);
    const confirmed = window.confirm(t("settings.editor.confirmDelete", { label }));
    if (!confirmed) return;
    try {
      await onDelete(initial.id);
    } catch (err) {
      setServerError(translateAppError(err, t));
    }
  };

  const title = mode === "new" ? t("settings.editor.newTabTitle") : state.name || state.icon || "";

  const inputStyle: React.CSSProperties = {
    background: "#12192c",
    color: "#dde",
    border: "1px solid #2a3557",
    borderRadius: 4,
    padding: "6px 8px",
    font: "inherit",
  };

  return (
    <section
      style={{
        flex: 1,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        overflow: "auto",
      }}
    >
      <h2 style={{ margin: 0 }}>{title}</h2>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span>{t("settings.editor.name")}</span>
        <input
          value={state.name}
          onChange={(e) => setState({ ...state, name: e.target.value })}
          placeholder={t("settings.editor.namePlaceholder")}
          style={inputStyle}
        />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span>{t("settings.editor.icon")}</span>
        <input
          value={state.icon}
          onChange={(e) => setState({ ...state, icon: e.target.value })}
          placeholder={t("settings.editor.iconPlaceholder")}
          style={{ ...inputStyle, width: 120 }}
        />
        <small style={{ color: "#889" }}>{t("settings.editor.iconHint")}</small>
      </label>

      <fieldset style={{ border: "1px solid #2a3557", borderRadius: 4, padding: 12 }}>
        <legend style={{ padding: "0 6px" }}>{t("settings.editor.openMode")}</legend>
        {OPEN_MODES.map((m) => (
          <label key={m} style={{ display: "flex", gap: 6, alignItems: "center", padding: 4 }}>
            <input
              type="radio"
              name="openMode"
              checked={state.openMode === m}
              onChange={() => setState({ ...state, openMode: m })}
            />
            {openModeLabels[m]}
          </label>
        ))}
      </fieldset>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span>{t("settings.editor.urls")}</span>
        <UrlListEditor
          values={state.urls}
          onChange={(urls) => setState({ ...state, urls })}
        />
      </div>

      {validation && (
        <div role="alert" style={{ color: "#f99" }}>
          {validation}
        </div>
      )}
      {serverError && (
        <div role="alert" style={{ color: "#f99" }}>
          {serverError}
        </div>
      )}

      <footer style={{ display: "flex", gap: 8, marginTop: "auto" }}>
        <button
          type="button"
          disabled={saving}
          onClick={submit}
          style={{
            background: "#2a4a7d",
            color: "#fff",
            border: 0,
            borderRadius: 4,
            padding: "8px 16px",
            cursor: saving ? "wait" : "pointer",
          }}
        >
          {saving ? t("settings.editor.saving") : t("settings.editor.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: "transparent",
            color: "#dde",
            border: "1px solid #334",
            borderRadius: 4,
            padding: "8px 16px",
            cursor: "pointer",
          }}
        >
          {t("settings.editor.cancel")}
        </button>
        {mode === "edit" && initial && (
          <button
            type="button"
            onClick={requestDelete}
            style={{
              marginLeft: "auto",
              background: "transparent",
              color: "#f99",
              border: "1px solid #532",
              borderRadius: 4,
              padding: "8px 16px",
              cursor: "pointer",
            }}
          >
            {t("settings.editor.delete")}
          </button>
        )}
      </footer>
    </section>
  );
};
```

- [ ] **Step 9.4 — Rodar testes**

```bash
npm test -- --run src/settings/__tests__/TabEditor.test.tsx
```

- [ ] **Step 9.5 — Commit**

```bash
git add src/settings/TabEditor.tsx src/settings/UrlListEditor.tsx src/settings/__tests__/TabEditor.test.tsx
git commit -m "feat(settings): TabEditor with client-side validation and URL list"
```

---

### Task 10: `<SettingsApp>` e `src/entry/settings.tsx`

**Arquivos:**
- Criar: `src/settings/SettingsApp.tsx`
- Modificar: `src/entry/settings.tsx`

- [ ] **Step 10.1 — Criar `SettingsApp.tsx`**

```tsx
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { TabList } from "./TabList";
import { TabEditor } from "./TabEditor";
import { useConfig } from "./useConfig";
import type { Tab } from "../core/types/Tab";

type Selection =
  | { mode: "empty" }
  | { mode: "new" }
  | { mode: "edit"; tabId: string };

export const SettingsApp: React.FC = () => {
  const { t } = useTranslation();
  const { config, saveTab, deleteTab } = useConfig();
  const [selection, setSelection] = useState<Selection>({ mode: "empty" });

  if (!config) {
    return <div style={{ padding: 24 }}>…</div>;
  }

  const selectedTab: Tab | null =
    selection.mode === "edit"
      ? config.tabs.find((t) => t.id === selection.tabId) ?? null
      : null;

  const handleSave = async (tab: Tab) => {
    await saveTab(tab);
    setSelection({ mode: "edit", tabId: tab.id });
  };

  const handleDelete = async (tabId: string) => {
    await deleteTab(tabId);
    setSelection({ mode: "empty" });
  };

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <TabList
        tabs={config.tabs}
        selectedId={selection.mode === "edit" ? selection.tabId : null}
        onSelect={(id) => setSelection({ mode: "edit", tabId: id })}
        onAdd={() => setSelection({ mode: "new" })}
      />
      {selection.mode === "new" ? (
        <TabEditor
          mode="new"
          initial={null}
          onSave={handleSave}
          onCancel={() => setSelection({ mode: "empty" })}
          onDelete={handleDelete}
        />
      ) : selection.mode === "edit" && selectedTab ? (
        <TabEditor
          mode="edit"
          initial={selectedTab}
          onSave={handleSave}
          onCancel={() => setSelection({ mode: "empty" })}
          onDelete={handleDelete}
        />
      ) : (
        <section
          style={{
            flex: 1,
            display: "grid",
            placeItems: "center",
            color: "#889",
            padding: 24,
            textAlign: "center",
          }}
        >
          {t("settings.tabs.selectPrompt")}
        </section>
      )}
    </div>
  );
};
```

- [ ] **Step 10.2 — Substituir `src/entry/settings.tsx`**

```tsx
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import i18next from "i18next";
import { ipc } from "../core/ipc";
import { initI18n } from "../core/i18n";
import { SettingsApp } from "../settings/SettingsApp";
import type { Config } from "../core/types/Config";

async function bootstrap() {
  let language: Config["appearance"]["language"] = "auto";
  try {
    const cfg = await ipc.getConfig();
    language = cfg.appearance.language;
  } catch (e) {
    console.error("getConfig failed during settings bootstrap; using auto", e);
  }
  await initI18n(language);

  document.title = i18next.t("settings.title");

  createRoot(document.getElementById("root")!).render(
    <I18nextProvider i18n={i18next}>
      <SettingsApp />
    </I18nextProvider>,
  );
}

void bootstrap();
```

- [ ] **Step 10.3 — Typecheck + testes frontend**

```bash
npx tsc --noEmit
npm test -- --run
```

- [ ] **Step 10.4 — Smoke manual**

```bash
npm run tauri dev
```

Fluxo: tray → "Configurações" → janela aparece. Clicar em "Adicionar aba" → preencher nome e URL → "Salvar". A aba aparece na lista. Selecionar aba → "Excluir" → confirma → some. Editar URL mal formada → toast de erro client-side.

- [ ] **Step 10.5 — Commit**

```bash
git add src/settings/SettingsApp.tsx src/entry/settings.tsx
git commit -m "feat(settings): SettingsApp layout and bootstrap entrypoint"
```

---

### Task 11: Donut escuta `config-changed`; engrenagem abre Settings

**Arquivos:**
- Modificar: `src/entry/donut.tsx`
- Modificar: `src/donut/CenterCircle.tsx`
- Modificar: `src/donut/Donut.tsx` (pass-through de `onOpenSettings` para o centro)

- [ ] **Step 11.1 — `CenterCircle` fica clicável na metade da engrenagem**

Adicionar prop `onGearClick?: () => void`. Renderizar um `<rect>` invisível sobre a metade esquerda do círculo central para capturar cliques:

```tsx
import React from "react";

export interface CenterCircleProps {
  cx: number;
  cy: number;
  r: number;
  onGearClick?: () => void;
}

export const CenterCircle: React.FC<CenterCircleProps> = ({ cx, cy, r, onGearClick }) => (
  <g>
    <circle cx={cx} cy={cy} r={r} fill="#141a28" stroke="#3a4968" strokeWidth={1} />
    <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="#3a4968" strokeWidth={1} />
    <text
      x={cx - r / 2}
      y={cy}
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize={28}
      fill="#777"
      style={{ userSelect: "none", pointerEvents: "none" }}
    >
      ⚙
    </text>
    <g
      transform={`translate(${cx + r / 2}, ${cy - 3})`}
      stroke="#777"
      strokeWidth={1.8}
      fill="none"
      strokeLinecap="round"
      pointerEvents="none"
    >
      <circle cx={0} cy={-6} r={5} />
      <path d="M -9 12 A 10 10 0 0 1 9 12" />
    </g>
    {onGearClick && (
      <rect
        x={cx - r}
        y={cy - r}
        width={r}
        height={r * 2}
        fill="transparent"
        style={{ cursor: "pointer" }}
        onClick={(e) => {
          e.stopPropagation();
          onGearClick();
        }}
      />
    )}
  </g>
);
```

Ajustar `Donut.tsx` para aceitar e repassar `onOpenSettings`:

```tsx
export interface DonutProps {
  tabs: Tab[];
  size: number;
  onSelect: (tabId: string) => void;
  onOpenSettings?: () => void;
}

// ...

<CenterCircle cx={cx} cy={cy} r={innerR * 0.85} onGearClick={onOpenSettings} />
```

- [ ] **Step 11.2 — Atualizar o teste `Donut.test.tsx`**

Acrescentar um caso que clica no rect da engrenagem e verifica `onOpenSettings`:

```tsx
it("chamas onOpenSettings ao clicar na metade esquerda do centro", async () => {
  const onOpenSettings = vi.fn();
  const { container } = render(
    <Donut tabs={[]} size={300} onSelect={() => {}} onOpenSettings={onOpenSettings} />,
  );
  const gearHit = container.querySelector("rect[style*=\"cursor: pointer\"]") as SVGRectElement;
  expect(gearHit).toBeTruthy();
  fireEvent.click(gearHit);
  expect(onOpenSettings).toHaveBeenCalledTimes(1);
});
```

(Adaptar imports ao estilo existente do arquivo.)

- [ ] **Step 11.3 — Donut escuta `config-changed` e usa `onOpenSettings`**

Em `src/entry/donut.tsx`, dentro do `App`:

```tsx
import { listen } from "@tauri-apps/api/event";
import { CONFIG_CHANGED_EVENT } from "../core/ipc";

// ...

useEffect(() => {
  let unlisten: (() => void) | undefined;
  void listen<Config>(CONFIG_CHANGED_EVENT, (e) => {
    setConfig(e.payload);
  }).then((fn) => {
    unlisten = fn;
  });
  return () => { unlisten?.(); };
}, []);

const handleOpenSettings = async () => {
  try {
    await ipc.openSettings();
  } finally {
    void ipc.hideDonut();
  }
};

// e passar ao <Donut>:
<Donut
  tabs={config.tabs}
  size={WINDOW_SIZE}
  onSelect={handleSelect}
  onOpenSettings={handleOpenSettings}
/>
```

- [ ] **Step 11.4 — Rodar testes completos**

```bash
npm test -- --run
npx tsc --noEmit
```

- [ ] **Step 11.5 — Smoke**

Com `npm run tauri dev` rodando: atalho → donut aparece → clicar na engrenagem → donut some, Settings aparece. Com ambas as janelas abertas, criar uma aba na Settings → donut refresca (a nova aba aparece ao reabrir o donut).

- [ ] **Step 11.6 — Commit**

```bash
git add src/donut/CenterCircle.tsx src/donut/Donut.tsx src/donut/__tests__/Donut.test.tsx src/entry/donut.tsx
git commit -m "feat(donut): gear opens settings; donut listens to config-changed"
```

---

### Task 12: CI final + `CLAUDE.md` + PR

**Arquivos:**
- Modificar: `CLAUDE.md`

- [ ] **Step 12.1 — Pipeline local completo**

```bash
npm test -- --run
npx tsc --noEmit
cd src-tauri && cargo fmt --check && cargo clippy --lib && cargo test --lib && cd ..
```

- [ ] **Step 12.2 — Atualizar `CLAUDE.md`**

- Incluir `docs/plans/03-settings-crud.md` em "Start here".
- Na seção "Big-picture architecture", trocar "Settings webview (not yet implemented — Plano 3)" por "Settings webview (implemented in Plano 3) — decorated window with TabList + TabEditor. Listens to `config-changed` from Rust; donut mirrors the same event."
- Nas "Rust module responsibilities", descrever `settings_window/` e os novos comandos.
- Na seção "Conventions", notar: "Mutações de `Config` passam por `save_tab`/`delete_tab`. Nenhum comando escreve disco diretamente — todos chamam `config::io::save_atomic`. Um `save_atomic` com sucesso deve ser seguido por `app.emit(CONFIG_CHANGED_EVENT, &config)`."
- Em "Looking ahead", substituir o bloco por "Plano 4 (próximo)": ShortcutRecorder, AppearanceSection, `set_shortcut`, seletor de idioma consumindo `changeLanguage` (já pronto em `src/core/i18n.ts`). Mencionar que `AppState::config_path` agora é usado (remover bullet de `#[allow(dead_code)]`).

- [ ] **Step 12.3 — Commit final + PR**

```bash
git add CLAUDE.md docs/plans/03-settings-crud.md
git commit -m "docs(claude): mark Plano 3 (settings CRUD) complete"
git push -u origin HEAD
gh pr create --title "Plano 3 — Settings: CRUD de abas" --body "$(cat <<'EOF'
## Summary
- Nova janela Settings (decorada, multi-entry Vite) com TabList + TabEditor + UrlListEditor.
- Rust: comandos `save_tab`/`delete_tab`/`open_settings`/`close_settings`, write atômica via `save_atomic` (`config.json.tmp` → rename) e evento `config-changed` emitido a cada mutação.
- Tray ganha "Configurações"; engrenagem ⚙ do donut agora abre Settings.
- Donut escuta `config-changed` e atualiza abas em tempo real.

## Test plan
- [ ] `cargo test --lib` passa (inclui `save_atomic` + `apply_save`/`apply_delete`).
- [ ] `npm test` passa (TabList, TabEditor, UrlListEditor, useConfig, Donut).
- [ ] `npx tsc --noEmit` / `cargo fmt --check` / `cargo clippy --lib` limpos.
- [ ] Smoke: tray → Configurações → criar aba → salvar → aparece no donut sem reiniciar.
- [ ] Smoke: excluir aba com confirmação → some de ambas as janelas.
- [ ] Smoke: URL inválida client-side → mensagem em português/inglês conforme idioma.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Resumo dos commits previstos

1. `chore(settings): add settings.html entry and vite multi-input`
2. `feat(settings-window): module + capabilities for the settings webview`
3. `feat(config): save_atomic writes to .tmp then renames`
4. `feat(commands): save_tab/delete_tab with atomic write and config-changed event`
5. `feat(tray): add Configurações menu item`
6. `feat(ipc): typed wrappers for settings commands and locale keys`
7. `feat(settings): useConfig hook with config-changed subscription`
8. `feat(settings): TabList component`
9. `feat(settings): TabEditor with client-side validation and URL list`
10. `feat(settings): SettingsApp layout and bootstrap entrypoint`
11. `feat(donut): gear opens settings; donut listens to config-changed`
12. `docs(claude): mark Plano 3 (settings CRUD) complete`

---

## Critérios de aceitação

- [ ] Abrir pelo tray ou pelo donut (clicando na engrenagem) leva à janela Settings.
- [ ] Criar aba salva no `config.json` (verificar manualmente no `%APPDATA%` / `~/Library/...` / `~/.config/DonutTabs`). O arquivo nunca fica meio-escrito — ou salva completo, ou falha sem tocar no original.
- [ ] Editar aba persiste; abrir o donut mostra a versão nova sem precisar reiniciar.
- [ ] Excluir aba pede confirmação e só atua em caso de confirmação.
- [ ] `config-changed` só é emitido em operações bem-sucedidas (se validação ou IO falhar, memória e disco permanecem coerentes).
- [ ] Erros do Rust aparecem traduzidos na janela Settings via `translateAppError`.
- [ ] `AppState::config_path` deixa de ter `#[allow(dead_code)]`.
- [ ] CI verde em Linux/macOS/Windows.

---

## Notas para quem for implementar

- **Ordem importa para a atomicidade.** `save_atomic` precisa validar **antes** de abrir o `.tmp`; do contrário, um `.tmp` órfão fica no diretório. O teste `save_atomic_rejects_invalid_config` cobre.
- **Reordenar em delete, preservar em update.** Após `apply_delete`, renormalize `order` sequencialmente. Em `apply_save` existente, preserve o `order` antigo — o cliente não decide posição aqui (isso vem no Plano 7 com drag-and-drop).
- **Evento `config-changed` sempre recebe o `Config` inteiro.** Evita race conditions e mantém o frontend simples. Se o payload crescer muito no futuro, aí sim passar a mandar diff — não otimize antecipadamente.
- **`document.title` via i18n.** Setar no bootstrap depois de `initI18n()`, antes do primeiro render. Se em algum momento o Plano 4 trocar idioma em runtime, lembrar de reexecutar `document.title = i18next.t(...)` no callback de `changeLanguage`.
- **Nada de `navigator.language` no Settings bootstrap.** A resolução de idioma já acontece dentro de `initI18n` via `resolveLanguage`. O bootstrap do settings é cópia do donut.tsx exatamente por isso — não duplicar lógica.
- **Não adicionar `set_shortcut` ou preferências aqui.** Resistir ao impulso de "já que tô aqui, adiciono o seletor de tema" — isso é Plano 4 e tem validação de conflito de atalho própria.
