# DonutTabs — Plano 9: Menu de contexto + favicons / Lucide icons

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: Use `superpowers:subagent-driven-development` (recomendada) ou `superpowers:executing-plans` para implementar este plano tarefa-a-tarefa.

**Meta:** Fechar a UX do donut com:

1. **Menu de contexto na fatia** (right-click). Hoje hover-hold expõe Editar/Excluir; right-click é a forma esperada em desktop. Itens: **Abrir tudo**, **Editar**, **Excluir**.
2. **Favicons automáticos** quando a aba não tem `icon` explícito. Renderizado dentro da fatia (substitui inicial do nome). Fetch via comando Rust (evita CORS) + cache em disco.
3. **Lucide icons** como alternativa a emoji no campo `icon`. Esquema: prefixo `"lucide:CoffeeIcon"` no campo `icon`. Picker no `<TabEditor>` e `<ProfileEditor>` mostra grid de ícones Lucide buscáveis. Render no donut: emoji literal OU `<LucideIcon>` componente.

**Arquitetura:** Schema permanece `icon: string` — só convenção de prefixo. Favicon cache fica em `%APPDATA%/DonutTabs/favicons/<sha256>.{png,ico}`. Comando `fetch_favicon(url) -> CachedPath | DataUrl` — donut consulta sob demanda quando aba não tem ícone. Right-click no donut suprime hover-hold e mostra menu flutuante absoluto.

**Stack adicional:**
- `lucide-react` (frontend)
- `reqwest` (Rust — pode já estar como dep transitiva; senão adicionar com `features = ["rustls-tls"]`)
- `sha2` (Rust — hash do URL pra nome do cache)
- `image` opcional (Rust — converter `.ico` pra `.png`; pode adiar e renderizar ico direto via webview)

**Fora desta slice:**
- Custom upload de imagem como ícone (drag de PNG → base64 inline) — futuro.
- Sincronizar favicons entre máquinas — não.
- Per-item icon (ícone por URL dentro da aba) — não, ícone é da aba.

---

## Pré-requisitos (estado atual pós-merge do Plano 8)

- [src-tauri/src/config/schema.rs](../../src-tauri/src/config/schema.rs:1): `Tab { icon: Option<String> }`. Validação `name OR icon` requer ao menos um.
- [src/donut/Slice.tsx](../../src/donut/Slice.tsx:1): renderiza ícone se presente, senão inicial do nome.
- [src/settings/TabEditor.tsx](../../src/settings/TabEditor.tsx:1): input texto bruto pra `icon`, com `stripLetters` + grafema único.
- [src/settings/ProfileEditor.tsx](../../src/settings/ProfileEditor.tsx:1): mesmo padrão (após Plano 7).
- [src/donut/Donut.tsx](../../src/donut/Donut.tsx:1): hover-hold sobre fatias; sem right-click handler.

---

## Estrutura de arquivos

### Novos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src-tauri/src/favicon/mod.rs` | `fetch_favicon(url) -> Result<FaviconResult>`. Resolve `<url>/favicon.ico`, fallback `https://www.google.com/s2/favicons?domain=<host>&sz=64`. Cache em `favicons/<sha256(url_origin)>.png\|ico`. Retorna caminho local + mime |
| `src-tauri/src/favicon/cache.rs` | Helpers de path, leitura, escrita, invalidação por TTL (7 dias) |
| `src-tauri/src/favicon/__tests__.rs` | Mock HTTP (wiremock ou similar) ou pula network: testa só `cache_path_for(url)`, `is_stale(ts)`, `parse_html_for_icon` |
| `src/donut/IconRenderer.tsx` | Decide como renderizar string de ícone: `lucide:Name` → `<LucideIcon name>`; data URL/path → `<image>`; senão emoji literal |
| `src/donut/__tests__/IconRenderer.test.tsx` | Cobre os 3 modos |
| `src/donut/useFavicon.ts` | Hook: dado tab sem icon, busca via IPC `fetch_favicon`, cacheia em memória, retorna `{ src, loading, error }` |
| `src/donut/SliceContextMenu.tsx` | Menu flutuante (position absolute, key='Escape' fecha) com 3 ações |
| `src/donut/__tests__/SliceContextMenu.test.tsx` | Render, callbacks, fecha em ESC/outside |
| `src/settings/IconPicker.tsx` | Modal com tabs "Emoji" \| "Lucide". Lucide: input search + grid filtrado por nome |
| `src/settings/__tests__/IconPicker.test.tsx` | Search filtra; click chama `onSelect("lucide:CoffeeIcon")` ou emoji literal |

### Modificados

| Arquivo | Mudança |
|---|---|
| `src-tauri/Cargo.toml` | `reqwest = { version = "0.12", default-features = false, features = ["rustls-tls"] }`, `sha2 = "0.10"` |
| `src-tauri/src/lib.rs` | Registra comando `fetch_favicon`. Cria diretório `favicons/` no setup (best-effort) |
| `src-tauri/src/commands.rs` | `#[tauri::command] fn fetch_favicon(url: String) -> Result<FaviconResult, AppError>` delegando ao módulo. Não muta config |
| `src-tauri/capabilities/default.json` | Sem mudança (não precisa permission nova — comando custom) |
| `package.json` | `lucide-react` |
| `src/core/ipc.ts` | `fetchFavicon(url): Promise<FaviconResult>` |
| `src/donut/Slice.tsx` | Aceita `iconNode?: ReactNode`; donut decide qual passar (icon explícito vs favicon vs inicial) |
| `src/donut/Donut.tsx` | onContextMenu na fatia → abre `<SliceContextMenu>` na posição do cursor; suprime hover-hold enquanto menu aberto |
| `src/settings/TabEditor.tsx` | Input `icon` ganha botão "Escolher" → abre `<IconPicker>`. Texto manual continua funcionando |
| `src/settings/ProfileEditor.tsx` | Mesmo botão "Escolher" |
| `src/locales/{pt-BR,en}.json` | `donut.contextMenu.{openAll,edit,delete}`, `settings.icon.{pickButton,searchPlaceholder,tabEmoji,tabLucide}`, `errors.io.{faviconFetch,faviconParse}` |
| `CLAUDE.md` | Documentar prefixo `lucide:`, módulo favicon, novo comando |

---

## Tarefas

### Task 1 — Fetch + cache de favicon (Rust, TDD)

**Arquivos:** `src-tauri/src/favicon/{mod.rs,cache.rs}`, testes

Steps:

- [ ] **1.1** — `cache_path_for(url: &str, base_dir: &Path) -> PathBuf`: hash sha256 da `origin` (scheme+host+port), prefixa em `base_dir/favicons/<hex>.bin`. Teste: dois URLs com mesma origin → mesmo hash; URLs diferentes → diferentes.
- [ ] **1.2** — `is_stale(modified: SystemTime, now: SystemTime, ttl: Duration) -> bool`. Teste com TTL 7d.
- [ ] **1.3** — `pick_icon_url(html: &str, page_url: &Url) -> Option<Url>`: parse `<link rel="icon|shortcut icon|apple-touch-icon" href>`, resolve href contra `page_url` (relativo OK). Teste com 3 fixtures HTML.
- [ ] **1.4** — `fetch_favicon` orquestra: tenta cache válido → retorna; senão GET `<origin>/favicon.ico`; se 404, GET `page_url`, parse HTML, GET `pick_icon_url`; se tudo falhar, GET `https://www.google.com/s2/favicons?domain=<host>&sz=64`. Detecção de mime por bytes mágicos (PNG `89 50 4E 47`, ICO `00 00 01 00`, JPEG `FF D8`). Salva em cache, retorna `FaviconResult { local_path, mime }`.
- [ ] **1.5** — Erros estruturados: `AppError::io("favicon_fetch", &[("url", url)])`, `("favicon_parse", &[("reason", ...)])`.

`FaviconResult`:

```rust
#[derive(Serialize, TS)]
#[serde(rename_all = "camelCase")]
pub struct FaviconResult {
    pub local_path: String, // absolute path; webview lê via `convertFileSrc`
    pub mime: String,
}
```

### Task 2 — Comando + IPC + hook `useFavicon`

**Arquivos:** `src-tauri/src/commands.rs`, `src/core/ipc.ts`, `src/donut/useFavicon.ts`

- [ ] **2.1** — Registrar `fetch_favicon` no `invoke_handler`.
- [ ] **2.2** — `ipc.fetchFavicon(url)` retorna `FaviconResult`.
- [ ] **2.3** — Hook `useFavicon(firstUrl: string | null)`:
  - estado `{ src: string | null, loading, error }`
  - se `firstUrl == null` → não dispara
  - dispara fetch on-mount + on-change
  - converte `local_path` via `convertFileSrc(...)` antes de retornar
  - cache em memória (Map<url, FaviconResult>) escopado ao módulo pra não refetchar entre re-renders

### Task 3 — `<IconRenderer>` + integração no `<Slice>`

**Arquivos:** `src/donut/IconRenderer.tsx`, `src/donut/Slice.tsx`, `src/donut/Donut.tsx`

- [ ] **3.1** — `<IconRenderer icon={string | null} fallback={string}>`:
  - `lucide:Name` → `import * as Lucide from "lucide-react"; const Icon = Lucide[name]; <Icon size={20}/>`. Se não existe nome, render fallback.
  - URL/data URL → `<image href={icon} ...>` no SVG.
  - Resto → `<text>{icon ?? fallback}</text>`.
- [ ] **3.2** — `<Slice>` aceita `iconNode?: ReactNode` (renderizado no centro da fatia). Mantém compatibilidade.
- [ ] **3.3** — Donut decide:
  - `tab.icon` definido → `<IconRenderer icon={tab.icon} fallback={initial(tab.name)}/>`
  - `tab.icon == null` E `tab.items[0]?.url` existe → `useFavicon(firstUrl)` → se `src`, renderiza `<image>`; senão fallback à inicial.

### Task 4 — `<SliceContextMenu>` + integração

**Arquivos:** `src/donut/SliceContextMenu.tsx`, `src/donut/Donut.tsx`, testes

- [ ] **4.1** — `<SliceContextMenu position={{x,y}} items={[...]} onClose>` — menu absoluto, fecha em outside-click + ESC.
- [ ] **4.2** — Donut: `onContextMenu` na fatia (`e.preventDefault()`) → abre menu na posição do cursor. Itens:
  - "Abrir tudo" → `ipc.openTab(tab.id, profileId)` + `hideDonut()` (mesmo do click).
  - "Editar" → `ipc.openSettings("edit-tab:" + tab.id)` + `hideDonut()`.
  - "Excluir" → confirma (reuso do hover-hold confirm? não — modal/inline simples) → `ipc.deleteTab(tab.id, profileId)`.
- [ ] **4.3** — Suprimir hover-hold enquanto menu aberto (state flag).
- [ ] **4.4** — Locale keys.

### Task 5 — `<IconPicker>` no TabEditor + ProfileEditor

**Arquivos:** `src/settings/IconPicker.tsx`, `src/settings/TabEditor.tsx`, `src/settings/ProfileEditor.tsx`, testes

- [ ] **5.1** — `<IconPicker open onClose onSelect>`:
  - Tabs internas: "Emoji" (input texto manual + presets ☕📚💼🎮 etc.) | "Lucide" (search + grid).
  - Lucide: importar a lista de nomes (`import { icons } from "lucide-react/dynamic"` ou similar; senão lista hardcoded curada de ~80 ícones úteis).
  - Search: filtra por substring case-insensitive.
  - Click ícone Lucide → `onSelect("lucide:" + name)`. Click emoji → `onSelect(emoji)`.
- [ ] **5.2** — TabEditor: botão "🎨 Escolher" ao lado do input ícone abre o picker. Selecionar atualiza estado.
- [ ] **5.3** — ProfileEditor: idem.
- [ ] **5.4** — Validação ajustada: aceitar `lucide:.*` mesmo que tenha letras (a checagem `stripLetters` só vale pra modo manual). Solução: aplicar `stripLetters` apenas se string não começa com `lucide:`.

### Task 6 — Pipeline + CLAUDE.md + PR

- `cargo test/clippy/fmt` + `npm test` + `tsc`.
- CLAUDE.md atualizado: prefixo `lucide:`, módulo favicon, comando `fetch_favicon`, `<SliceContextMenu>`, `<IconPicker>`.
- Commit + push + PR.

---

## Resumo dos commits previstos

1. `feat(favicon): fetch + sha256 cache module with HTML link parsing`
2. `feat(commands): fetch_favicon command + ipc wrapper + useFavicon hook`
3. `feat(donut): IconRenderer supports lucide: + URL + emoji`
4. `feat(donut): right-click context menu (open / edit / delete)`
5. `feat(settings): IconPicker with emoji + Lucide tabs`
6. `docs(claude): mark Plano 9 (context menu + favicons + lucide) complete`

---

## Critérios de aceitação

- [ ] Right-click numa fatia abre menu com 3 ações; ESC e click-outside fecham.
- [ ] Aba sem `icon` mostra favicon do primeiro URL na fatia (após primeiro fetch).
- [ ] Favicon fica cacheado em disco; segundo boot não refaz GET.
- [ ] Picker permite escolher ícone Lucide; aba renderiza com `<LucideIcon>` no donut.
- [ ] Ícone manual emoji ainda funciona (sem regressão).
- [ ] Falha de fetch (offline) não quebra render — fallback à inicial.
- [ ] CI verde.

---

## Notas

- **Por que `lucide:Name` e não schema novo**: zero migração. Frontend interpreta string. Se um dia quisermos PNG inline, prefixo `data:` já é nativo. Convenção `kind:value` permite extensão sem dor.
- **Por que cachear favicon em disco e não inline base64**: config.json fica leve; webview consegue ler arquivo via `convertFileSrc` (precisa permission `fs:allow-read-file` em `capabilities/`? checar — Tauri 2 expõe asset protocol nativo).
- **TTL 7d**: balanço entre frescor e tráfego. Forçar refresh manual fica pra futuro (botão "atualizar" no editor).
- **Google s2 fallback**: viola privacidade levemente (Google sabe quais hosts usuário acessa). Aceitável como fallback; documentar. Opt-out futuro: setting "permitir favicon de terceiros".
- **Lucide bundle size**: `lucide-react` é tree-shakeable mas se importar `*` puxa tudo. Estratégia: importar dinâmico via `React.lazy(() => import("lucide-react").then(m => ({ default: m[name] })))` OU manter lista curada de ~80 ícones com import explícito.
- **Right-click no Tauri/webview**: `oncontextmenu` dispara normal; o menu nativo do webview pode aparecer junto. Bloquear via `e.preventDefault()` E garantir `app.windows.contextMenu = false` na config se existir (verificar Tauri 2).
- **Macro-fase**: este plano fecha a "Fase 1.5" do roadmap (polimento UX); Fase 2 (suporte a `kind: file/app/script`) entra depois.
