# DonutTabs — Plano 10: Items `file` e `folder`

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: Use `superpowers:subagent-driven-development` (recomendada) ou `superpowers:executing-plans` para implementar este plano tarefa-a-tarefa.

**Meta:** Abrir a Fase 3 do roadmap ([docs/Plano.md](../Plano.md) §8.3) suportando dois novos `kind` de item dentro de uma aba:

1. **`kind: "file"`** — caminho absoluto de arquivo local. Acionar a aba abre cada arquivo no handler padrão do SO (`tauri-plugin-opener::open_path`).
2. **`kind: "folder"`** — caminho absoluto de diretório. Acionar a aba abre cada pasta no explorador do SO (mesmo `open_path`).

`kind: "app"` e `kind: "script"` ficam para o Plano 11 (precisam de UX de confirmação de segurança e busca de executáveis no PATH/registry — fora desta slice).

**Arquitetura:** O `Item` já é tagged union (`#[serde(tag = "kind")]`) reservada exatamente para isso. Adicionamos duas variantes na enum, estendemos `validate.rs`, `launcher::launch_tab` e o `<TabEditor>`. Schema continua **v2** (forward-compat: configs antigas só têm `Url` items, ainda parseiam; configs novas com `File`/`Folder` quebrariam DonutTabs anteriores — mas não há versões deployadas além da nossa). `tauri-plugin-dialog` é adicionado pra abrir o file/folder picker nativo dentro do `<TabEditor>`.

**Stack adicional:**
- `tauri-plugin-dialog` (Rust + frontend `@tauri-apps/plugin-dialog`) — picker nativo
- `tauri-plugin-opener` já tem `open_path`; sem dep nova para abrir

**Fora desta slice:**
- `kind: "app"` (busca de executável; alias por nome amigável) — Plano 11
- `kind: "script"` (shell command com confirmação de segurança) — Plano 11
- `openMode` por item (browser/handler específico por URL) — Plano 11
- Drag-and-drop pra reordenar items dentro de uma aba (URLs hoje também não são reordenáveis; consistente)
- Item-specific icon (cada item com ícone próprio) — fora; ícone é da aba
- Validação de existência do path no save (path pode estar em drive removível); existência só importa no launch e cai no `partial_failure`/`all_items_failed` existente

---

## Pré-requisitos (estado atual pós-merge do Plano 9)

- [src-tauri/src/config/schema.rs:127](../../src-tauri/src/config/schema.rs#L127): `Item` é `#[serde(tag = "kind")] enum Item { Url { value: String } }`. **Esta é exatamente a forma que precisa ser estendida.**
- [src-tauri/src/config/validate.rs:82](../../src-tauri/src/config/validate.rs#L82): só conhece `Item::Url { value }` e roda `url::Url::parse` nele.
- [src-tauri/src/launcher/mod.rs:21](../../src-tauri/src/launcher/mod.rs#L21): `match item { Item::Url { value } => opener.open_url(value) }`. Trait `Opener` só expõe `open_url`.
- [src-tauri/src/launcher/mod.rs:49](../../src-tauri/src/launcher/mod.rs#L49): `TauriOpener` delega ao `tauri-plugin-opener` `open_url`. O mesmo plugin já expõe `open_path` — basta chamar.
- [src/settings/TabEditor.tsx:23](../../src/settings/TabEditor.tsx#L23): `FormState.urls: string[]` é assumido em todo lugar; `<UrlListEditor>` ([src/settings/UrlListEditor.tsx](../../src/settings/UrlListEditor.tsx)) edita só strings.
- [src/core/types/Item.ts](../../src/core/types/Item.ts): gerado por ts-rs, hoje `{ kind: "url", value: string }`. Vai ganhar variants automaticamente quando o schema Rust mudar.
- [src-tauri/src/lib.rs:14](../../src-tauri/src/lib.rs#L14): `tauri::Builder` registra `tauri_plugin_global_shortcut`, `tauri_plugin_opener`, `tauri_plugin_autostart`. Plano adiciona `tauri_plugin_dialog`.
- [src-tauri/capabilities/default.json](../../src-tauri/capabilities/default.json): permissions atuais — vai ganhar `dialog:default` (e `opener:allow-open-path` se a feature default não cobrir).

---

## Estrutura de arquivos

### Novos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/settings/ItemListEditor.tsx` | Substitui `<UrlListEditor>` no `<TabEditor>`. Cada linha tem: seletor de kind (URL/Arquivo/Pasta), input de path/URL, botão "Procurar…" (só visível para file/folder, abre picker nativo via `@tauri-apps/plugin-dialog`), botão remover. Botões "Adicionar URL", "Adicionar arquivo", "Adicionar pasta" no rodapé. |
| `src/settings/__tests__/ItemListEditor.test.tsx` | Cobertura: render por kind, troca de kind preserva valor, picker dispara via mock, validação por kind |

### Modificados

| Arquivo | Mudança |
|---|---|
| `src-tauri/src/config/schema.rs` | `Item` ganha `File { path: String }` e `Folder { path: String }`. Mantém `#[serde(tag = "kind", rename_all = "camelCase")]` — kind serializa como `"file"` / `"folder"`. |
| `src-tauri/src/config/validate.rs` | Match da loop de items adiciona `Item::File`/`Item::Folder` → exige `path` não-vazio (após `trim`). Erro: `path_empty` com `tabId`/`profileId` no contexto. **Não** valida existência (defere ao launch). |
| `src-tauri/src/launcher/mod.rs` | `Opener` trait ganha `fn open_path(&self, path: &str) -> Result<(), String>`. `launch_tab` adiciona match arms File/Folder chamando `open_path`. `TauriOpener` impl chama `OpenerExt::open_path`. Tests: `MockOpener` ganha `path_calls` + `fail_paths`; novos tests cobrem mistura URL+file+folder, falha total inclui paths. |
| `src-tauri/Cargo.toml` | `tauri-plugin-dialog = "2"` |
| `src-tauri/src/lib.rs` | Registra plugin: `.plugin(tauri_plugin_dialog::init())`. |
| `src-tauri/capabilities/default.json` | Adiciona `dialog:default` (open file/folder dialogs) + `opener:allow-open-path` se necessário. |
| `package.json` | `@tauri-apps/plugin-dialog` (versão alinhada com a CLI) |
| `src/core/ipc.ts` | Helper opcional `pickFile()`/`pickFolder()` que delega ao `@tauri-apps/plugin-dialog`'s `open` — wrapper só pra centralizar import. Sem novo comando Rust. |
| `src/settings/TabEditor.tsx` | `FormState.urls: string[]` → `FormState.items: ItemDraft[]` (`{ kind, value }`). Validação por kind: URL → `new URL`; file/folder → `value.trim().length > 0`. Mapeamento para `Item[]` no submit. Renderiza `<ItemListEditor>` no lugar do `<UrlListEditor>`. |
| `src/settings/__tests__/TabEditor.test.tsx` | Atualiza testes de URL pra usarem o novo helper, adiciona casos para file/folder (validação, save). |
| `src/settings/UrlListEditor.tsx` | **Removido** (consumido só pelo `<TabEditor>`; `<ItemListEditor>` cobre o mesmo caso). Os testes em `__tests__` que importam vão ser deletados/portados. |
| `src/locales/{pt-BR,en}.json` | Novos: `settings.editor.items` (label da seção), `settings.editor.itemKind.{url,file,folder}`, `settings.editor.addItem.{url,file,folder}`, `settings.editor.itemPlaceholder.{url,file,folder}`, `settings.editor.browse`, `settings.editor.validationPathEmpty`, `errors.config.pathEmpty`, `errors.launcher.openPathFailed` |
| `src/donut/Donut.tsx` (firstTabUrl) | Helper só procura `Item::Url` — manter intacto. Favicon não roda para abas só-com-files; fallback à inicial do nome (já é o comportamento). |
| `CLAUDE.md` | Documentar novas variantes de `Item`, plugin-dialog, `<ItemListEditor>` |

---

## Tarefas

### Task 1 — Schema: variantes `File` e `Folder` (Rust, TDD)

**Arquivos:** `src-tauri/src/config/schema.rs`, novo teste em `schema` ou `validate`

- [ ] **1.1** — Adicionar variantes:
  ```rust
  pub enum Item {
      #[serde(rename_all = "camelCase")]
      Url { value: String },
      #[serde(rename_all = "camelCase")]
      File { path: String },
      #[serde(rename_all = "camelCase")]
      Folder { path: String },
  }
  ```
  Roda `cargo test --lib config::schema` para regenerar `src/core/types/Item.ts`. Confirma diff: novo TS é union `{kind:"url",value:string} | {kind:"file",path:string} | {kind:"folder",path:string}`.
- [ ] **1.2** — Teste de roundtrip serde garantindo que cada variant serializa com o campo `kind` correto e `path`/`value` correspondente.
- [ ] **1.3** — `cargo test --lib` deve passar (validate ainda só conhece Url; novos items só aparecem em testes próprios).

### Task 2 — Validação: `path` não-vazio (Rust, TDD)

**Arquivos:** `src-tauri/src/config/validate.rs`

- [ ] **2.1** — Match no loop de items ganha braços para `File`/`Folder`:
  ```rust
  Item::File { path } | Item::Folder { path } => {
      if path.trim().is_empty() {
          return Err(AppError::config("path_empty", &[
              ("tabId", tab.id.to_string()),
              ("profileId", profile.id.to_string()),
              ("kind", item_kind_label(item).into()),
          ]));
      }
  }
  ```
  Helper `item_kind_label(&Item) -> &'static str` retorna `"url"`/`"file"`/`"folder"`.
- [ ] **2.2** — Tests: aceita item com path não-vazio; rejeita string vazia ou só whitespace; mistura URL+file+folder válida passa; **não** chama filesystem (sem `Path::exists`).

### Task 3 — Launcher: trait `open_path` + dispatch (Rust, TDD)

**Arquivos:** `src-tauri/src/launcher/mod.rs`

- [ ] **3.1** — Estende trait:
  ```rust
  pub trait Opener: Send + Sync {
      fn open_url(&self, url: &str) -> Result<(), String>;
      fn open_path(&self, path: &str) -> Result<(), String>;
  }
  ```
- [ ] **3.2** — `launch_tab` match completo:
  ```rust
  match item {
      Item::Url { value } => opener.open_url(value),
      Item::File { path } | Item::Folder { path } => opener.open_path(path),
  }
  ```
  Failures continuam acumulando `(String, String)` — primeiro elemento é o value/path.
- [ ] **3.3** — `TauriOpener::open_path` chama `tauri_plugin_opener::OpenerExt::open_path(path, None::<&str>)`.
- [ ] **3.4** — Tests:
  - `MockOpener` agora rastreia `url_calls` e `path_calls` separadamente, com `fail_urls`/`fail_paths`.
  - Novo: tab com 3 items (URL, File, Folder) — todos sucedem → outcome.failures vazio, `total = 3`.
  - Novo: tab com File que falha — failure registrado com path como primeiro elemento.
  - Existing tests (URL only) continuam passando após updates do MockOpener.

### Task 4 — Plugin-dialog + capability + frontend wrapper

**Arquivos:** `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/default.json`, `package.json`, `src/core/ipc.ts`

- [ ] **4.1** — `Cargo.toml`: `tauri-plugin-dialog = "2"`.
- [ ] **4.2** — `lib.rs`: `.plugin(tauri_plugin_dialog::init())` na ordem antes do setup.
- [ ] **4.3** — `capabilities/default.json`: adiciona `"dialog:default"`. Verifica se `opener:default` cobre `open_path` — se não, adiciona `opener:allow-open-path`.
- [ ] **4.4** — `npm install @tauri-apps/plugin-dialog` na versão alinhada com `@tauri-apps/cli`.
- [ ] **4.5** — `src/core/ipc.ts` ganha:
  ```ts
  import { open as openDialog } from "@tauri-apps/plugin-dialog";

  export const dialog = {
    pickFile: () => openDialog({ multiple: false, directory: false }),
    pickFolder: () => openDialog({ multiple: false, directory: true }),
  };
  ```
  Retorna `string | null` (path absoluto ou null se cancelado).
- [ ] **4.6** — `cargo build` + `npm run tauri dev` para confirmar boot do plugin sem panic. Não há test direto; smoke manual.

### Task 5 — `<ItemListEditor>` + integração no `<TabEditor>`

**Arquivos:** `src/settings/ItemListEditor.tsx`, `src/settings/__tests__/ItemListEditor.test.tsx`, `src/settings/TabEditor.tsx`, `src/settings/__tests__/TabEditor.test.tsx`, **delete** `src/settings/UrlListEditor.tsx` + seu teste se houver

- [ ] **5.1** — Tipo local:
  ```ts
  type ItemKind = "url" | "file" | "folder";
  interface ItemDraft { kind: ItemKind; value: string; }
  ```
- [ ] **5.2** — `<ItemListEditor>`:
  - Props: `values: ItemDraft[]`, `onChange: (next: ItemDraft[]) => void`.
  - Cada linha:
    - `<select>` de kind (4 opções? não, 3: URL/Arquivo/Pasta) — troca de kind preserva `value` (não limpa) para evitar perder texto digitado.
    - `<input>` com placeholder localizado por kind (ex: `https://…`, `C:\\caminho\\arquivo.pdf`, `/home/user/Documentos`).
    - Botão "Procurar…" só renderiza para file/folder. Click chama `dialog.pickFile()`/`pickFolder()`; se retornar string, atualiza `value` da linha.
    - Botão remover (✕).
  - Rodapé: 3 botões "+ URL", "+ Arquivo", "+ Pasta", cada um adicionando linha com kind + value vazio.
- [ ] **5.3** — `<TabEditor>` `FormState.urls: string[]` → `items: ItemDraft[]`. `fromTab` mapeia cada `Item` para `ItemDraft`. Submit mapeia de volta:
  ```ts
  const items: Item[] = drafts
    .map(d => ({ ...d, value: d.value.trim() }))
    .filter(d => d.value.length > 0)
    .map(d => d.kind === "url"
      ? { kind: "url", value: d.value }
      : { kind: d.kind, path: d.value });
  ```
- [ ] **5.4** — Validação:
  - Se `items.length === 0` → `validationAtLeastOneItem` (renomeado de `validationAtLeastOneUrl`; mantém chave antiga como alias por compatibilidade até a próxima passada de cleanup).
  - Para cada item URL: `new URL(...)` (existing).
  - Para file/folder: `value.trim().length > 0` (já garantido pelo filter; loop só revalida URL).
- [ ] **5.5** — Tests:
  - `<ItemListEditor>`: render uma linha de cada kind com placeholder esperado; troca de kind mantém valor; click no remover dispara onChange sem a linha; "+ Arquivo" adiciona linha com `kind: "file"`; mock de `dialog.pickFile` retorna path → input atualiza.
  - `<TabEditor>`: salva tab com items mistos (URL + File + Folder); valida URL inválida; aceita items só-file (sem URL).
- [ ] **5.6** — Deleta `src/settings/UrlListEditor.tsx`. Verifica nenhum import remanescente (`grep -r UrlListEditor src/`).

### Task 6 — Locales + CLAUDE.md + pipeline + PR

- [ ] **6.1** — Adiciona keys novos em `pt-BR.json` e `en.json` (ver tabela "Modificados"). Mantém `validationAtLeastOneUrl` por enquanto (ou troca pra `validationAtLeastOneItem` ajustando o uso no `<TabEditor>`).
- [ ] **6.2** — `cargo fmt --check`, `cargo clippy --lib -- -D warnings`, `cargo test --lib`, `npx tsc --noEmit`, `npx vitest run` — todos verdes.
- [ ] **6.3** — `CLAUDE.md`: atualiza módulos `config/schema.rs` (Item ganha File/Folder), `launcher/` (open_path), `commands.rs` (sem mudança), `lib.rs` (registra plugin-dialog), `tauri.conf` gotchas (plugin-dialog feature/permission), e a seção "Looking ahead" para apontar Plano 11 (`app` + `script` + per-item `openMode`).
- [ ] **6.4** — Commits granulares (1 por tarefa lógica). Push + PR.

---

## Resumo dos commits previstos

1. `feat(schema): Item gains File and Folder variants`
2. `feat(config): validate non-empty path for file/folder items`
3. `feat(launcher): Opener.open_path + dispatch File/Folder via plugin-opener`
4. `feat(deps): tauri-plugin-dialog + capability + ipc.dialog wrappers`
5. `feat(settings): ItemListEditor replaces UrlListEditor with kind selector + browse`
6. `docs(claude): mark Plano 10 (file + folder items) complete`

---

## Critérios de aceitação

- [ ] Aba pode ter mistura de URLs + arquivos + pastas no mesmo `items[]`.
- [ ] Acionar a aba abre cada item no handler do SO (URL no browser, arquivo no app default, pasta no explorador).
- [ ] Picker nativo abre via "Procurar…" e popula o input com path absoluto.
- [ ] Save rejeita item file/folder com path vazio (validação client + server).
- [ ] Item com path inválido **não** quebra abertura dos demais — só entra em `outcome.failures` e o toast existente reporta `partialFailure`.
- [ ] Configs antigas (só-URL items) continuam carregando sem migração.
- [ ] CI verde (5 jobs).

---

## Notas

- **Por que não `Path::exists` na validação**: paths em drives removíveis (USB, network share desconectado) ou em mount points montados sob demanda passariam a save mas falhariam no load. Validar só forma + diferir existência ao launch é consistente com como o SO trata atalhos `.lnk` / `.desktop`. Erro de "arquivo não encontrado" cai no `outcome.failures` e o toast existente mostra.
- **Por que `tauri-plugin-dialog` em vez de `<input type="file">`**: input HTML não retorna path absoluto (só nome); é inviável persistir. `tauri-plugin-dialog` retorna `string` com path completo.
- **Por que não validar formato de path por SO**: regex de path é frágil entre Windows (`C:\\`, UNC `\\server\share`), macOS/Linux (`~`, `/mnt`, simbolic links). Confiar no SO no launch é mais robusto. Único guard é `trim().is_empty()`.
- **Por que `kind: "folder"` separado de `kind: "file"`**: ambos chamam `open_path`, mas o type-tag preserva intenção (UI mostra placeholder/ícone diferente; futuras features como "abrir terminal aqui" precisam dessa distinção).
- **Forward-compat do schema**: configs com kind desconhecido (ex: configs do futuro Plano 11 com `kind: "app"`) **falham** ao deserializar (serde tagged enum sem `#[serde(other)]`). Isso é intencional no MVP — não queremos silenciosamente perder items. Plano 11 vai considerar `#[serde(other)]` ou um tipo `kind: "unknown"` se a tolerância virar requisito.
- **Plugin-opener `open_path` segurança**: o `tauri-plugin-opener` por padrão restringe paths via capability scope. Se o teste manual mostrar bloqueio, configurar `opener:allow-open-path` na capability + scope `**` (caminhos arbitrários — DonutTabs é uma ferramenta do usuário, não recebe input externo).
