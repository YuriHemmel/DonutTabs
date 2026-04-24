# DonutTabs — Plano 5: Gestos do donut (paginação + hover-hold)

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: Use `superpowers:subagent-driven-development` (recomendada) ou `superpowers:executing-plans` para implementar este plano tarefa-a-tarefa. Passos usam checkbox (`- [ ]`) para rastreamento.

**Meta:** Fechar os gestos previstos no MVP (Fase 1 do `Plano.md`) que ficaram pendentes:

1. **Paginação** — abas distribuídas em páginas de `pagination.itemsPerPage` (4–8, padrão 6). Roda do mouse muda a página corrente respeitando `pagination.wheelDirection`. Indicadores (pontos clicáveis) embaixo do donut. A fatia "+" continua sempre na **última posição da última página**, ganhando uma página exclusiva quando todas as outras estão lotadas (`Plano.md` 5.6).
2. **Hover-hold para editar/excluir** — segurar o cursor por `interaction.hoverHoldMs` (padrão 800ms) sobre uma fatia anima um preenchimento radial; ao completar, a fatia entra em "modo ação": metade esquerda mostra ✏️ (abre o `<TabEditor>` da aba via novo intent `edit-tab:<id>`), metade direita mostra 🗑️ (confirma inline e chama `delete_tab`). ESC volta ao modo normal.

**Arquitetura:** Sem mudanças estruturais nem de schema (`pagination.*` e `interaction.hoverHoldMs` já existem desde o Plano 1). O donut fica composicional: hooks puros (`paginate`, `useHoverHold`) + componentes presentational (`<PaginationDots>`, `<HoverHoldOverlay>`). A integração com a Settings reusa a infra de intents (Plano 3) — só estende o tipo `SettingsIntent` com `edit-tab:<id>` e ajusta o `applyIntent` no `SettingsApp`.

**Stack adicional:** nenhuma.

**Fora desta slice:**
- **Perfis** (schema v2 + profile switcher no lado direito do centro) → Plano 6.
- Menu de contexto (clique direito), favicons, drag-and-drop, autostart → Plano 7.
- Modos de seleção `clickOnly` / `hoverRelease` (já no schema mas não-implementados) — pode entrar nesta slice OU ficar para depois; **escolha:** ficam fora aqui pra manter o foco em paginação + hover-hold; o donut continua em `clickOrRelease` na prática.

---

## Pré-requisitos (estado atual pós-merge do Plano 4)

- [src/donut/Donut.tsx](../../src/donut/Donut.tsx:1): renderiza N+1 fatias, todas em uma "página". `useSliceHighlight` recebe `slices: total`. A engrenagem do `<CenterCircle>` chama `onOpenSettings()`; "+" chama `onOpenSettings("new-tab")`.
- [src/donut/geometry.ts](../../src/donut/geometry.ts:1): `sliceAngleRange(index, n)` e `arcPath` (com caso especial 360°). Reutilizáveis sem mudança.
- [src/donut/useSliceHighlight.ts](../../src/donut/useSliceHighlight.ts:1): hover detection puro por coordenada → índice da fatia.
- [src/core/ipc.ts](../../src/core/ipc.ts:1): `SettingsIntent = "new-tab"`. Tipo precisa virar `"new-tab" | \`edit-tab:${string}\``.
- [src/settings/SettingsApp.tsx](../../src/settings/SettingsApp.tsx:1): `applyIntent` hoje só reconhece `"new-tab"`. Precisa parsear o prefixo `edit-tab:` e setar `{ mode: "edit", tabId }`.
- [src-tauri/src/commands.rs](../../src-tauri/src/commands.rs:1): `open_settings(intent: Option<String>)` é genérico — aceita qualquer string. **Sem mudança no Rust.**
- [src-tauri/src/config/schema.rs](../../src-tauri/src/config/schema.rs:1): `Pagination { items_per_page, wheel_direction }` e `Interaction { hover_hold_ms, ... }` existem. **Sem mudança no Rust.**

---

## Estrutura de arquivos

### Novos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/donut/pagination.ts` | `paginate(tabs, itemsPerPage)` — função pura que retorna `Page[]`, posicionando "+" na última fatia da última página |
| `src/donut/PaginationDots.tsx` | Linha de pontos clicáveis na parte de baixo do donut |
| `src/donut/useHoverHold.ts` | Máquina de estados (`idle` / `holding` / `actionable` / `confirming`) com timer baseado em `hoverHoldMs` |
| `src/donut/HoverHoldOverlay.tsx` | Renderiza o preenchimento radial animado (durante `holding`) + a divisão ✏️/🗑️ (em `actionable`) + o confirm "Sim/Não" (em `confirming`) |
| `src/donut/__tests__/pagination.test.ts` | Tabela exaustiva: 0 abas, < perPage, == perPage, > perPage, múltiplas páginas |
| `src/donut/__tests__/useHoverHold.test.tsx` | Avanço de timers via `vi.useFakeTimers()`; transições; limpeza |
| `src/donut/__tests__/PaginationDots.test.tsx` | Render correto de N pontos, ativo destacado, click em ponto chama onChange |

### Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `src/donut/Donut.tsx` | Integração: estado de página corrente + handler de wheel + render da página atual + dots + overlay de hover-hold + emissão de `edit-tab:<id>` |
| `src/core/ipc.ts` | `SettingsIntent` vira união discriminada com template literal |
| `src/settings/SettingsApp.tsx` | `applyIntent` parseia `edit-tab:<id>`, valida que a aba existe, e seleciona `{ mode: "edit", tabId }` |
| `src/locales/{pt-BR,en}.json` | Novas chaves `donut.hoverHold.{edit,delete,confirmDelete,yes,no}` |
| `src/settings/__tests__/SettingsApp.test.tsx` | Caso novo para intent `edit-tab:<id>` |
| `src/donut/__tests__/Donut.test.tsx` | Testes para paginação visível, navegação por wheel, dot click |
| `CLAUDE.md` | Lista atualizada — Plano 5 fechado; próximo é Plano 6 (perfis) |

---

## Tarefas

### Task 1: `paginate()` puro + testes

**Arquivos:** `src/donut/pagination.ts`, `src/donut/__tests__/pagination.test.ts`

A função decide a distribuição final de páginas seguindo a regra "+ é sempre a última fatia da última página":

- 0 abas → 1 página `[{ tabs: [], hasPlus: true }]`
- N abas com N < `perPage` → 1 página `[{ tabs, hasPlus: true }]`
- N abas com N == `perPage` → 2 páginas: `[{ tabs[0..N], hasPlus: false }, { tabs: [], hasPlus: true }]`
- N abas com `perPage < N < 2*perPage` → 2 páginas: `[{ tabs[0..perPage], hasPlus: false }, { tabs[perPage..N], hasPlus: true }]`

- [ ] **Step 1.1 — Escrever testes (FALHAM)**

```ts
import { describe, it, expect } from "vitest";
import { paginate } from "../pagination";
import type { Tab } from "../../core/types/Tab";

const tab = (id: string): Tab => ({
  id, name: id, icon: null, order: 0, openMode: "reuseOrNewWindow", items: [],
});

describe("paginate", () => {
  it("returns a single page with only '+' when there are no tabs", () => {
    expect(paginate([], 6)).toEqual([{ tabs: [], hasPlus: true }]);
  });

  it("fits all tabs and '+' on one page when count < itemsPerPage", () => {
    const tabs = [tab("a"), tab("b"), tab("c")];
    expect(paginate(tabs, 6)).toEqual([{ tabs, hasPlus: true }]);
  });

  it("pushes '+' to its own page when count == itemsPerPage", () => {
    const tabs = [tab("a"), tab("b"), tab("c"), tab("d"), tab("e"), tab("f")];
    const pages = paginate(tabs, 6);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toEqual({ tabs, hasPlus: false });
    expect(pages[1]).toEqual({ tabs: [], hasPlus: true });
  });

  it("splits tabs across pages when count > itemsPerPage and '+' lands on the last page", () => {
    const tabs = [tab("a"), tab("b"), tab("c"), tab("d"), tab("e"), tab("f"), tab("g")];
    const pages = paginate(tabs, 6);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toEqual({ tabs: tabs.slice(0, 6), hasPlus: false });
    expect(pages[1]).toEqual({ tabs: tabs.slice(6), hasPlus: true });
  });

  it("supports custom itemsPerPage = 4", () => {
    const tabs = Array.from({ length: 5 }, (_, i) => tab(`t${i}`));
    const pages = paginate(tabs, 4);
    expect(pages).toHaveLength(2);
    expect(pages[0].tabs).toHaveLength(4);
    expect(pages[0].hasPlus).toBe(false);
    expect(pages[1].tabs).toHaveLength(1);
    expect(pages[1].hasPlus).toBe(true);
  });

  it("creates a third page when 2*perPage tabs are reached", () => {
    const tabs = Array.from({ length: 12 }, (_, i) => tab(`t${i}`));
    const pages = paginate(tabs, 6);
    expect(pages).toHaveLength(3);
    expect(pages[2]).toEqual({ tabs: [], hasPlus: true });
  });
});
```

- [ ] **Step 1.2 — Implementar**

```ts
import type { Tab } from "../core/types/Tab";

export interface Page {
  tabs: Tab[];
  hasPlus: boolean;
}

export function paginate(tabs: Tab[], itemsPerPage: number): Page[] {
  const pages: Page[] = [];
  if (tabs.length === 0) return [{ tabs: [], hasPlus: true }];

  let i = 0;
  while (i < tabs.length) {
    const remaining = tabs.length - i;
    if (remaining < itemsPerPage) {
      // last chunk fits with room for "+"
      pages.push({ tabs: tabs.slice(i, i + remaining), hasPlus: true });
      i += remaining;
    } else if (remaining === itemsPerPage) {
      // last chunk is full; "+" gets its own page
      pages.push({ tabs: tabs.slice(i, i + itemsPerPage), hasPlus: false });
      pages.push({ tabs: [], hasPlus: true });
      i += itemsPerPage;
    } else {
      // not the last chunk: full page of tabs
      pages.push({ tabs: tabs.slice(i, i + itemsPerPage), hasPlus: false });
      i += itemsPerPage;
    }
  }
  return pages;
}
```

- [ ] **Step 1.3 — Rodar tests**

```bash
npm test -- --run src/donut/__tests__/pagination.test.ts
```

- [ ] **Step 1.4 — Commit**

```bash
git add src/donut/pagination.ts src/donut/__tests__/pagination.test.ts
git commit -m "feat(donut): pure paginate() helper following last-page-plus rule"
```

---

### Task 2: `<PaginationDots>` + integração de wheel/click no `<Donut>`

**Arquivos:**
- Criar: `src/donut/PaginationDots.tsx`, `src/donut/__tests__/PaginationDots.test.tsx`
- Modificar: `src/donut/Donut.tsx`, `src/donut/__tests__/Donut.test.tsx`

- [ ] **Step 2.1 — `<PaginationDots>` componente**

```tsx
export interface PaginationDotsProps {
  total: number;
  active: number;
  onChange: (page: number) => void;
}

export const PaginationDots: React.FC<PaginationDotsProps> = ({ total, active, onChange }) => {
  if (total <= 1) return null;
  return (
    <g aria-label="pagination" data-testid="pagination-dots">
      {/* dots distribuídos em linha horizontal abaixo do círculo, ~6px de raio cada,
          ativo ganha fill mais opaco. Cada um é um <circle> clicável. */}
    </g>
  );
};
```

Posicionamento: dentro do `<svg>` do donut, `y = size * 0.92` (logo abaixo do anel externo). `cx` distribuído com gap de 14px.

- [ ] **Step 2.2 — Testes do `<PaginationDots>`**

- Rendera `total` círculos.
- Não renderiza nada quando `total === 1`.
- Click no índice X chama `onChange(X)`.
- Active circle tem `data-active="true"`.

- [ ] **Step 2.3 — Atualizar `<Donut>` para usar `paginate` + estado de página + wheel**

```tsx
const ordered = [...tabs].sort((a, b) => a.order - b.order);
const pages = useMemo(() => paginate(ordered, itemsPerPage), [ordered, itemsPerPage]);
const [page, setPage] = useState(0);

useEffect(() => {
  // se a quantidade de páginas diminuiu, fica na última válida
  if (page >= pages.length) setPage(Math.max(0, pages.length - 1));
}, [pages.length, page]);

const current = pages[page] ?? { tabs: [], hasPlus: true };
const sliceCount = current.tabs.length + (current.hasPlus ? 1 : 0);
const plusIndex = current.hasPlus ? current.tabs.length : -1;

const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
  if (pages.length <= 1) return;
  const direction = wheelDirection === "inverted" ? -1 : 1;
  const delta = e.deltaY > 0 ? 1 : -1;
  setPage((p) => Math.max(0, Math.min(pages.length - 1, p + delta * direction)));
  e.preventDefault();
};
```

`Donut` recebe **duas novas props**: `itemsPerPage: number` e `wheelDirection: "standard" | "inverted"`. O `donut.tsx` entrypoint passa esses valores de `config.pagination`.

- [ ] **Step 2.4 — Atualizar testes do `<Donut>`**

- Com 7 abas e `itemsPerPage=6`: renderiza 7 fatias visíveis (6 tabs na página 1; ao mudar para página 2, renderiza 2 fatias = 1 tab + +).
- Wheel-down avança página; wheel-up volta.
- Click em dot navega.
- Sem mudança de comportamento quando há só 1 página.

- [ ] **Step 2.5 — Atualizar `donut.tsx` entrypoint**

```tsx
<Donut
  tabs={config.tabs}
  size={WINDOW_SIZE}
  itemsPerPage={config.pagination.itemsPerPage}
  wheelDirection={config.pagination.wheelDirection}
  onSelect={handleSelect}
  onOpenSettings={handleOpenSettings}
  onEditTab={(tabId) => handleOpenSettings(`edit-tab:${tabId}` as SettingsIntent)}
  onDeleteTab={(tabId) => ipc.deleteTab(tabId)}
/>
```

(`onEditTab` e `onDeleteTab` ficam como props mesmo que ainda não usados — Task 5 conecta o hover-hold a eles.)

- [ ] **Step 2.6 — Smoke + commit**

```bash
npm test -- --run
git add src/donut/PaginationDots.tsx src/donut/Donut.tsx src/donut/__tests__/ src/entry/donut.tsx
git commit -m "feat(donut): paginate slices and navigate via wheel + indicator dots"
```

---

### Task 3: `useHoverHold` máquina de estados + testes

**Arquivos:** `src/donut/useHoverHold.ts`, `src/donut/__tests__/useHoverHold.test.tsx`

Hook puro que recebe o **índice da fatia atual em hover** (ou `null`) + um **predicado isTabSlice** (apenas tabs, não "+") + `holdMs`. Retorna um estado:

```ts
type HoverHoldPhase =
  | { phase: "idle" }
  | { phase: "holding"; sliceIndex: number; progress: number /* 0..1 */ }
  | { phase: "actionable"; sliceIndex: number }
  | { phase: "confirming"; sliceIndex: number };
```

Transições:
- `idle` + hover entra em fatia tab → `holding(progress=0)`, timer começa
- `holding` + hover sai da fatia OU muda para outra → `idle` (cancela timer)
- `holding` + timer atinge `holdMs` → `actionable`
- `actionable` + hover sai (mouse leave do donut) → permanece `actionable` (gesto preso até clique ou ESC)
- `actionable` + chamada externa `cancel()` → `idle`
- `actionable` + chamada externa `requestDelete()` → `confirming`
- `confirming` + chamada externa `confirmDelete()` → callback de delete chamado, então `idle`
- `confirming` + chamada externa `cancel()` → `actionable`

API exposta:
```ts
function useHoverHold(opts: {
  hoveredSlice: number | null;
  isTabSlice: (i: number) => boolean;
  holdMs: number;
  onComplete: (sliceIndex: number) => void; // chamado ao entrar em "actionable"
}): {
  state: HoverHoldPhase;
  cancel: () => void;
  requestDelete: () => void;
  confirmDelete: () => void;
};
```

- [ ] **Step 3.1 — Escrever testes (FALHAM)**

Cobertura mínima:
- Hover entra em tab → estado vira `holding`, progress avança com `vi.advanceTimersByTime(...)`.
- Cursor sai antes de `holdMs` → volta a `idle`, timer limpo (não fira `actionable`).
- `holdMs` cumpridos → `actionable`, `onComplete(sliceIndex)` chamado uma única vez.
- `actionable` + `cancel()` → `idle`.
- `actionable` + `requestDelete()` → `confirming`.
- `confirming` + `confirmDelete()` → estado volta `idle` (caller propaga delete).
- Hover em fatia "+" (predicado false) → permanece `idle`.

Use `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync(N)` ou `act()` apropriado.

- [ ] **Step 3.2 — Implementar**

Esqueleto:

```ts
export function useHoverHold(opts) {
  const [state, setState] = useState<HoverHoldPhase>({ phase: "idle" });
  const timerRef = useRef<number | null>(null);
  const startedRef = useRef<number>(0);
  const onCompleteRef = useRef(opts.onComplete);
  onCompleteRef.current = opts.onComplete;

  // efeito que reage a mudança de hoveredSlice
  useEffect(() => {
    const i = opts.hoveredSlice;
    if (state.phase === "actionable" || state.phase === "confirming") {
      // já travado em modo ação — hover não importa mais
      return;
    }
    if (i === null || !opts.isTabSlice(i)) {
      // saiu de uma fatia ou está em "+"
      if (timerRef.current !== null) clearInterval(timerRef.current);
      timerRef.current = null;
      if (state.phase !== "idle") setState({ phase: "idle" });
      return;
    }
    if (state.phase === "holding" && state.sliceIndex === i) return; // mesma fatia, deixa rolar
    // nova fatia ou idle → start
    if (timerRef.current !== null) clearInterval(timerRef.current);
    startedRef.current = Date.now();
    setState({ phase: "holding", sliceIndex: i, progress: 0 });
    timerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedRef.current;
      const progress = Math.min(1, elapsed / opts.holdMs);
      setState((s) =>
        s.phase === "holding" ? { ...s, progress } : s
      );
      if (progress >= 1) {
        clearInterval(timerRef.current!);
        timerRef.current = null;
        setState({ phase: "actionable", sliceIndex: i });
        onCompleteRef.current(i);
      }
    }, 16);
  }, [opts.hoveredSlice]);

  // ... cancel / requestDelete / confirmDelete
}
```

(O agente executor vai refinar — testes guiam.)

- [ ] **Step 3.3 — Commit**

```bash
git add src/donut/useHoverHold.ts src/donut/__tests__/useHoverHold.test.tsx
git commit -m "feat(donut): useHoverHold state machine with progress timer"
```

---

### Task 4: `<HoverHoldOverlay>` (preenchimento radial + ✏️/🗑️ + confirm)

**Arquivos:** `src/donut/HoverHoldOverlay.tsx`

Renderiza, sobre a fatia ativa, três modos visuais conforme a `phase`:

- `holding`: arco radial preenchido de 0 a `progress * 100%` (do centro à borda externa). Use `clipPath` ou `<path>` com mask.
- `actionable`: divide a fatia em duas metades (radialmente, na bissetriz angular) — esquerda = ✏️, direita = 🗑️. Cada metade é clicável.
- `confirming`: a metade direita (🗑️) expande, mostra "Confirmar?" com botões "Sim" / "Não" inline.

Props:
```ts
interface Props {
  cx: number; cy: number;
  innerR: number; outerR: number;
  startAngle: number; endAngle: number;
  state: HoverHoldPhase;
  onEdit: (sliceIndex: number) => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelConfirm: () => void;
}
```

- [ ] **Step 4.1 — Implementar (sem testes unitários — visual; testes integrados via Donut)**

Reuso do `arcPath` para os pedaços parciais. Para o preenchimento, computar `partialEndAngle = startAngle + (endAngle - startAngle) * progress`.

Para a divisão metade-metade, computar `midAngle = (start + end) / 2` e usar dois `arcPath`s.

- [ ] **Step 4.2 — Commit**

```bash
git add src/donut/HoverHoldOverlay.tsx
git commit -m "feat(donut): HoverHoldOverlay with radial fill and edit/delete split"
```

---

### Task 5: Integrar `useHoverHold` + `<HoverHoldOverlay>` no `<Donut>`

**Arquivos:**
- Modificar: `src/donut/Donut.tsx`
- Modificar: `src/entry/donut.tsx`
- Modificar: `src/locales/{pt-BR,en}.json`
- Modificar: `src/donut/__tests__/Donut.test.tsx`

- [ ] **Step 5.1 — Locales**

```json
"donut": {
  "toastDismiss": "Fechar",
  "hoverHold": {
    "edit": "Editar",
    "delete": "Excluir",
    "confirmDelete": "Excluir aba?",
    "yes": "Sim",
    "no": "Não"
  }
}
```

(en.json equivalente.)

- [ ] **Step 5.2 — `<Donut>` integra**

Dentro do `<Donut>`, computar:
- `currentTabs = current.tabs`
- `isTabSlice(i) = i < currentTabs.length` (não-+)
- `tabIdAt(i) = currentTabs[i]?.id`

Passar `hoveredSlice` (do `useSliceHighlight`) ao `useHoverHold`. Em `onComplete`, marcar `actionable`. Renderizar `<HoverHoldOverlay>` sobre a fatia, com handlers que chamam `onEditTab(tabId)` ou `onDeleteTab(tabId)` (props já adicionadas no Task 2).

ESC no donut: já existe um listener; estender para verificar o estado do hover-hold e chamar `cancel()` em vez de hide.

- [ ] **Step 5.3 — `donut.tsx` entrypoint**

`handleEditTab(tabId)` chama `ipc.openSettings(\`edit-tab:${tabId}\`)` + `ipc.hideDonut`.
`handleDeleteTab(tabId)` chama `ipc.deleteTab(tabId)`.

- [ ] **Step 5.4 — Smoke + testes**

Os testes integrados (`Donut.test.tsx`) usam `vi.useFakeTimers()` para simular o tempo de hover, depois clicam na metade da overlay e verificam chamada do callback.

- [ ] **Step 5.5 — Commit**

```bash
git add src/donut/Donut.tsx src/entry/donut.tsx src/locales/ src/donut/__tests__/Donut.test.tsx
git commit -m "feat(donut): wire hover-hold to edit/delete handlers via Settings intent"
```

---

### Task 6: Estender intent → `edit-tab:<id>` no `<SettingsApp>`

**Arquivos:**
- Modificar: `src/core/ipc.ts`
- Modificar: `src/settings/SettingsApp.tsx`
- Modificar: `src/settings/__tests__/SettingsApp.test.tsx`

- [ ] **Step 6.1 — Ampliar tipo**

```ts
export type SettingsIntent = "new-tab" | `edit-tab:${string}`;
```

- [ ] **Step 6.2 — Atualizar `applyIntent`**

```ts
function applyIntent(intent, setSection, setSelection, config) {
  if (intent === "new-tab") {
    setSection("tabs");
    setSelection({ mode: "new" });
    return;
  }
  if (intent && intent.startsWith("edit-tab:")) {
    const tabId = intent.slice("edit-tab:".length);
    if (config?.tabs.some((t) => t.id === tabId)) {
      setSection("tabs");
      setSelection({ mode: "edit", tabId });
    }
  }
}
```

`applyIntent` agora precisa do `config` para validar que a aba existe — caso contrário, ignora (aba foi excluída entre o donut emitir o intent e a Settings consumir).

Como a Settings já carregou `config` via `useConfig` no momento do `consume`, basta passar como argumento. Para o caminho do **listener** (chega depois de mount), também temos config no escopo.

- [ ] **Step 6.3 — Teste novo**

```tsx
it("opens the editor of the matching tab when intent is 'edit-tab:<id>'", async () => {
  const cfg = makeConfigWith([{ id: "abc", name: "Aba", icon: null, ... }]);
  (ipc.getConfig as ...).mockResolvedValue(cfg);
  (ipc.consumeSettingsIntent as ...).mockResolvedValue("edit-tab:abc");
  await renderApp();
  await waitFor(() => {
    // o título é o nome da aba; "Nova aba" só aparece em mode=new
    expect(screen.queryByRole("heading", { name: /nova aba/i })).toBeNull();
    expect(screen.getByLabelText(/nome/i)).toHaveValue("Aba");
  });
});

it("ignores 'edit-tab:<id>' intent when the tab no longer exists", async () => {
  // deve cair no select-prompt (default)
});
```

- [ ] **Step 6.4 — Commit**

```bash
git add src/core/ipc.ts src/settings/SettingsApp.tsx src/settings/__tests__/SettingsApp.test.tsx
git commit -m "feat(settings): handle 'edit-tab:<id>' intent from donut hover-hold"
```

---

### Task 7: Pipeline final + CLAUDE.md + PR

- [ ] **Step 7.1 — Pipeline local**

```bash
npm test -- --run
npx tsc --noEmit
cd src-tauri && cargo fmt --check && cargo clippy --lib -- -D warnings && cargo test --lib && cd ..
```

- [ ] **Step 7.2 — CLAUDE.md**

- "Frontend architecture": adicionar `paginate`, `useHoverHold`, `<PaginationDots>`, `<HoverHoldOverlay>`. Atualizar a descrição do `Donut.tsx` mencionando paginação + hover-hold.
- "Settings webview": registrar que `applyIntent` reconhece `edit-tab:<id>` agora.
- "Looking ahead": Plano 5 ✅ → Plano 6 (perfis) é o próximo.

- [ ] **Step 7.3 — Commit + push + PR**

```bash
git add CLAUDE.md docs/plans/05-donut-gestos.md
git commit -m "docs(claude): mark Plano 5 (donut gestures) complete"
git push -u origin HEAD
gh pr create --title "Plano 5 — Donut: paginação + hover-hold" --body-file tmp/pr-7-body.md
```

---

## Resumo dos commits previstos

1. `feat(donut): pure paginate() helper following last-page-plus rule`
2. `feat(donut): paginate slices and navigate via wheel + indicator dots`
3. `feat(donut): useHoverHold state machine with progress timer`
4. `feat(donut): HoverHoldOverlay with radial fill and edit/delete split`
5. `feat(donut): wire hover-hold to edit/delete handlers via Settings intent`
6. `feat(settings): handle 'edit-tab:<id>' intent from donut hover-hold`
7. `docs(claude): mark Plano 5 (donut gestures) complete`

---

## Critérios de aceitação

- [ ] Com 7+ abas e `itemsPerPage=6`, o donut mostra a primeira página com 6 fatias; girar a roda do mouse muda para a página 2 que mostra a aba restante + "+"; pontos no rodapé refletem a página corrente.
- [ ] Com 0 abas, o donut mostra apenas a fatia "+", e os dots não aparecem (`total === 1`).
- [ ] `pagination.wheelDirection = "inverted"` inverte o sentido sem mexer no resto.
- [ ] Mover o cursor para uma aba e segurar por `hoverHoldMs` (default 800ms) faz o preenchimento radial completar; se sair antes, o gesto é cancelado.
- [ ] Em "modo ação", clicar na metade ✏️ fecha o donut e abre Settings na aba correspondente em modo edição.
- [ ] Em "modo ação", clicar na metade 🗑️ mostra "Confirmar? Sim/Não". Sim chama `delete_tab` e o donut fecha; Não volta ao "modo ação".
- [ ] ESC durante "modo ação" volta ao donut normal sem fechar a janela.
- [ ] Hover sustentado **sobre a fatia "+"** não dispara o gesto (predicado `isTabSlice` filtra).
- [ ] Donut.test, Pagination.test, useHoverHold.test todos verdes.
- [ ] CI verde.

---

## Notas para quem for implementar

- **Não** introduza modos de seleção `clickOnly` / `hoverRelease` aqui. O escopo é deliberado e essa UX precisa de design dedicado.
- **Hover-hold só vale para fatias de aba.** Não dispare em "+" mesmo que o usuário "passe sustentado" — o gesto é "editar/excluir desta aba".
- **Cuidado com o cleanup de timers** no `useHoverHold`. Sem `clearInterval` no unmount, vazam handles. Os testes pegam isso quando montam/desmontam em sequência.
- **Cuidado com renders durante `holding`**: `setState` a 60fps por 800ms = 48 re-renders. Se virar gargalo, usar `requestAnimationFrame` em vez de `setInterval`. Antes de otimizar, medir.
- **Intent `edit-tab:<id>` não é trigger automático para `new-tab`**: cada um dos prefixos é independente. Se o tipo cresce no futuro (ex: `delete-tab:<id>`), criar parser dedicado em vez de `if/else if/else`.
- **Acessibilidade**: PaginationDots usa `<button>` real (clicável + foco com Tab); a overlay de ação também precisa de `<button>` (não `<g onClick>`) para teclado funcionar. Isso vai aparecer em algum smoke test de keyboard nav futuro.
