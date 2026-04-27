# DonutTabs — Plano 12: Import/Export de configuração

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: Use `superpowers:subagent-driven-development` (recomendada) ou `superpowers:executing-plans` para implementar este plano tarefa-a-tarefa.

**Meta:** Permitir que o usuário **exporte** o `config.json` atual para um arquivo `.json` em local arbitrário e **importe** um arquivo `.json` previamente exportado, substituindo a config atual. Caso de uso: backup antes de experimentar; sincronização manual entre máquinas (sem cloud); compartilhar perfis com colegas/setup multi-PC.

**Mecânica:** Tudo no Rust — frontend só dispara dialog e chama comando.
- **Export:** comando `export_config(target_path: String)` lê o `Config` em memória (`AppState`) e usa `save_atomic` num path arbitrário escolhido pelo usuário. Validação acontece naturalmente (save_atomic já valida).
- **Import:** comando `import_config(source_path: String)` reusa `load_from_path` (já trata v1→v2), substitui o estado em memória, chama `save_atomic` no `state.config_path` (não no source — o source é só leitura), reconcilia o atalho global do novo perfil ativo, e emite `CONFIG_CHANGED_EVENT` pra ambas as janelas refrescarem.

**Plugin-dialog já está instalado** (Plano 10). Adicionamos só `dialog:allow-save` na capability + helper `dialog.saveAs()` no `ipc.ts`.

**Fora desta slice:**
- Sincronização automática (cloud, GitHub Gist, etc.) — manual via filesystem é suficiente
- Diff/merge de configs — import substitui; merge fica pra futuro
- Versão do export (campo extra tipo `exportedAt`) — `config.json` já tem `version`; sem necessidade
- Export parcial (só um perfil) — fica pra futuro; primeiro corte é all-or-nothing
- Confirmação antes do overwrite no import (modal) — `window.confirm` simples no frontend é suficiente, evita complicar UX
- Encrypted export (com senha) — fora; arquivo é JSON plain

---

## Pré-requisitos (estado atual pós-merge do Plano 11)

- [src-tauri/src/config/io.rs:13](../../src-tauri/src/config/io.rs#L13): `load_from_path` lê + valida + migra v1→v2.
- [src-tauri/src/config/io.rs:32](../../src-tauri/src/config/io.rs#L32): `save_atomic` valida → escreve `.tmp` → rename. Cria `parent` dir se necessário.
- [src-tauri/src/commands.rs](../../src-tauri/src/commands.rs): pattern de comando padrão — pega `state`, muta, persiste, emite. `set_active_profile` é o exemplo mais relevante (faz reconciliação do atalho global cross-profile).
- [src-tauri/src/shortcut/mod.rs](../../src-tauri/src/shortcut/mod.rs): `set_from_config(handle, active_shortcut, &combo)` faz registro conflict-aware (registra novo antes de desregistrar o velho).
- [src/core/ipc.ts:53](../../src/core/ipc.ts#L53): `dialog.pickFile()` / `dialog.pickFolder()` já wrappam `@tauri-apps/plugin-dialog::open`. Falta `save`.
- [src/settings/AppearanceSection.tsx:90](../../src/settings/AppearanceSection.tsx#L90): fieldset "Sistema" hospeda toggle de autostart. Lugar natural pros botões de import/export.
- [src-tauri/capabilities/default.json](../../src-tauri/capabilities/default.json): tem `dialog:default` + `dialog:allow-open`. Falta `dialog:allow-save`.

---

## Estrutura de arquivos

### Novos arquivos

Nenhum. Tudo cabe em arquivos existentes.

### Modificados

| Arquivo | Mudança |
|---|---|
| `src-tauri/src/commands.rs` | Dois novos comandos `export_config(state, target_path)` e `import_config(app, state, source_path)`. Helpers `pub(crate)` `do_export(cfg, &Path)` e `do_import(source, dest_state) -> AppResult<Config>` para testar a lógica pura. |
| `src-tauri/src/lib.rs` | Registra os dois comandos no `invoke_handler`. Import flow chama `shortcut::set_from_config` pra reconciliar atalho do novo perfil ativo. |
| `src-tauri/capabilities/default.json` | Adiciona `dialog:allow-save`. |
| `src/core/ipc.ts` | Wrapper `dialog.saveAs(opts) -> Promise<string \| null>`; `ipc.exportConfig(path)` e `ipc.importConfig(path)`. |
| `src/settings/AppearanceSection.tsx` | Sub-fieldset (ou `<div>` no mesmo "Sistema") com dois botões: "Exportar configuração…" e "Importar configuração…". Confirmação `window.confirm` antes do import; toast/error inline em caso de falha. Props novas `onExport`/`onImport` (ou roda via `useConfig` direto). |
| `src/settings/SettingsApp.tsx` (ou `useConfig`) | Implementa `exportConfig()` (chama `dialog.saveAs` + `ipc.exportConfig`) e `importConfig()` (chama `dialog.pickFile` + `ipc.importConfig`). Resultado do import já chega via `config-changed` event — sem precisar de retorno explícito. |
| `src/locales/{pt-BR,en}.json` | `settings.system.exportButton` ("Exportar configuração…"), `settings.system.importButton` ("Importar configuração…"), `settings.system.exportSuccess` ("Configuração exportada para {{path}}."), `settings.system.importConfirm` ("Importar substitui toda a configuração atual. Continuar?"), `settings.system.exportHint` ("Backup do `config.json` para outro local."), `errors.config.importParseFailed`, `errors.config.exportFailed`. |
| `CLAUDE.md` | Documenta os novos comandos + o helper `dialog.saveAs`. Atualiza "Looking ahead" para Plano 13 (`kind: "app"` + `script` com `tauri-plugin-shell`). |

---

## Tarefas

### Task 1 — Comandos `export_config` + `import_config` (Rust, TDD)

**Arquivos:** `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`

- [ ] **1.1** — Helpers `pub(crate)` testáveis sem Tauri runtime:
  ```rust
  pub(crate) fn do_export(cfg: &Config, target: &Path) -> AppResult<()> {
      save_atomic(target, cfg)
  }

  pub(crate) fn do_import(source: &Path) -> AppResult<Config> {
      load_from_path(source)
  }
  ```
  `do_import` retorna o `Config` já validado/migrado (load_from_path faz tudo). Caller é quem decide o que fazer com ele (substituir state, emitir event).
- [ ] **1.2** — Comando `export_config`:
  ```rust
  #[tauri::command]
  pub fn export_config(
      state: tauri::State<'_, AppState>,
      target_path: String,
  ) -> Result<(), AppError> {
      let cfg = state.config.read().unwrap().clone();
      do_export(&cfg, Path::new(&target_path))
  }
  ```
  Erro fluido via `save_atomic` (validate + IO).
- [ ] **1.3** — Comando `import_config`:
  ```rust
  #[tauri::command]
  pub fn import_config<R: tauri::Runtime>(
      app: tauri::AppHandle<R>,
      state: tauri::State<'_, AppState>,
      source_path: String,
  ) -> Result<Config, AppError> {
      let new_cfg = do_import(Path::new(&source_path))?;
      // persist on app's canonical config_path (NOT the source path)
      save_atomic(&state.config_path, &new_cfg)?;
      // reconcile shortcut to the new active profile
      let new_shortcut = active_profile(&new_cfg)?.shortcut.clone();
      shortcut::set_from_config(&app, &state.active_shortcut, &new_shortcut)
          .map_err(|e| AppError::shortcut("shortcut_registration_failed",
              &[("reason", e.to_string())]))?;
      // swap in-memory state
      *state.config.write().unwrap() = new_cfg.clone();
      // broadcast
      let _ = app.emit(CONFIG_CHANGED_EVENT, &new_cfg);
      Ok(new_cfg)
  }
  ```
  Reusa o helper `active_profile` existente. Se `set_from_config` falhar (atalho conflita com outro app), o import **não** é revertido — config vai pra disco e estado em memória, mas o atalho global fica indisponível até reinício. Comportamento idêntico ao `set_active_profile` quando o atalho do novo perfil colide.

- [ ] **1.4** — Tests:
  - `do_export` escreve arquivo + ele bate com `serde_json::to_string_pretty(&cfg)`. Roundtrip via `load_from_path` resulta em config equivalente (`assert_eq!(loaded, original)`).
  - `do_import` rejeita JSON malformado (erro `json_parse`).
  - `do_import` rejeita config válida-em-JSON-mas-inválida-semanticamente (ex: `items_per_page = 99`) com erro `items_per_page_out_of_range`.
  - `do_import` aceita config v1 (snapshot legacy) e devolve um Config v2 já migrado.
  - **Não** testamos os comandos `#[tauri::command]` direto (precisariam de Tauri runtime — mantemos consistência com o padrão de comandos existentes).

- [ ] **1.5** — `lib.rs`: registra `commands::export_config` e `commands::import_config` no `invoke_handler`.

### Task 2 — Capability + ipc.dialog.saveAs + ipc.exportConfig/importConfig

**Arquivos:** `src-tauri/capabilities/default.json`, `src/core/ipc.ts`

- [ ] **2.1** — Adiciona `"dialog:allow-save"` no array de permissions.
- [ ] **2.2** — `src/core/ipc.ts`:
  ```ts
  import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";

  export const dialog = {
    pickFile: ...,
    pickFolder: ...,
    saveAs: async (opts: { defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => {
      const r = await saveDialog(opts);
      return typeof r === "string" ? r : null;
    },
  };

  export const ipc = {
    ...,
    exportConfig: (path: string) => invoke<void>("export_config", { targetPath: path }),
    importConfig: (path: string) => invoke<Config>("import_config", { sourcePath: path }),
  };
  ```
  Tauri converte snake_case ↔ camelCase nos args automaticamente — `targetPath` JS vira `target_path` Rust.

### Task 3 — UI no `<AppearanceSection>` Sistema fieldset (frontend, com testes)

**Arquivos:** `src/settings/AppearanceSection.tsx`, `src/settings/SettingsApp.tsx` (ou `useConfig`), testes

- [ ] **3.1** — `useConfig` (ou `SettingsApp`) ganha:
  ```ts
  const handleExport = async () => {
    const path = await dialog.saveAs({
      defaultPath: "donuttabs-config.json",
      filters: [{ name: "DonutTabs config", extensions: ["json"] }],
    });
    if (!path) return;
    try {
      await ipc.exportConfig(path);
      // toast/inline success — pode reusar o pattern do donut toast ou inline
    } catch (err) {
      setServerError(translateAppError(err, t));
    }
  };

  const handleImport = async () => {
    const path = await dialog.pickFile();
    if (!path) return;
    if (!window.confirm(t("settings.system.importConfirm"))) return;
    try {
      await ipc.importConfig(path);
      // success: config-changed já vai disparar refresh
    } catch (err) {
      setServerError(translateAppError(err, t));
    }
  };
  ```
- [ ] **3.2** — `<AppearanceSection>` ganha dois props `onExport: () => void` e `onImport: () => void`. Renderiza, dentro do fieldset Sistema (ou em fieldset adjacente), uma row com os dois botões + small de hint.
- [ ] **3.3** — Tests:
  - `<AppearanceSection>`: clicar "Exportar configuração…" chama `onExport`. Mesmo pra import.
  - `useConfig` (ou wherever os handlers vivem): mock `dialog.saveAs` retornando path → chama `ipc.exportConfig`. Cancelar (return null) → não chama. Mock `dialog.pickFile` + `window.confirm` retornando false → não chama `ipc.importConfig`. Confirm true → chama.

### Task 4 — Locales + CLAUDE.md + pipeline + commits

- [ ] **4.1** — Locale keys novas (PT-BR + EN). Mensagens user-facing curtas.
- [ ] **4.2** — `cargo fmt --check`, `cargo clippy --lib -- -D warnings`, `cargo test --lib`, `npx tsc --noEmit`, `npx vitest run` — todos verdes.
- [ ] **4.3** — `CLAUDE.md`:
  - `commands.rs`: lista `export_config` / `import_config`.
  - "Looking ahead" → Plano 13 (`kind: "app"` + `kind: "script"` com `tauri-plugin-shell` e modal de confirmação de segurança).
- [ ] **4.4** — Commits granulares (1 por tarefa lógica). Push + PR.

---

## Resumo dos commits previstos

1. `feat(commands): export_config + import_config commands with helpers`
2. `feat(deps): dialog:allow-save capability + ipc.dialog.saveAs + import/export wrappers`
3. `feat(settings): export/import buttons in Sistema fieldset`
4. `docs(claude): mark Plano 12 (import/export config) complete`

(4 commits — locale keys piggy-back no commit 3 já que são consumidas pelos botões.)

---

## Critérios de aceitação

- [ ] Botão "Exportar configuração…" abre dialog de save, default `donuttabs-config.json`. Cancelar não faz nada. Salvar grava o `config.json` válido (mesmo formato do disco do app).
- [ ] Botão "Importar configuração…" abre dialog de open, filtra `.json`. Após selecionar, `window.confirm` pede confirmação. Confirmando, a config atual é substituída.
- [ ] Import de config v1 (legacy) é migrado pra v2 transparentemente.
- [ ] Import de JSON malformado mostra erro `errors.config.jsonParse` localizado.
- [ ] Import de config válida-mas-semantica-quebrada (ex: `itemsPerPage: 99`) mostra erro localizado correspondente.
- [ ] Após import bem-sucedido, donut e Settings refrescam via `config-changed` (perfil ativo, atalho, abas atualizados sem reload manual).
- [ ] Atalho global é re-registrado pro perfil ativo do novo config; se conflita, log + segue (mesmo fallback do `set_active_profile`).
- [ ] CI verde (5 jobs).

---

## Notas

- **Por que `save_atomic` no path arbitrário do export**: já valida + escreve atômico. O usuário escolheu o destino — nosso job é entregar um JSON íntegro lá. `save_atomic` não distingue "destino canônico" de "destino arbitrário".
- **Por que persistir no `state.config_path` (e não no source) no import**: o source pode estar num USB/network share; depois que o usuário ejeta o drive, perderíamos a config. Persistir na pasta canônica do app é o contrato (`%APPDATA%/DonutTabs/config.json` etc.).
- **Por que rollback parcial em falha de shortcut no import**: aceitamos divergência transitória (config nova em memória/disco, shortcut antigo ainda registrado se o novo falhou). Reverter exigiria re-registrar o atalho antigo, recarregar a config antiga — frágil. Mesmo trade-off do `set_active_profile`.
- **Por que `window.confirm` em vez de modal customizado**: simples, nativo, suficiente. Modal customizado seria escopo de UX extra sem ganho proporcional. Pode evoluir depois.
- **Por que all-or-nothing (sem export por-perfil)**: schema é `Config` inteiro (versão + perfis + globais). Splittar perfil isolado significaria gerar JSON parcial, definir formato de import "merge profile" — escopo grande. Primeiro corte: simples, all-or-nothing.
- **Filename default `donuttabs-config.json`** (sem timestamp): user pode renomear no save dialog. Adicionar `YYYY-MM-DD` no default seria nice-to-have mas requer date formatting cross-locale; mantém simples.
- **Sem comando para "exportar para clipboard"**: sai do escopo de filesystem. Pode ser útil pra colar em chat/email; futuro.
