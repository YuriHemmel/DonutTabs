# DonutTabs — Plano 13: Busca rápida por aba

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: Use `superpowers:subagent-driven-development` (recomendada) ou `superpowers:executing-plans` para implementar este plano tarefa-a-tarefa.

**Meta:** Permitir que o usuário encontre uma aba por nome **sem precisar paginar** ou hover-browse. Caso de uso: 20+ abas espalhadas por 3-4 páginas; o usuário sabe o nome da aba mas não onde ela está. Pressionar `/` (ou `Ctrl+K`) com o donut aberto abre um overlay de busca; digitar filtra; ↑/↓ navega; Enter abre; Esc volta pro donut.

**Mecânica:** Componente React `<TabSearchOverlay>` posicionado por cima do SVG do donut. Filtragem por substring case-insensitive em `tab.name` e `tab.icon` (apenas o ícone-emoji literal, não tokens `lucide:` que são código). Escopo = **perfil ativo** apenas — cross-profile fica fora dessa slice (precisaria de switch de perfil no select e UI de disambiguação que infla escopo). Search consome o input de teclado enquanto está aberto: hover-hold, paginação por wheel e gestos do donut ficam suprimidos pra evitar bagunça.

**Trigger configurável:**
- Default: `CommandOrControl+F` (familiar de browsers/editores, mão esquerda).
- Atalho **dentro** da janela do donut — não é um global shortcut (não vai pro `tauri-plugin-global-shortcut`). É detectado via `keydown` listener no webview e comparado contra a string de combo armazenada em `Interaction.searchShortcut`.
- Configurável em `<ShortcutSection>` (já é a seção de atalhos), reusando `<ShortcutRecorder>`. Valida combo via `shortcut::validate_combo` (mesma regra do atalho global de perfil).
- `Ctrl+Q` evitado por ser "quit" em Linux/macOS — o webview não captura, mas chuta o usuário pra fora se o atalho global do SO interceptar antes.

**Fora desta slice:**
- Fuzzy matching (Fuse.js etc.) — substring é suficiente pra primeiro corte; fuzzy adiciona dep e ranking complexo
- Cross-profile search — fora; segura no perfil ativo
- Search por URL/path do item — fora; só nome+ícone do tab
- Histórico de buscas recentes — fora
- Highlight do match no resultado (substring em bold) — fora; complica render por pouco ganho
- Atalho global pra abrir donut **direto em modo busca** — fora; user abre donut normal e pressiona `/`

---

## Pré-requisitos (estado atual pós-merge do Plano 12)

- [src-tauri/src/config/schema.rs](../../src-tauri/src/config/schema.rs): `Interaction { spawn_position, selection_mode, hover_hold_ms }`. Vai ganhar `search_shortcut: String`.
- [src-tauri/src/shortcut/mod.rs:64](../../src-tauri/src/shortcut/mod.rs#L64): `validate_combo` parseia string Tauri sem registrar nada — pode ser reusado pra validar o combo de busca.
- [src/donut/Donut.tsx](../../src/donut/Donut.tsx): hover-hold + paginação + context menu já consomem keydown via listeners com `capture: true`. Novo handler de busca precisa coexistir sem brigar.
- [src/donut/Donut.tsx:182](../../src/donut/Donut.tsx#L182): retorna fragment com `<svg>` + overlay de context menu. Mesmo padrão pode acomodar o overlay de search.
- [src/entry/donut.tsx:26](../../src/entry/donut.tsx#L26): listener de Escape no entry — Esc fecha donut. Search precisa **interceptar** Esc antes desse handler quando o overlay estiver aberto (capture + stopPropagation).
- [src/settings/ShortcutSection.tsx](../../src/settings/ShortcutSection.tsx): hospeda o `<ShortcutRecorder>` do atalho global do perfil. Vai ganhar uma segunda subseção pro atalho de busca (escopo global no config, não per-profile).
- [src/settings/buildCombo.ts](../../src/settings/buildCombo.ts): helper que monta string Tauri a partir de `KeyboardEvent` (usado pelo `<ShortcutRecorder>`). **Não** existe a inversa — vamos adicionar `matchesCombo(e, combo)` em `src/donut/matchesCombo.ts`.
- `tab.name`, `tab.icon`: ambos `Option<String>`. Validation já garante que **um deles** existe (`tab_missing_name_and_icon`).

---

## Estrutura de arquivos

### Novos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/donut/searchTabs.ts` | Função pura `searchTabs(tabs, query) -> Tab[]` — substring case-insensitive em `name` + `icon` (ignora `lucide:` tokens). Mantém ordem original quando `query === ""` para não embaralhar a navegação. |
| `src/donut/__tests__/searchTabs.test.ts` | Cobre: query vazia retorna tudo na ordem; substring match em name; substring em icon (emoji literal); ignora prefixo `lucide:`; case-insensitive; sem matches retorna `[]`. |
| `src/donut/matchesCombo.ts` | `matchesCombo(e: KeyboardEvent, combo: string): boolean`. Parseia o formato Tauri (`"CommandOrControl+Shift+F"`) em `{ ctrl, alt, shift, meta, key }` e compara contra o evento. `CommandOrControl` casa `ctrl` em Win/Linux e `meta` (Cmd) em macOS — detecção via `navigator.platform`. |
| `src/donut/__tests__/matchesCombo.test.ts` | Cobre: combo simples (`Ctrl+F`); modificador absent no combo deve ser absent no evento (Ctrl+F não casa Shift+Ctrl+F); case-insensitive na key (`F` casa `f`); `CommandOrControl` casa Ctrl no não-mac e Meta no mac; combo malformado retorna `false`. |
| `src/donut/TabSearchOverlay.tsx` | Componente React (HTML, não SVG): overlay centralizado com input + lista de resultados. Props: `tabs`, `onSelect(tabId)`, `onClose`. Estado interno: `query`, `selectedIndex`. Keyboard: ↑/↓ move seleção, Enter dispara `onSelect`, Esc dispara `onClose`. Auto-focus do input ao montar. |
| `src/donut/__tests__/TabSearchOverlay.test.tsx` | Cobre: render mostra input + todas as abas; digitar filtra; ↑/↓ atualiza highlight; Enter dispara onSelect com tabId correto; Esc dispara onClose; Enter sem resultados não dispara onSelect; click numa row dispara onSelect. |

### Modificados

| Arquivo | Mudança |
|---|---|
| `src-tauri/src/config/schema.rs` | `Interaction` ganha `search_shortcut: String`. Default em `Config::default()` = `"CommandOrControl+F"`. |
| `src-tauri/src/config/validate.rs` | Após validar `hover_hold_ms`, valida o combo de busca: `shortcut::validate_combo(&cfg.interaction.search_shortcut)?`. Reusa `shortcut_parse_failed`/`profile_shortcut_empty` codes via guard de `trim().is_empty()` antes do parse. |
| `src-tauri/src/commands.rs` | Novo comando `set_search_shortcut(combo: String)` que valida + persiste + emite `CONFIG_CHANGED_EVENT`. Sem reconciliação de global shortcut (atalho é window-level). |
| `src-tauri/src/lib.rs` | Registra `commands::set_search_shortcut`. |
| `src/core/ipc.ts` | `setSearchShortcut(combo: string)`. |
| `src/settings/ShortcutSection.tsx` | Adiciona segunda subseção "Atalho de busca" com `<ShortcutRecorder>` espelhando o estilo do atalho global. Recebe novos props `searchShortcut: string`, `onCaptureSearchShortcut: (combo) => Promise<void>`. |
| `src/settings/SettingsApp.tsx` | Passa `searchShortcut` + handler que chama `setSearchShortcut` do `useConfig`. |
| `src/settings/useConfig.tsx` | Helper `setSearchShortcut(combo)` que invoca o comando. |
| `src/donut/Donut.tsx` | Recebe novo prop `searchShortcut: string`. Estado `searchOpen: boolean`. Listener de keydown usa `matchesCombo(e, searchShortcut)` para abrir. Quando `searchOpen`, hover-hold é trancado e wheel pagination é suprimida. Renderiza `<TabSearchOverlay>` no fragment alongside context menu. |
| `src/entry/donut.tsx` | Passa `config.interaction.searchShortcut` ao `<Donut>`. |
| `src/locales/{pt-BR,en}.json` | `donut.search.{placeholder, empty, shortcutHint}`. `settings.shortcut.{searchSectionTitle, searchHint}`. `errors.config.{searchShortcutEmpty}` (se distinto de profileShortcutEmpty). |
| `CLAUDE.md` | Documenta o overlay + helpers + comando + UI nova, atualiza "Looking ahead" para Plano 14 (`kind: "app"` + `kind: "script"`). |

---

## Tarefas

### Task 0 — Schema + validation: `Interaction.search_shortcut` (Rust, TDD)

**Arquivos:** `src-tauri/src/config/schema.rs`, `src-tauri/src/config/validate.rs`

- [ ] **0.1** — `Interaction` ganha `search_shortcut: String` com `#[serde(default = "default_search_shortcut")]` apontando pra `"CommandOrControl+F"`. Configs antigas (Plano 12 sem o campo) deserializam usando o default.
- [ ] **0.2** — `Config::default()` setta `interaction.search_shortcut = "CommandOrControl+F"`.
- [ ] **0.3** — `validate.rs` adiciona checagem após `hover_hold_ms_zero`: trim não-vazio + `shortcut::validate_combo(&cfg.interaction.search_shortcut)?` (reusa o erro `shortcut_parse_failed` quando malformado). Empty/whitespace dispara `search_shortcut_empty`.
- [ ] **0.4** — Tests:
  - Default config valida.
  - Config com `search_shortcut: ""` falha com `search_shortcut_empty`.
  - Config com `search_shortcut: "garbage"` falha com `shortcut_parse_failed`.
  - Config legacy (sem o campo no JSON) deserializa com default.
- [ ] **0.5** — `cargo test --lib config::schema` regenera `src/core/types/Interaction.ts`. Confirma o novo campo.

### Task 1 — Comando `set_search_shortcut` + IPC (Rust + TS)

**Arquivos:** `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs`, `src/core/ipc.ts`

- [ ] **1.1** — Comando:
  ```rust
  #[tauri::command]
  pub fn set_search_shortcut<R: tauri::Runtime>(
      app: tauri::AppHandle<R>,
      state: tauri::State<'_, AppState>,
      combo: String,
  ) -> Result<Config, AppError> {
      crate::shortcut::validate_combo(&combo)?;
      let snapshot = {
          let mut cfg = state.config.write().unwrap();
          let old = cfg.interaction.search_shortcut.clone();
          cfg.interaction.search_shortcut = combo;
          if let Err(e) = save_atomic(&state.config_path, &cfg) {
              cfg.interaction.search_shortcut = old;
              return Err(e);
          }
          cfg.clone()
      };
      let _ = app.emit(CONFIG_CHANGED_EVENT, &snapshot);
      Ok(snapshot)
  }
  ```
  Sem reconciliação de global shortcut — atalho é window-level e o `<Donut>` lê do config via prop a cada render.
- [ ] **1.2** — Registra no `invoke_handler`.
- [ ] **1.3** — `ipc.setSearchShortcut(combo)`.

### Task 2 — `searchTabs` helper puro (TDD)

**Arquivos:** `src/donut/searchTabs.ts`, `src/donut/__tests__/searchTabs.test.ts`

- [ ] **1.1** — Implementação:
  ```ts
  export function searchTabs(tabs: Tab[], query: string): Tab[] {
    const q = query.trim().toLowerCase();
    if (!q) return tabs;
    return tabs.filter((tab) => {
      const name = (tab.name ?? "").toLowerCase();
      // Skip lucide: tokens — they're not user-facing labels.
      const icon = tab.icon && !tab.icon.startsWith("lucide:")
        ? tab.icon.toLowerCase()
        : "";
      return name.includes(q) || icon.includes(q);
    });
  }
  ```
- [ ] **1.2** — Tests:
  - Query vazia retorna a lista intacta (mesma referência ou conteúdo igual; preserva ordem).
  - Substring case-insensitive em `name`: `"work"` casa "Trabalho — Work" e "WORK".
  - Substring em ícone emoji literal: `"☕"` casa tab com `icon: "☕"`.
  - Ignora `lucide:Coffee` quando query é "coffee" (é token, não label).
  - Sem matches retorna array vazio.
  - Tab com `name: null` e ícone que matcha continua sendo retornada.

### Task 3 — `matchesCombo` helper puro (TDD)

**Arquivos:** `src/donut/matchesCombo.ts`, `src/donut/__tests__/matchesCombo.test.ts`

- [ ] **3.1** — Implementação:
  ```ts
  interface ParsedCombo {
    ctrl: boolean;
    shift: boolean;
    alt: boolean;
    meta: boolean;
    /** Already lowercased, e.g. "f". */
    key: string;
  }

  function parseCombo(combo: string, isMac: boolean): ParsedCombo | null {
    const tokens = combo.split("+").map((t) => t.trim()).filter(Boolean);
    if (tokens.length === 0) return null;
    const out: ParsedCombo = { ctrl: false, shift: false, alt: false, meta: false, key: "" };
    for (const tok of tokens.slice(0, -1)) {
      const norm = tok.toLowerCase();
      if (norm === "commandorcontrol") {
        if (isMac) out.meta = true;
        else out.ctrl = true;
      } else if (norm === "control" || norm === "ctrl") out.ctrl = true;
      else if (norm === "shift") out.shift = true;
      else if (norm === "alt" || norm === "option") out.alt = true;
      else if (norm === "command" || norm === "cmd" || norm === "super" || norm === "meta") out.meta = true;
      else return null; // unknown modifier
    }
    out.key = tokens[tokens.length - 1].toLowerCase();
    return out;
  }

  export function matchesCombo(e: KeyboardEvent, combo: string): boolean {
    const isMac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
    const parsed = parseCombo(combo, isMac);
    if (!parsed) return false;
    return (
      e.ctrlKey === parsed.ctrl &&
      e.shiftKey === parsed.shift &&
      e.altKey === parsed.alt &&
      e.metaKey === parsed.meta &&
      e.key.toLowerCase() === parsed.key
    );
  }
  ```
- [ ] **3.2** — Tests (estes devem ser puros, sem JSDOM extra):
  - `Ctrl+F` casa `{ key: "f", ctrlKey: true }` mas não casa quando `shiftKey: true` (rigor exato).
  - `CommandOrControl+F` casa Ctrl em não-mac e Meta em mac (mock `navigator.platform`).
  - `Ctrl+Shift+F` casa só com os dois modificadores juntos.
  - Combo malformado (`"foo"`, `""`) retorna `false` sem lançar.
  - Case-insensitive na key (`F` vs `f`).
  - Modificador desconhecido (`"Hyper+F"`) retorna `false`.

### Task 4 — `<TabSearchOverlay>` componente

**Arquivos:** `src/donut/TabSearchOverlay.tsx`, `src/donut/__tests__/TabSearchOverlay.test.tsx`

- [ ] **2.1** — Props:
  ```ts
  export interface TabSearchOverlayProps {
    tabs: Tab[];
    onSelect: (tabId: string) => void;
    onClose: () => void;
  }
  ```
- [ ] **2.2** — Estado interno:
  - `query: string` — controlled input
  - `selectedIndex: number` — índice no array filtrado; reset pra 0 quando `query` muda
- [ ] **2.3** — Render: HTML `<div>` com `position: fixed`, centralizado, fundo `var(--panel)` com border. Input no topo (`autoFocus`); abaixo, lista vertical de até ~8 rows (overflow scroll). Cada row mostra ícone + nome (ou `?` quando ambos vazios — não deve acontecer pós-validation, mas defensivo). Row selecionada tem background destacado.
- [ ] **2.4** — Keyboard handler no input ou no container:
  - `ArrowDown`: `selectedIndex = (selectedIndex + 1) % filtered.length` (wraps)
  - `ArrowUp`: `(selectedIndex - 1 + filtered.length) % filtered.length`
  - `Enter`: se `filtered.length > 0`, dispara `onSelect(filtered[selectedIndex].id)`. Se vazio, no-op (não fecha).
  - `Escape`: `onClose()`. **Capture phase** + `stopPropagation` para não atingir o handler de Esc do entry.tsx que esconde o donut.
- [ ] **2.5** — Click numa row dispara `onSelect`. Hover atualiza `selectedIndex` (UX padrão de palette).
- [ ] **2.6** — Tests: 7 cenários listados em "Estrutura de arquivos".

### Task 5 — Integração no `<Donut>`

**Arquivos:** `src/donut/Donut.tsx`

- [ ] **5.1** — Donut ganha prop `searchShortcut: string`. Novo state `searchOpen: boolean`. Listener de keydown:
  ```ts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode !== "tabs" || contextMenu || searchOpen) return;
      if (matchesCombo(e, searchShortcut)) {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [mode, contextMenu, searchOpen, searchShortcut]);
  ```
- [ ] **5.2** — Suprimir hover-hold quando `searchOpen` (mesmo padrão do context menu — passar `null` em `hoveredSlice`).
- [ ] **5.3** — Wheel handler: `if (searchOpen) return;` antes de mudar página.
- [ ] **5.4** — Render: depois do context menu, renderiza `<TabSearchOverlay>` quando `searchOpen`. `onClose` faz `setSearchOpen(false)`. `onSelect` faz `onSelect(tabId)` + `setSearchOpen(false)`.
- [ ] **5.5** — `entry/donut.tsx` passa `config.interaction.searchShortcut` ao `<Donut>`.

### Task 6 — `<ShortcutSection>` UI pra editar `searchShortcut`

**Arquivos:** `src/settings/ShortcutSection.tsx`, `src/settings/SettingsApp.tsx`, `src/settings/useConfig.tsx`, testes

- [ ] **6.1** — `<ShortcutSection>` ganha props `searchShortcut: string` + `onCaptureSearchShortcut: (combo) => Promise<void>`. Render: divider entre o atalho global existente e a nova subseção; segundo `<ShortcutRecorder>` reusando o mesmo componente.
- [ ] **6.2** — `useConfig`: helper `setSearchShortcut(combo)` que invoca `ipc.setSearchShortcut`.
- [ ] **6.3** — `SettingsApp` passa `config.interaction.searchShortcut` + handler.
- [ ] **6.4** — Tests: `<ShortcutSection>` renderiza ambos os recorders; capturar combo no segundo dispara o callback de search; valor inicial bate.

### Task 7 — Locales + CLAUDE.md + pipeline + commits

- [ ] **4.1** — PT-BR + EN: `donut.search.{placeholder, empty, shortcutHint}`. Exemplo: shortcutHint = "↑↓ navegar · Enter abrir · Esc fechar".
- [ ] **4.2** — `cargo fmt --check`, `cargo clippy --lib -- -D warnings`, `cargo test --lib`, `npx tsc --noEmit`, `npx vitest run` — todos verdes.
- [ ] **4.3** — `CLAUDE.md`:
  - Frontend section: documenta `searchTabs` + `<TabSearchOverlay>` + atalhos.
  - "Looking ahead": aponta Plano 14 (`kind: "app"` + `kind: "script"` com `tauri-plugin-shell` e modal de confirmação de segurança).
- [ ] **4.4** — Commits granulares (1 por tarefa lógica). Push + PR.

---

## Resumo dos commits previstos

1. `feat(schema): Interaction gains search_shortcut + validation`
2. `feat(commands): set_search_shortcut command + ipc wrapper`
3. `feat(donut): pure searchTabs and matchesCombo helpers`
4. `feat(donut): TabSearchOverlay component with keyboard nav`
5. `feat(donut): integrate search overlay with configurable shortcut`
6. `feat(settings): search-shortcut recorder in ShortcutSection`
7. `docs(claude): mark Plano 13 (quick search) complete`

(7 commits — locale keys piggy-back em C4/C5/C6 conforme consumidas. Schema + command + IPC ficam separados pra manter o histórico testável por camada.)

---

## Critérios de aceitação

- [ ] Pressionar `Ctrl+F` (default) com o donut aberto abre o overlay de busca centralizado, com input focado.
- [ ] Configurações > Atalho mostra duas subseções: o atalho global do perfil (existente) e o novo "Atalho de busca", ambos editáveis via `<ShortcutRecorder>`.
- [ ] Mudar o atalho de busca em Settings → o donut passa a abrir o overlay no novo combo após o `config-changed` (sem reinício).
- [ ] Configs antigas (sem `searchShortcut` no JSON) carregam com default `CommandOrControl+F`.
- [ ] Digitar filtra a lista de abas em tempo real (case-insensitive substring em name + icon emoji).
- [ ] ↑/↓ navegam e fazem wrap nos limites; row selecionada tem destaque visual.
- [ ] Enter dispara `onSelect` da aba destacada → mesmo fluxo do click numa fatia (`ipc.openTab` + `hideDonut`).
- [ ] Esc fecha apenas o overlay, **não** fecha o donut inteiro (intercepta capture + stopPropagation).
- [ ] Click numa row dispara `onSelect`.
- [ ] Sem resultados, render mostra mensagem "Nenhuma aba encontrada"; Enter é no-op.
- [ ] Enquanto o overlay está aberto, hover-hold e wheel pagination ficam suprimidos (não disparam por baixo do overlay).
- [ ] Trigger não dispara quando o donut está em modo perfil ou com context menu aberto.
- [ ] Lucide tokens (`lucide:Coffee`) **não** são usados como label de busca (token interno, não user-facing).
- [ ] CI verde (5 jobs).

---

## Notas

- **Por que `Ctrl+F` default**: mão esquerda alcança sem virar; familiar de browsers/editores; dentro do webview undecorated do donut não ativa nenhum find nativo. `Ctrl+Q` evitado (quit em alguns SOs); `/` evitado (mão direita / requer shift em alguns layouts).
- **Por que window-level (não global) shortcut**: o atalho só faz sentido com o donut aberto. Global shortcut tem custo (registra com SO, conflita) e visibilidade desnecessária. Detecção via `keydown` no webview é suficiente.
- **Por que reusar formato Tauri (`CommandOrControl+F`)**: o `<ShortcutRecorder>` já produz esse formato, e `validate_combo` já valida. Outra alternativa seria um formato JS-nativo (`{ ctrl: true, key: "f" }`), mas duplicaria UI/parser e quebraria o pattern existente.
- **Por que persiste em `Interaction` (não `Profile`)**: o atalho de busca é UX global, não faz sentido por perfil — o user não muda de "modo de busca" entre Trabalho e Pessoal. `Interaction` é o lugar certo (mesmo escopo de `selectionMode`).
- **Por que substring (não fuzzy)**: dep mínima, comportamento previsível. Fuzzy (Fuse.js, Fzf) adiciona ranking por scoring que pode embaralhar resultados de forma confusa pra listas pequenas (≤30 abas). Pra listas grandes (50+) faria sentido — issue futura.
- **Por que escopo = perfil ativo**: cross-profile precisaria switch de perfil no select (`set_active_profile` + reload de tabs) e UI de disambiguação ("Trabalho > AbaX"). Slice de hoje é UX puro frontend; cross-profile vira slice própria com IPC novo.
- **Por que ignorar `lucide:` tokens no match**: token é detalhe de implementação. Se o user tem `icon: "lucide:Coffee"` e busca "coffee", o match seria coincidência confusa. Bloqueando o token, garantimos que só a parte user-facing (emoji literal ou nome) participa.
- **Por que `selectedIndex` reseta pra 0 a cada mudança de query**: comportamento esperado em command palettes — o user filtra mais, e quer pegar o primeiro resultado novo, não algo do filtro anterior.
- **Por que `↑/↓` wraps**: lista costuma ser curta; wrap evita o user "bater na parede" e ter que voltar manualmente. Common em palettes (VS Code, Slack).
- **Por que não auto-fechar overlay no `onSelect`**: deixar o `onSelect` (no Donut) decidir — ele já chama `setSearchOpen(false)` antes de invocar o callback do entry. Mantém o overlay puro (não conhece IPC nem state global).
- **Acessibilidade**: input tem `aria-label`. Lista tem `role="listbox"`, rows têm `role="option"` + `aria-selected`. Pra esta slice, mantemos esse mínimo (sem screen reader live-region — escopo de slice de a11y).
