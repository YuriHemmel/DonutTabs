# DonutTabs — Plano 7: Polimento de perfis + autostart

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: Use `superpowers:subagent-driven-development` (recomendada) ou `superpowers:executing-plans` para implementar este plano tarefa-a-tarefa.

**Meta:** Fechar dois gaps de UX que sobraram do Plano 6 e da Fase 1 do `Plano.md`:

1. **Edição de ícone do perfil pela UI.** Hoje `create_profile` aceita `icon` no IPC, mas a Settings só pede `name` via `window.prompt`. Renomear/excluir perfil existe; editar nome+ícone em formulário dedicado, não.
2. **Autostart no SO.** Já existe `system.autostart` no schema (sempre `false`); falta o plugin `tauri-plugin-autostart`, comando `set_autostart`, e um toggle na Settings que reflita no SO.

**Arquitetura:** Mudança mínima. Plugin Tauri novo (`autostart`) + um comando + uma section na Settings (ou checkbox no `<AppearanceSection>`). Nenhuma mudança de schema.

**Stack adicional:** `tauri-plugin-autostart = "2"` (Rust) + `@tauri-apps/plugin-autostart` (npm).

**Fora desta slice:**
- Drag-and-drop pra reordenar perfis/abas → Plano 8.
- Menu de contexto + favicons → Plano 9.

---

## Pré-requisitos (estado atual pós-merge do Plano 6)

- [src-tauri/src/config/schema.rs](../../src-tauri/src/config/schema.rs:1): `SystemConfig { autostart: bool }` existe; o flag é só lido (nunca aplicado).
- [src-tauri/src/commands.rs](../../src-tauri/src/commands.rs:1): `update_profile(profile_id, name, icon)` já aceita `icon: Option<String>` (string vazia limpa). Usado pelo `useConfig.updateProfile`.
- [src/settings/ProfilePicker.tsx](../../src/settings/ProfilePicker.tsx:1): select + "+ Novo" + "Excluir". Sem edição.
- [src/settings/SettingsApp.tsx](../../src/settings/SettingsApp.tsx:1): `handleCreateProfile` usa `window.prompt(...)` para o nome — sem ícone.

---

## Estrutura de arquivos

### Novos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/settings/ProfileEditor.tsx` | Formulário inline (name + icon, mesma regra de stripping de letras do `TabEditor`) usado para criar e para editar |
| `src/settings/__tests__/ProfileEditor.test.tsx` | Validação (nome obrigatório, ícone único grafema), rejeita letras |

### Modificados

| Arquivo | Mudança |
|---|---|
| `src-tauri/Cargo.toml` | `tauri-plugin-autostart = "2"` |
| `package.json` | `@tauri-apps/plugin-autostart` |
| `src-tauri/src/lib.rs` | Plugin registration + sync inicial do estado (se `cfg.system.autostart == true`, garantir habilitado no SO) |
| `src-tauri/src/commands.rs` | Novo `set_autostart(enabled: bool)` que muta `cfg.system.autostart`, persiste, **e** chama o plugin pra ativar/desativar no SO |
| `src/core/ipc.ts` | `setAutostart(enabled: boolean)` |
| `src/settings/useConfig.ts` | `setAutostart` helper |
| `src/settings/AppearanceSection.tsx` | (Opção A — escopo justo) Adicionar fieldset "Sistema" com checkbox autostart. Alternativa: criar `SystemSection` dedicada — não vale a pena pra um único toggle |
| `src/settings/ProfilePicker.tsx` | "+ Novo" e "Excluir perfil" continuam; adicionar botão "Editar perfil" que abre `<ProfileEditor>` num modal/painel inline |
| `src/settings/SettingsApp.tsx` | Substituir `window.prompt` em `handleCreateProfile` por exibir `<ProfileEditor>` em modo "new"; ganhar handler "edit" também |
| `src/locales/{pt-BR,en}.json` | Chaves `settings.profile.{editTitle,newTitle,iconLabel,iconHint}`, `settings.system.{title,autostart,autostartHint}`, `errors.io.{autostartFailed,autostartUnknown}` |
| `CLAUDE.md` | Mencionar plugin autostart, `set_autostart`, e que `<ProfileEditor>` substituiu o prompt |

---

## Tarefas

### Task 1 — `<ProfileEditor>` reusável (TDD)

**Arquivos:** `src/settings/ProfileEditor.tsx`, `src/settings/__tests__/ProfileEditor.test.tsx`

Form simples espelhando `<TabEditor>` (sem tabs/openMode):

- `name` (input text obrigatório, trim, min 1 char depois de trim)
- `icon` (input com `maxLength=16`, mesmo `stripLetters` do TabEditor, validação opcional — perfis podem não ter ícone)
- Salvar → `onSubmit({ name, icon: icon || null })`
- Cancelar → `onCancel()`

Modes: `"new"` (botão "Criar"), `"edit"` (botão "Salvar" + ícone/nome pré-preenchidos do `initial`). Comparte a lógica de validação client-side. Render no mesmo painel acima do `<SectionTabs>` via teleport / inline.

Testes:
- Cria com nome válido → `onSubmit` chamado com `{ name: "X", icon: null }`.
- Nome vazio → mostra erro, não chama `onSubmit`.
- Pasta letra no campo de ícone → input vira vazio (mesmo `stripLetters`).
- 2 grafemas no ícone → erro de validação.
- Em mode `edit`, prefill bate com `initial`.

### Task 2 — Substituir prompt em `handleCreateProfile` + adicionar fluxo `edit`

**Arquivos:** `src/settings/SettingsApp.tsx`, `src/settings/ProfilePicker.tsx`, `src/settings/__tests__/SettingsApp.test.tsx`

- `<ProfilePicker>` ganha botão "Editar perfil" entre Select e "+ Novo".
- `SettingsApp` mantém estado `profileEditorMode: null | { mode: "new" } | { mode: "edit"; profileId }`.
- Quando `!== null`, renderiza `<ProfileEditor>` num painel acima do `<SectionTabs>` (substitui o `<ProfilePicker>` enquanto editor aberto OU aparece sobreposto — escolher o que parecer menos intrusivo, talvez sobreposto).
- Submit (mode new) → `createProfile(name, icon)`, set `selectedProfileId = newId`, fecha editor.
- Submit (mode edit) → `updateProfile(profileId, name, icon)`, fecha editor.
- Intent `"new-profile"` continua chamando `handleCreateProfile`, que agora abre o editor inline em vez de `window.prompt`.

Testes:
- Click "+ Novo" → editor aparece em mode `new`, nome vazio.
- Click "Editar perfil" → editor aparece em mode `edit` com nome do perfil selecionado.
- Submit válido em mode new → `ipc.createProfile` chamado, editor fecha, novo perfil selecionado.
- Submit em mode edit → `ipc.updateProfile` chamado, editor fecha.
- Cancel → editor fecha sem chamar IPC.

### Task 3 — Plugin autostart + comando Rust

**Arquivos:** `src-tauri/Cargo.toml`, `package.json`, `src-tauri/src/lib.rs`, `src-tauri/src/commands.rs`, `src-tauri/capabilities/default.json`

- [ ] **Step 3.1 — Adicionar deps**

```bash
cd src-tauri && cargo add tauri-plugin-autostart
cd .. && npm install @tauri-apps/plugin-autostart
```

- [ ] **Step 3.2 — `lib.rs` registra plugin**

```rust
.plugin(tauri_plugin_autostart::init(
    tauri_plugin_autostart::MacosLauncher::LaunchAgent,
    None, // sem args — app sobe em tray
))
```

No `setup()`, sincroniza estado: lê `cfg.system.autostart`, e se `true` mas SO não habilitado (ou vice-versa), reconcilia. Falha de sync é best-effort + log (não aborta).

- [ ] **Step 3.3 — Comando `set_autostart`**

```rust
#[tauri::command]
pub fn set_autostart<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    enabled: bool,
) -> Result<Config, AppError> {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    if enabled {
        manager.enable().map_err(|e| AppError::io("autostart_failed", &[("reason", e.to_string())]))?;
    } else {
        manager.disable().map_err(|e| AppError::io("autostart_failed", &[("reason", e.to_string())]))?;
    }

    let snapshot = {
        let mut cfg = state.config.write().unwrap();
        let old = cfg.system.autostart;
        cfg.system.autostart = enabled;
        if let Err(e) = save_atomic(&state.config_path, &cfg) {
            // Rollback SO + memória
            cfg.system.autostart = old;
            let _ = if old { manager.enable() } else { manager.disable() };
            return Err(e);
        }
        cfg.clone()
    };
    let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
    Ok(snapshot)
}
```

Adicionar `AppError::io` helper se ainda não existir (provavelmente sim, já temos `io_generic` etc).

- [ ] **Step 3.4 — Capabilities**

`capabilities/default.json` — adicionar `"autostart:default"`.

### Task 4 — UI do toggle autostart na Settings

**Arquivos:** `src/core/ipc.ts`, `src/settings/useConfig.ts`, `src/settings/AppearanceSection.tsx`, `src/locales/`

- `ipc.setAutostart(enabled)` wrapper.
- `useConfig.setAutostart`.
- `AppearanceSection` ganha fieldset "Sistema" com checkbox controlado por `cfg.system.autostart`. Toggle dispara `ipc.setAutostart`.
- Locale: `settings.system.{title, autostart, autostartHint}`.

Teste: clicar no checkbox chama `ipc.setAutostart(!current)`.

### Task 5 — Pipeline + CLAUDE.md + PR

- `cargo test/clippy/fmt` + `npm test` + `tsc`.
- CLAUDE.md atualizado.
- Commit + push + PR.

---

## Resumo dos commits previstos

1. `feat(settings): ProfileEditor with name + icon validation`
2. `feat(settings): replace window.prompt with inline ProfileEditor for create + edit`
3. `feat(autostart): plugin + set_autostart command with rollback`
4. `feat(settings): autostart toggle in Settings`
5. `docs(claude): mark Plano 7 (profile editor + autostart) complete`

---

## Critérios de aceitação

- [ ] Criar perfil pelo donut "+" abre `<ProfileEditor>` na Settings (não mais `window.prompt`).
- [ ] Editar nome+ícone de perfil existente persiste e reflete no donut switcher.
- [ ] Toggle autostart na Settings habilita/desabilita o app no startup do SO; valor persiste.
- [ ] Reabrir o app com autostart on não duplica registros nem perde estado.
- [ ] CI verde.

---

## Notas

- **Not over-engineer the toggle**: um único checkbox em "Sistema" basta. Não criar `<SystemSection>` dedicada por isso.
- **Falha do plugin autostart**: ocorre em ambientes sandboxed (snap/flatpak). Tratar como erro recuperável: toast traduzido + estado em memória NÃO muda.
- **Emoji vazio**: ProfileEditor permite `icon: null` (perfil sem ícone, switcher mostra inicial). Manter consistência com Plano 6.
