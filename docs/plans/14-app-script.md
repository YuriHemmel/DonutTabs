# DonutTabs — Plano 14: Items `kind: "app"` + `kind: "script"`

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: Use `superpowers:subagent-driven-development` (recomendada) ou `superpowers:executing-plans` para implementar este plano tarefa-a-tarefa.

**Meta:** Fechar a Fase 3 do roadmap ([docs/Plano.md](../Plano.md) §8.3) suportando os dois últimos `kind` de item:

1. **`kind: "app"`** — lança um aplicativo pelo nome amigável (`"firefox"`, `"Visual Studio Code"`). Sem URL/file/folder associado — só dispara o app. Resolução cross-OS via `tauri-plugin-shell::Command::new(name).spawn()` (PATH no Windows/Linux; macOS ganha helper `open -a` quando o nome parece um `.app` bundle).
2. **`kind: "script"`** — comando shell arbitrário (`git pull && cargo test`, `python deploy.py`, etc.). **Alto risco** — tem todos os privilégios do user. Protegido por modal de confirmação na primeira execução + flag `trusted` per-item + kill-switch `allowScripts: bool` per-profile.

Ambos compartilham `tauri-plugin-shell` (spawn) e padrão de UX de segurança onde aplicável. Bundle por economia de mecânica compartilhada — comprometido com slice única em troca de PR maior.

**Stack adicional:**
- `tauri-plugin-shell` (Rust + frontend `@tauri-apps/plugin-shell`) — process spawn cross-OS

**Fora desta slice:**
- Picker visual de aplicativos instalados (enumerar `%PROGRAMFILES%`, registry App Paths, `/Applications`) — futuro
- `cwd` configurável pra scripts (default = home do user) — fora; user usa `cd ~ && cmd` se precisar
- Output capture / streaming (mostrar stdout/stderr no donut) — fora
- Argumentos separados pra `kind: "app"` (`--profile`, etc.) — fora; primeiro corte só nome do app
- Per-script env vars — fora
- Sandboxing além do que o SO já oferece — fora; trust model é do user
- Multi-line script editor com syntax highlighting — fora; textarea simples

---

## Pré-requisitos (estado atual pós-merge do Plano 13)

- [src-tauri/src/config/schema.rs:139](../../src-tauri/src/config/schema.rs#L139): `Item` é `#[serde(tag = "kind")]` com 3 variantes (`Url`, `File`, `Folder`). Cada uma tem `open_with: Option<String>`.
- [src-tauri/src/config/schema.rs:21](../../src-tauri/src/config/schema.rs#L21): `Profile { id, name, icon, shortcut, theme, tabs }`. Vai ganhar `allow_scripts: bool` (com `#[serde(default)]` para configs antigas).
- [src-tauri/src/launcher/mod.rs:12](../../src-tauri/src/launcher/mod.rs#L12): trait `Opener { open_url, open_path }`. Vai ganhar `spawn_app(name)` e `spawn_script(command)`. Todos cobertos por `MockOpener` em testes.
- [src-tauri/src/config/validate.rs](../../src-tauri/src/config/validate.rs): match exaustivo de `Item`. Vai cobrir os 2 novos variants.
- [src/settings/ItemListEditor.tsx:19](../../src/settings/ItemListEditor.tsx#L19): `ItemDraft { kind, value, openWith }`. `kind` será extendido pra "app" e "script".
- [src/settings/IconPicker.tsx](../../src/settings/IconPicker.tsx): exemplo de modal com overlay + dialog + capture-Esc handler. Padrão a reusar pra security modal.
- [src-tauri/capabilities/default.json](../../src-tauri/capabilities/default.json): vai ganhar `shell:default` + `shell:allow-execute` (ou `shell:allow-spawn` — depende da versão do plugin).

---

## Estrutura de arquivos

### Novos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/donut/ScriptConfirmModal.tsx` | Modal de confirmação para `kind: "script"`. Mostra comando completo + cwd (se relevante) + checkbox "Confiar nesta aba" + botões "Executar" / "Cancelar". Posicionado por cima do donut SVG (HTML, não SVG). Padrão de overlay/Esc capture similar ao `<TabSearchOverlay>`. |
| `src/donut/__tests__/ScriptConfirmModal.test.tsx` | Render mostra command; click "Executar" sem trust dispara onConfirm(false); com checkbox + click → onConfirm(true); Cancel → onCancel; ESC → onCancel. |
| `src/settings/ScriptHelpBanner.tsx` | Banner inline no `<TabEditor>` quando o usuário está editando uma aba que tem item `kind: "script"` mas o perfil ativo tem `allowScripts: false`. Texto: "Scripts estão desabilitados neste perfil. Habilite em Aparência > Sistema." |
| `src/settings/__tests__/ScriptHelpBanner.test.tsx` | Render quando `disabled`; oculto quando `allowScripts: true`. |

### Modificados

| Arquivo | Mudança |
|---|---|
| `src-tauri/Cargo.toml` | `tauri-plugin-shell = "2"` |
| `src-tauri/src/lib.rs` | Registra `tauri_plugin_shell::init()`. |
| `src-tauri/capabilities/default.json` | Adiciona `shell:default` + `shell:allow-execute` (ou whichever the plugin docs require for `Command::new`). |
| `src-tauri/src/config/schema.rs` | `Item` ganha duas variantes: `App { name: String }` e `Script { command: String, trusted: bool }` (sem `open_with` — não faz sentido). `Profile` ganha `#[serde(default)] allow_scripts: bool`. Default = `false`. Helper `default_allow_scripts()`. |
| `src-tauri/src/config/validate.rs` | Match completo: app exige `name` não-vazio (`app_name_empty`); script exige `command` não-vazio (`script_command_empty`); script só passa quando o profile.allow_scripts for true OU o item já estiver flagged trusted=false (validate é estrutural, não runtime). |
| `src-tauri/src/launcher/mod.rs` | Trait `Opener` ganha `fn spawn_app(name) -> Result<(), String>` e `fn spawn_script(command) -> Result<(), String>`. `launch_tab` dispatcha por variant. `TauriOpener` usa `tauri_plugin_shell::Command::new(name).spawn()` para app (com fallback `open -a` no macOS quando o nome bate `.app`); usa `Command::new("sh").args(["-c", command])` (Unix) ou `Command::new("cmd").args(["/C", command])` (Win) pra script. **Importante:** `spawn_script` recebe parâmetros via `dyn Opener` — a checagem de `trusted` + `allow_scripts` acontece **antes** de chamar `launch_tab`, no `commands::open_tab`. Launcher só executa. |
| `src-tauri/src/commands.rs` | `open_tab` agora pré-filtra items: se `Item::Script` com `!item.trusted` ou `!profile.allow_scripts`, **não** dispara o spawn — em vez disso retorna `AppError::launcher("script_blocked", &[...])` com `tabId`/`itemIndex` no contexto pra o frontend abrir o modal de confirmação. Novo comando `set_script_trusted(profile_id, tab_id, item_index, trusted)` que atualiza `trusted` em-place + persiste + emite. Novo comando `set_profile_allow_scripts(profile_id, allow)` pra toggle de profile gating. |
| `src-tauri/src/lib.rs` | Registra os novos comandos. |
| `src/core/ipc.ts` | `setScriptTrusted(profileId, tabId, itemIndex, trusted)`, `setProfileAllowScripts(profileId, allow)`. |
| `src/settings/ItemListEditor.tsx` | `KIND_OPTIONS` ganha "app" e "script". Campos por kind: app só tem `name` (input texto); script tem `command` (textarea multiline) + checkbox de trust visível só em modo edit. Browse não se aplica nem a app nem a script — esconde pra esses kinds. `ItemDraft.openWith` continua presente mas sempre vazio pra app/script. |
| `src/settings/TabEditor.tsx` | `itemToDraft`/`draftToItem` mapeiam os 2 novos variants. Submit envia `trusted: false` por padrão pra novos scripts (modal cuida de elevar). |
| `src/settings/AppearanceSection.tsx` | Sub-fieldset "Sistema" ganha toggle "Permitir scripts neste perfil" wired ao `setProfileAllowScripts`. Hint: "Scripts shell precisam confirmação na primeira execução. Desabilite pra bloquear todos os scripts deste perfil." |
| `src/entry/donut.tsx` | Captura `script_blocked` retornado por `openTab`, abre `<ScriptConfirmModal>` com o comando do item, e ao confirmar chama: (a) `setScriptTrusted` se checkbox estava marcada; (b) re-tentando `openTab` (que agora vai passar — trusted=true ou one-shot bypass via novo arg `force_run: bool`?). |
| `src/locales/{pt-BR,en}.json` | Várias keys novas — ver "Locales" abaixo. |
| `CLAUDE.md` | Documentar plugin-shell, novos kinds, modal de segurança, profile gating. |

---

## Locales (PT-BR + EN)

```
settings.editor.itemKindApp           "App"
settings.editor.itemKindScript        "Script"
settings.editor.itemPlaceholderApp    "ex.: firefox, code"
settings.editor.itemPlaceholderScript "ex.: git pull && cargo test"
settings.editor.addItemApp            "Adicionar app"
settings.editor.addItemScript         "Adicionar script"
settings.editor.scriptTrustedLabel    "Confiar (executa sem confirmação)"
settings.editor.scriptDisabledBanner  "Scripts estão desabilitados neste perfil. Habilite em Aparência > Sistema."
settings.system.allowScriptsLabel     "Permitir scripts neste perfil"
settings.system.allowScriptsHint      "Scripts shell sempre pedem confirmação na primeira execução. Desabilite pra bloquear todos os scripts deste perfil."

donut.scriptModal.title               "Executar script?"
donut.scriptModal.commandLabel        "Comando:"
donut.scriptModal.warning             "Scripts têm acesso completo aos seus arquivos e configurações. Execute apenas comandos que você reconhece."
donut.scriptModal.trustLabel          "Confiar nesta aba (não perguntar de novo)"
donut.scriptModal.run                 "Executar"
donut.scriptModal.cancel              "Cancelar"

errors.config.appNameEmpty            "Nome do app não pode ser vazio na aba {{tabId}}."
errors.config.scriptCommandEmpty      "Comando do script não pode ser vazio na aba {{tabId}}."
errors.launcher.scriptBlocked         "Script não autorizado — confirme antes de executar."
errors.launcher.scriptsDisabled       "Scripts estão desabilitados neste perfil."
errors.launcher.spawnFailed           "Falha ao executar: {{reason}}"
```

---

## Tarefas

### Task 0 — Schema: `App`, `Script`, `Profile.allow_scripts` (Rust, TDD)

**Arquivos:** `src-tauri/src/config/schema.rs`, `src-tauri/src/config/migrate.rs` (compile fix)

- [ ] **0.1** — `Item` ganha:
  ```rust
  #[serde(rename_all = "camelCase")]
  App {
      name: String,
      // open_with intencionalmente ausente — apps são spawned por nome,
      // não roteados via OS handler.
  },
  #[serde(rename_all = "camelCase")]
  Script {
      command: String,
      #[serde(default)]
      trusted: bool,
  },
  ```
- [ ] **0.2** — `Profile` ganha `#[serde(default)] allow_scripts: bool`.
- [ ] **0.3** — `Config::default()` profile: `allow_scripts: false`.
- [ ] **0.4** — `migrate.rs` test fixture ConfigV1 não muda (V1 não tem app/script/allow_scripts). Migração v1→v2 setta `allow_scripts: false`.
- [ ] **0.5** — Tests:
  - `Item::App { name: "firefox" }` round-trips com `{kind:"app",name:"firefox"}`.
  - `Item::Script { command: "ls", trusted: true }` round-trips.
  - `Item::Script { command: "ls" }` (sem trusted) deserializa com `trusted: false` (default).
  - Profile sem `allowScripts` no JSON deserializa com `false`.
  - Configs Plano 13 (sem o campo) carregam sem erro.

### Task 1 — Validation (Rust, TDD)

**Arquivos:** `src-tauri/src/config/validate.rs`

- [ ] **1.1** — Match ganha braços para `App` (rejeita `name.trim().is_empty()` com `app_name_empty`) e `Script` (rejeita `command.trim().is_empty()` com `script_command_empty`).
- [ ] **1.2** — `item_kind_label` cobre `App` → `"app"`, `Script` → `"script"`.
- [ ] **1.3** — `item_open_with` retorna `None` pra App/Script (não têm o campo).
- [ ] **1.4** — Tests:
  - App com name vazio rejeita.
  - Script com command vazio rejeita.
  - Validação **não** verifica `trusted` ou `allow_scripts` (são checks de runtime no launcher).
  - Mistura URL+File+App+Script no mesmo tab valida.

### Task 2 — `tauri-plugin-shell` + capability

**Arquivos:** `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`

- [ ] **2.1** — `Cargo.toml`: `tauri-plugin-shell = "2"`.
- [ ] **2.2** — `lib.rs`: `.plugin(tauri_plugin_shell::init())`.
- [ ] **2.3** — `capabilities/default.json`: adiciona `shell:default` + `shell:allow-execute` + scope que permita `Command::new` com qualquer programa (precisamos `args.allow: true` ou `validate: true` no scope — confirmar via docs do plugin).
- [ ] **2.4** — `cargo build` + smoke manual no `tauri dev`. Sem teste direto.

### Task 3 — Launcher: spawn methods (Rust, TDD)

**Arquivos:** `src-tauri/src/launcher/mod.rs`

- [ ] **3.1** — Trait extension:
  ```rust
  pub trait Opener: Send + Sync {
      fn open_url(&self, url: &str, with: Option<&str>) -> Result<(), String>;
      fn open_path(&self, path: &str, with: Option<&str>) -> Result<(), String>;
      fn spawn_app(&self, name: &str) -> Result<(), String>;
      fn spawn_script(&self, command: &str) -> Result<(), String>;
  }
  ```
- [ ] **3.2** — `launch_tab` match completo:
  ```rust
  Item::App { name } => opener.spawn_app(name),
  Item::Script { command, trusted: _ } => opener.spawn_script(command),
  ```
  **Trust gating não acontece aqui** — `commands::open_tab` filtra antes de chamar `launch_tab`.
- [ ] **3.3** — `TauriOpener::spawn_app(name)`:
  ```rust
  use tauri_plugin_shell::ShellExt;
  // macOS: se name tem extensão .app OU não é PATH-resolvable, tenta `open -a name`.
  // Win/Linux: spawna direto.
  #[cfg(target_os = "macos")]
  let result = self.app.shell().command("open").args(["-a", name]).spawn();
  #[cfg(not(target_os = "macos"))]
  let result = self.app.shell().command(name).spawn();
  result.map(|_| ()).map_err(|e| e.to_string())
  ```
- [ ] **3.4** — `TauriOpener::spawn_script(command)`:
  ```rust
  #[cfg(target_os = "windows")]
  let (shell, flag) = ("cmd", "/C");
  #[cfg(not(target_os = "windows"))]
  let (shell, flag) = ("sh", "-c");
  self.app.shell().command(shell).args([flag, command]).spawn()
      .map(|_| ()).map_err(|e| e.to_string())
  ```
- [ ] **3.5** — `MockOpener` ganha `app_calls` + `script_calls` + `fail_apps` + `fail_scripts`.
- [ ] **3.6** — Tests:
  - Tab com `Item::App { name: "firefox" }` chama `spawn_app("firefox")`, sem chamar URL/path methods.
  - Tab com `Item::Script { command: "ls" }` chama `spawn_script("ls")`.
  - Failures de app/script entram em `outcome.failures`.
  - All-fail dispara `all_items_failed`.
  - Mix de todos os 5 kinds (URL/File/Folder/App/Script) sucede.

### Task 4 — Backend: trust gating + comandos

**Arquivos:** `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/errors.rs` (talvez novo error code)

- [ ] **4.1** — `open_tab` filtra antes do `launch_tab`:
  ```rust
  // Identifica primeiro item Script untrusted ou bloqueado por profile.allow_scripts.
  // Se houver, NÃO chama launch_tab; retorna AppError::launcher("script_blocked", &[
  //     ("tabId", tab.id.to_string()),
  //     ("itemIndex", idx.to_string()),
  //     ("command", command.clone()),
  // ]).
  // Frontend abre modal com base no contexto.
  ```
  Decisão: gating é **all-or-nothing por item**. Tab com 1 URL + 1 script untrusted: bloqueia o tab inteiro até o user confirmar (modal pode trustar ou one-shot run). Alternativa (executar URL e bloquear script) seria mais permissiva mas confunde UX — o user não sabe que um item foi pulado.
- [ ] **4.2** — Novo comando `set_script_trusted`:
  ```rust
  #[tauri::command]
  pub fn set_script_trusted(
      app: AppHandle, state: State<'_, AppState>,
      profile_id: Uuid, tab_id: Uuid, item_index: usize, trusted: bool,
  ) -> Result<Config, AppError> {
      // walk profile → tab → items[item_index], confirma que é Item::Script,
      // setta trusted, save_atomic, emit.
  }
  ```
  Helper `apply_set_script_trusted(profile, tab_id, item_index, trusted)` testável.
- [ ] **4.3** — Novo comando `set_profile_allow_scripts(profile_id, allow)`. Helper `apply_set_profile_allow_scripts`.
- [ ] **4.4** — Novo comando `run_tab_force(tab_id, profile_id?)` — variante de `open_tab` que **bypassa** o trust gating (para o caso "Executar uma vez" do modal sem persistir trust). Internamente chama `launch_tab` direto.
  Alternativa: passar arg `force: bool` em `open_tab`. Discreto, evita comando novo. Uso desse approach.
- [ ] **4.5** — Tests dos helpers (sem Tauri runtime).
- [ ] **4.6** — `lib.rs` registra novos comandos.

### Task 5 — Security modal `<ScriptConfirmModal>`

**Arquivos:** `src/donut/ScriptConfirmModal.tsx`, testes

- [ ] **5.1** — Component:
  ```tsx
  interface Props {
    command: string;
    onConfirm: (trustForever: boolean) => void;
    onCancel: () => void;
  }
  ```
  Render: overlay + dialog centralizado. Title, comando em `<pre>`, warning em vermelho/laranja, checkbox "Confiar nesta aba (não perguntar de novo)", botões "Executar" (primário) e "Cancelar". ESC → onCancel. Auto-focus no botão Cancelar (defesa contra Enter-spam acidental).
- [ ] **5.2** — Tests: render mostra command; trust=false default; click "Executar" sem checkbox → `onConfirm(false)`; com checkbox → `onConfirm(true)`; "Cancelar" → onCancel; ESC → onCancel.

### Task 6 — `<ItemListEditor>`: 2 kinds novos

**Arquivos:** `src/settings/ItemListEditor.tsx`, `src/settings/TabEditor.tsx`, testes

- [ ] **6.1** — `KIND_OPTIONS` = `["url", "file", "folder", "app", "script"]`.
- [ ] **6.2** — Render por kind:
  - `app`: input single-line, placeholder `"firefox"`. **Sem** browse, **sem** openWith input (escondidos pra esses kinds).
  - `script`: textarea multiline (3-4 rows), placeholder `"git pull && cargo test"`. **Sem** browse, **sem** openWith. Em modo edit, mostrar checkbox "Confiar (executa sem confirmação)" wired pra `setScriptTrusted` (call IPC inline ao toggle, **não** espera Save). Em modo new: checkbox escondida — script novo sempre nasce `trusted: false`.
- [ ] **6.3** — Footer ganha botões "+ Adicionar app" e "+ Adicionar script".
- [ ] **6.4** — `ItemDraft` ganha campos opcionais por kind:
  ```ts
  interface ItemDraft {
    kind: ItemKind;
    value: string;       // url value, file/folder path, app name, ou script command
    openWith: string;    // empty pra app/script
    trusted?: boolean;   // só pra script
  }
  ```
- [ ] **6.5** — `TabEditor` mapping:
  - `itemToDraft`: app → `{kind:"app", value: name, openWith: "", trusted: undefined}`. Script → `{kind:"script", value: command, openWith: "", trusted}`.
  - `draftToItem`: app → `{kind:"app", name: value}`. Script → `{kind:"script", command: value, trusted: trusted ?? false}`.
- [ ] **6.6** — Tests do `<ItemListEditor>`: render dos 5 kinds, troca pra app/script esconde browse/openWith, footer mostra 5 botões de add, textarea pra script (não input).
- [ ] **6.7** — Tests do `<TabEditor>`: save tab com app + script + URL produz `Item[]` correto; trust toggle no script dispara IPC inline.

### Task 7 — `<AppearanceSection>` toggle de allowScripts

**Arquivos:** `src/settings/AppearanceSection.tsx`, `src/settings/SettingsApp.tsx`, `src/settings/useConfig.ts`, testes

- [ ] **7.1** — `useConfig` ganha `setProfileAllowScripts(profileId, allow)`.
- [ ] **7.2** — `AppearanceSection` aceita `allowScripts: boolean` + `onAllowScriptsChange: (b) => void`. Renderiza checkbox + hint dentro do fieldset Sistema.
- [ ] **7.3** — `SettingsApp` plumba `selectedProfile.allowScripts` + handler.
- [ ] **7.4** — Tests: toggle dispara o callback.

### Task 8 — `entry/donut.tsx`: integração com modal + force-run

**Arquivos:** `src/entry/donut.tsx`

- [ ] **8.1** — `handleSelect`: try `ipc.openTab(tabId)`. Se erro `script_blocked`, extrai `command` do contexto, abre `<ScriptConfirmModal>`. `onConfirm(trust)`:
  - se `trust`: chama `ipc.setScriptTrusted(profileId, tabId, itemIndex, true)`, depois `ipc.openTab(tabId)`.
  - se `!trust`: chama `ipc.openTab(tabId, { force: true })` (one-shot).
  - depois fecha modal + `hideDonut()`.
- [ ] **8.2** — `script_blocked` quando `!profile.allow_scripts` (kill-switch ativo) mostra erro localizado `errors.launcher.scriptsDisabled` em vez do modal — não tem como "confiar" um item se o kill-switch tá fechado.
- [ ] **8.3** — Tests: difícil testar o modal flow direto (depende de IPC). Smoke manual no test plan.

### Task 9 — Locales + CLAUDE.md + pipeline + commits

- [ ] **9.1** — Adiciona todas as keys novas (PT-BR + EN).
- [ ] **9.2** — `cargo fmt --check`, `cargo clippy --lib -- -D warnings`, `cargo test --lib`, `npx tsc --noEmit`, `npx vitest run` — todos verdes.
- [ ] **9.3** — `CLAUDE.md`:
  - `config/schema.rs`: documenta 2 novos variants + `Profile.allow_scripts`.
  - `config/validate.rs`: documenta novos error codes.
  - `launcher/`: documenta `spawn_app`/`spawn_script` + cross-OS dispatch.
  - `commands.rs`: documenta `script_blocked` flow + novos comandos.
  - `lib.rs`: registra plugin-shell.
  - Frontend: `<ScriptConfirmModal>`, `<ItemListEditor>` com 5 kinds, allowScripts toggle.
  - "Looking ahead" → Plano 15 (temas customizáveis ou outra slice da Fase 4).
- [ ] **9.4** — Commits granulares. Push + PR.

---

## Resumo dos commits previstos

1. `feat(schema): Item gains App and Script variants + Profile.allow_scripts`
2. `feat(config): validate app/script item fields`
3. `feat(deps): tauri-plugin-shell + capability`
4. `feat(launcher): Opener.{spawn_app,spawn_script} + dispatch`
5. `feat(commands): script trust gating + set_script_trusted + set_profile_allow_scripts`
6. `feat(donut): ScriptConfirmModal component`
7. `feat(settings): ItemListEditor exposes app/script kinds + trust toggle`
8. `feat(settings): allow-scripts toggle in Sistema fieldset`
9. `feat(donut): integrate script confirm modal + force-run flow`
10. `docs(claude): mark Plano 14 (app + script items) complete`

(10 commits — slice grande mas componentes claros.)

---

## Critérios de aceitação

- [ ] Aba pode misturar URL + arquivo + pasta + app + script no mesmo `items[]`.
- [ ] `kind: "app"` lança o programa pelo nome (Firefox, VSCode) cross-OS.
- [ ] `kind: "script"` executa shell command via `sh -c` / `cmd /C`.
- [ ] Profile com `allowScripts: false` (default) bloqueia toda execução de script — toast localizado, sem modal.
- [ ] Profile com `allowScripts: true` + script `trusted: false`: primeiro launch abre `<ScriptConfirmModal>` com comando completo + checkbox de trust + botões Run/Cancel.
- [ ] Marcar checkbox "Confiar" + Run: persiste `trusted: true`, executa, e próximas execuções dispensam modal.
- [ ] Sem checkbox + Run: executa one-shot, mantém `trusted: false`, modal aparece de novo na próxima.
- [ ] ESC ou Cancel no modal: nada executa, donut fecha (ou continua aberto, decidir).
- [ ] Toggle "Permitir scripts" em Settings → Aparência → Sistema persiste em `profile.allow_scripts`.
- [ ] `<TabEditor>` mostra textarea pra script, input pra app, e checkbox de trust em modo edit.
- [ ] Configs antigas (Plano 13, sem app/script/allowScripts) carregam sem migração — defaults aplicam.
- [ ] CI verde.

---

## Notas

- **Por que `trusted` per-item em vez de approval por sessão**: aprovação por sessão (modal a cada relaunch do donut) cria fricção sem ganho de segurança real — se o user confiou no comando ontem, vai confiar de novo hoje. Persistir trusted no config é UX correta.
- **Por que default `allowScripts: false`**: princípio do menor privilégio. Scripts são poder bruto; user opta-in conscientemente. Tabs com scripts criadas em perfis que não permitem viram explicit no-ops com banner explicativo.
- **Por que all-or-nothing por tab no gating**: alternativa (executar URLs, pular script bloqueado) confunde UX porque o user não sabe que um item foi silenciosamente pulado. Bloquear o tab inteiro força confirmação clara.
- **Por que `force` arg em `open_tab` em vez de comando separado**: menos surface de API; o frontend controla quando bypassa via param explícito. Modal é o único caller legítimo de `force: true`.
- **Por que `spawn_app` separado de `spawn_path`**: nome amigável requer resolução cross-OS (PATH no Win/Linux, `open -a` no macOS). Tratar como `open_path` confunde (path absoluto vs nome de comando).
- **Macros cross-OS no launcher**: `#[cfg(target_os = "...")]` é a forma idiomática Tauri/Rust. Tests dos helpers cobrem a lógica de despacho; smoke manual cobre o spawn real (não dá pra testar plugin-shell sem runtime).
- **Por que sem cwd no script (primeiro corte)**: complica UX (4º campo no row do `<ItemListEditor>`) sem ganho proporcional. User pode `cd ~/projeto && cmd` no comando se precisa. Adicionar depois é trivial.
- **Por que sem args separados pra `kind: "app"`**: friendly name + args (`firefox --new-window https://x`) dobra a UI e introduz bugs de quoting. User que precisa de args usa `kind: "script"` com `firefox --new-window https://x`. Trade-off aceitável.
- **Risco de `validate` aceitar comando que falha em runtime**: validate não checa que `firefox` está no PATH ou que `git` existe. Erro acontece no spawn e cai em `outcome.failures` — UX já preparada (toast com partial failure).
- **Auditing/log**: scripts não geram log persistente. Futuro slice se virar requisito.
