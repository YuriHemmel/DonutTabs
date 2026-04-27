# DonutTabs — Plano 11: `openWith` por item

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: Use `superpowers:subagent-driven-development` (recomendada) ou `superpowers:executing-plans` para implementar este plano tarefa-a-tarefa.

**Meta:** Permitir que cada `Item` (URL/arquivo/pasta) seja aberto com um programa/handler específico, em vez de sempre cair no handler default do SO. Caso de uso real: aba "Trabalho" abre URLs no Edge; aba "Pessoal" abre URLs no Firefox; arquivo `.psd` específico abre no Photoshop em vez do app default.

**Mecânica:** O `tauri-plugin-opener` já expõe um segundo argumento `with: Option<&str>` em `open_url(url, with)` e `open_path(path, with)`. Hoje o `launcher` passa `None` em ambos. Este plano adiciona `Item.openWith: Option<String>` e propaga até o plugin.

**Decisão de naming:** `openWith` (camelCase no JSON, `open_with: Option<String>` no Rust). Lê como "open with X" e não conflita com o existente `Tab.openMode`.

**Status do `Tab.openMode`:** O campo continua **vestigial** (declarado em `Tab`, validado, editado em testes — mas nunca lido pelo `launcher`). Documenta-se como reservado e segue intacto pra não quebrar configs existentes. Removê-lo é uma slice independente.

**Fora desta slice:**
- Resolver/validar nomes de programa cross-OS (`"firefox"` vs `"Firefox.app"` vs `/snap/firefox/...`) — confiar na resolução do plugin/SO; falha cai em `partial_failure`.
- Picker visual de aplicativos instalados — futuro (ligado a Plano 12 `kind: "app"`).
- Ressuscitar `Tab.openMode { Reuse | NewWindow | NewTab }` com semântica real — fora.
- Per-tab default de `openWith` (herdar para items sem o campo) — fora; cada item carrega o próprio.

---

## Pré-requisitos (estado atual pós-merge do Plano 10)

- [src-tauri/src/config/schema.rs:127](../../src-tauri/src/config/schema.rs#L127): `Item` é `#[serde(tag = "kind")] enum` com 3 variantes (`Url { value }`, `File { path }`, `Folder { path }`).
- [src-tauri/src/launcher/mod.rs:5](../../src-tauri/src/launcher/mod.rs#L5): trait `Opener { open_url, open_path }` — assinaturas **sem** `with`. `TauriOpener` passa `None::<&str>` ao plugin.
- [src-tauri/src/config/validate.rs:82](../../src-tauri/src/config/validate.rs#L82): match per-item valida `value` (URL) ou `path` (file/folder). Sem campo extra hoje.
- [src/settings/ItemListEditor.tsx:19](../../src/settings/ItemListEditor.tsx#L19): `ItemDraft { kind, value }`. Cada linha tem 4 elementos: kind selector, value input, browse (opcional), remove.
- [src/settings/TabEditor.tsx](../../src/settings/TabEditor.tsx): `draftToItem` mapeia `ItemDraft → Item` (`{kind:"url",value}` / `{kind, path}`).

---

## Estrutura de arquivos

### Novos arquivos

Nenhum. Toda a slice cabe em arquivos existentes.

### Modificados

| Arquivo | Mudança |
|---|---|
| `src-tauri/src/config/schema.rs` | Cada variant de `Item` ganha `open_with: Option<String>`. `#[serde(default)]` para que configs antigas (campo ausente) deserializem como `None`. |
| `src-tauri/src/config/validate.rs` | Validação adicional: se `open_with` é `Some(s)`, exige `s.trim().len() > 0`. Erro: `open_with_empty` com `tabId`/`profileId` no contexto. **Não** valida que o programa existe — falha cai no launch. |
| `src-tauri/src/launcher/mod.rs` | Trait `Opener` ganha o parâmetro `with: Option<&str>` em `open_url` e `open_path`. `TauriOpener` repassa pro plugin. `launch_tab` extrai `open_with` do item e passa adiante. |
| `src/core/types/Item.ts` | Regenerado por ts-rs — cada variant ganha `openWith: string \| null`. |
| `src/settings/ItemListEditor.tsx` | `ItemDraft` ganha `openWith: string`. Cada linha ganha um input opcional "Abrir com" (placeholder `firefox`, `Photoshop`, etc.). Visualmente compacto: input curto à direita, antes do botão remove. |
| `src/settings/TabEditor.tsx` | `itemToDraft` lê `it.openWith ?? ""`. `draftToItem` escreve `openWith: trimmed.length > 0 ? trimmed : null` em todas as variantes. Submit valida `openWith` por item: se preenchido, trim != "". |
| `src/settings/__tests__/{ItemListEditor,TabEditor}.test.tsx` | Cobre: render do input, edição emite onChange, submit envia `openWith` correto, vazio vira `null`. |
| `src/locales/{pt-BR,en}.json` | `settings.editor.openWithLabel` ("Abrir com"), `settings.editor.openWithPlaceholder` ("ex.: firefox, code, Photoshop"), `settings.editor.openWithHint` (texto curto no helper), `errors.config.openWithEmpty`. |
| `CLAUDE.md` | Documentar campo, novo arg da trait, próximo (Plano 12 = `kind: "app"`). |

---

## Tarefas

### Task 1 — Schema: `open_with` em cada variant (Rust, TDD)

**Arquivos:** `src-tauri/src/config/schema.rs`

- [ ] **1.1** — Adicionar campo a cada variant:
  ```rust
  pub enum Item {
      #[serde(rename_all = "camelCase")]
      Url {
          value: String,
          #[serde(default, skip_serializing_if = "Option::is_none")]
          open_with: Option<String>,
      },
      #[serde(rename_all = "camelCase")]
      File {
          path: String,
          #[serde(default, skip_serializing_if = "Option::is_none")]
          open_with: Option<String>,
      },
      #[serde(rename_all = "camelCase")]
      Folder {
          path: String,
          #[serde(default, skip_serializing_if = "Option::is_none")]
          open_with: Option<String>,
      },
  }
  ```
  `#[serde(default)]` garante backward-compat: configs do Plano 10 deserializam como `None`. `skip_serializing_if` mantém o JSON enxuto quando o campo está vazio.
- [ ] **1.2** — Roundtrip serde tests: variant com `openWith: Some("firefox")` e variant sem (None) ambos sobrevivem ida/volta.
- [ ] **1.3** — Backward-compat test: parse de JSON `{"kind":"url","value":"https://x"}` (sem `openWith`) produz `Url { value, open_with: None }`.
- [ ] **1.4** — `cargo test --lib config::schema` regenera `src/core/types/Item.ts`. Conferir diff: cada shape ganha `openWith: string | null`.

### Task 2 — Validação: `openWith` não-vazio se presente (Rust, TDD)

**Arquivos:** `src-tauri/src/config/validate.rs`

- [ ] **2.1** — Após o match existente (URL parseable / path non-empty), checar `open_with`:
  ```rust
  if let Some(ow) = item_open_with(item) {
      if ow.trim().is_empty() {
          return Err(AppError::config(
              "open_with_empty",
              &[
                  ("tabId", tab.id.to_string()),
                  ("profileId", profile.id.to_string()),
              ],
          ));
      }
  }
  ```
  Helper `item_open_with(&Item) -> Option<&str>` faz match e retorna o ref. Decisão: rejeitar string vazia/whitespace para evitar configs onde o usuário "começou a digitar e desistiu" — `None` (campo omitido) é a forma de "use default".
- [ ] **2.2** — Tests:
  - URL com `openWith: Some("firefox")` valida.
  - URL com `openWith: Some("")` rejeita com `open_with_empty`.
  - URL com `openWith: Some("   ")` rejeita.
  - URL com `openWith: None` valida (campo omitido).
  - Mistura: dentro do mesmo tab, items com e sem `openWith` validam.

### Task 3 — Launcher: trait `Opener` ganha `with` + dispatch (Rust, TDD)

**Arquivos:** `src-tauri/src/launcher/mod.rs`

- [ ] **3.1** — Trait redesign:
  ```rust
  pub trait Opener: Send + Sync {
      fn open_url(&self, url: &str, with: Option<&str>) -> Result<(), String>;
      fn open_path(&self, path: &str, with: Option<&str>) -> Result<(), String>;
  }
  ```
- [ ] **3.2** — `launch_tab` extrai `open_with` por item e propaga:
  ```rust
  match item {
      Item::Url { value, open_with } => {
          opener.open_url(value, open_with.as_deref())
      }
      Item::File { path, open_with } => {
          opener.open_path(path, open_with.as_deref())
      }
      Item::Folder { path, open_with } => {
          opener.open_path(path, open_with.as_deref())
      }
  }
  ```
  (Mesmo `open_path` arm pra File/Folder, idêntico ao Plano 10.)
- [ ] **3.3** — `TauriOpener` passa `with` adiante via `OpenerExt`:
  ```rust
  fn open_url(&self, url: &str, with: Option<&str>) -> Result<(), String> {
      use tauri_plugin_opener::OpenerExt;
      self.app.opener().open_url(url, with).map_err(|e| e.to_string())
  }
  ```
  (Idem para `open_path`.)
- [ ] **3.4** — `MockOpener` rastreia `(value_or_path, with)` em vez de só strings. Novos tests:
  - URL com `openWith: Some("firefox")` chama mock com segundo arg `Some("firefox")`.
  - URL sem `openWith` chama mock com `None`.
  - Mix: URL com firefox + URL sem + file com `code` — três calls com `with` correspondente.
  - Failure path inclui `with` na mensagem de erro? **Não** — failure tracking continua só com value/path como primeiro elemento. `with` é detalhe de invocação.

### Task 4 — Frontend: `<ItemListEditor>` 4ª coluna + `<TabEditor>` mapping

**Arquivos:** `src/settings/ItemListEditor.tsx`, `src/settings/TabEditor.tsx`, `src/settings/__tests__/{ItemListEditor,TabEditor}.test.tsx`

- [ ] **4.1** — `ItemDraft`:
  ```ts
  export interface ItemDraft {
    kind: ItemKind;
    value: string;
    openWith: string;  // empty string ⇔ unset
  }
  ```
- [ ] **4.2** — `<ItemListEditor>`: cada linha ganha um input curto (≈140px) com `placeholder` localizado, antes do botão remove. `aria-label`/`data-testid` específicos (`item-open-with-{i}`).
- [ ] **4.3** — `add(kind)` cria `{ kind, value: "", openWith: "" }`.
- [ ] **4.4** — `<TabEditor>`:
  - `itemToDraft(it)`: `{ kind: it.kind, value: it.kind === "url" ? it.value : it.path, openWith: it.openWith ?? "" }`.
  - `draftToItem(d)`: trim `openWith`. Se vazio → omitir/`null`. Mapear pra cada variant:
    ```ts
    const ow = d.openWith.trim();
    const openWith = ow.length > 0 ? ow : null;
    return d.kind === "url"
      ? { kind: "url", value: d.value, openWith }
      : { kind: d.kind, path: d.value, openWith };
    ```
  - Validação cliente: se `openWith` foi digitado mas trim resulta em "", limpar pro user (não bloquear submit — apenas tratar como unset). Server-side já rejeita `open_with_empty` se algo escapou (defesa em camadas).
- [ ] **4.5** — Tests `<ItemListEditor>`:
  - Render do input por linha; valor inicial vazio.
  - Typing emite `onChange` com `openWith` atualizado.
  - Adicionar nova linha ⇒ `openWith: ""`.
- [ ] **4.6** — Tests `<TabEditor>`:
  - Save com `openWith: "firefox"` produz `Item { ..., openWith: "firefox" }`.
  - Save com `openWith` vazio produz `openWith: null`.
  - Save com `openWith: "  firefox  "` produz `openWith: "firefox"` (trim).
  - Edit de tab existente prefilla `openWith` do `Item.openWith` no input.

### Task 5 — Locales + CLAUDE.md + pipeline + PR

- [ ] **5.1** — `pt-BR.json` e `en.json`:
  - `settings.editor.openWithLabel`: "Abrir com" / "Open with"
  - `settings.editor.openWithPlaceholder`: "ex.: firefox, code, Photoshop" / "e.g. firefox, code, Photoshop"
  - `errors.config.openWithEmpty`: "Programa para abrir não pode ser vazio na aba {{tabId}}." / "Open-with program cannot be empty in tab {{tabId}}."
- [ ] **5.2** — `cargo fmt --check`, `cargo clippy --lib -- -D warnings`, `cargo test --lib`, `npx tsc --noEmit`, `npx vitest run` — todos verdes.
- [ ] **5.3** — `CLAUDE.md`: atualiza módulo `config/schema.rs` (Item carrega openWith), `config/validate.rs` (open_with_empty), `launcher/` (trait com `with`), settings frontend (ItemDraft + ItemListEditor 4-col), e a seção "Looking ahead" para apontar Plano 12 (`kind: "app"`).
- [ ] **5.4** — Commits granulares (1 por tarefa lógica). Push + PR.

---

## Resumo dos commits previstos

1. `feat(schema): Item gains openWith per variant`
2. `feat(config): validate non-empty openWith when present`
3. `feat(launcher): Opener.{open_url,open_path} accept with parameter`
4. `feat(settings): ItemListEditor exposes openWith column + TabEditor mapping`
5. `docs(claude): mark Plano 11 (openWith per item) complete`

(5 commits — uma a menos que Plano 10 porque não há dep nova; tudo cabe nas crates atuais.)

---

## Critérios de aceitação

- [ ] Item URL com `openWith: "firefox"` abre no Firefox; sem o campo, abre no browser default.
- [ ] Item File com `openWith: "code"` abre o arquivo no VS Code; sem o campo, abre no app associado ao mime.
- [ ] Configs antigas (Plano 10, sem `openWith`) carregam sem migração — campo deserializa como `None`.
- [ ] `<ItemListEditor>` mostra input "Abrir com" por linha; vazio salva como `null`, preenchido salva trimmed.
- [ ] Validação rejeita `openWith: "   "` mas aceita `null`/omitido.
- [ ] `Tab.openMode` continua presente no schema (não-removido) e segue não-lido pelo launcher (estado atual preservado).
- [ ] CI verde (5 jobs).

---

## Notas

- **Por que `Option<String>` em vez de `String` (vazio = unset)**: `Option` é mais limpo no Rust (`is_some()` checa intent) e na UI (input vazio é unset, sem ambiguidade). Schema-side, `null` no JSON é distintivo de `""`.
- **Por que rejeitar string vazia/whitespace**: se o user começou a digitar "fire" e apagou tudo, intent é "esqueça, use default". Forçar limpar pro `null` no save evita persistir lixo invisível. Server-side check é defesa em camadas — frontend já trim+null.
- **Por que não picker de aplicativos instalados**: requer enumerar `%PROGRAMFILES%`, `App Paths` registry, `/Applications`, etc. — escopo de Plano 12 (`kind: "app"` que enxerga "Edge" como uma entidade própria, não como string genérica).
- **Por que segurar `Tab.openMode` em vez de remover**: schema migration é custosa (mesmo trivial — campo continua deserializando) e o campo pode ressuscitar quando `tauri-plugin-opener` ganhar controle real de tab/window por browser. Removê-lo agora forçaria reintroduzir depois.
- **`tauri-plugin-opener` `with` cross-OS**: Windows aceita executável no PATH (`firefox`, `code.cmd`) ou path absoluto. macOS aceita `.app` bundle name. Linux usa nome no PATH. O plugin **não normaliza** — o usuário escreve o que funciona no SO dele. Documentar no placeholder/hint.
- **Per-tab default de `openWith`**: tentador (todos os items da aba "Trabalho" abrem no Edge sem repetição). Fora deste plano. Pra adicionar depois: `Tab.defaultOpenWith: Option<String>`, herdado por items que não overridem. Sem impacto neste schema.
