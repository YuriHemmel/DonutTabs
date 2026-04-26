# DonutTabs — Plano 8: Drag-and-drop (reordenar abas + perfis)

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: Use `superpowers:subagent-driven-development` (recomendada) ou `superpowers:executing-plans` para implementar este plano tarefa-a-tarefa.

**Meta:** Permitir ao usuário reordenar manualmente:

1. **Abas dentro de um perfil** — arrastar item da `<TabList>` na Settings.
2. **Perfis** — arrastar item do `<ProfilePicker>` na Settings (afeta a ordem mostrada no donut switcher).

A ordem no JSON passa a ser a ordem visual canônica (não há mais campo `order` em `Tab` desde Plano 1; já é por índice no `Vec`). O donut renderiza fatias na **mesma ordem** do array.

**Arquitetura:** HTML5 native DnD (`draggable`, `onDragStart/Over/Drop`). Sem dependência nova (`react-dnd` é overkill pra duas listas). Mutação cliente reordena array localmente (otimista) → IPC `reorder_tabs` / `reorder_profiles` valida e persiste → `config-changed` reconcilia.

**Stack adicional:** nenhuma.

**Fora desta slice:**
- Drag de aba **entre** perfis (mover aba pra outro perfil) → futuro, exige seleção do perfil-destino.
- Drag de items **dentro** de uma aba (links na lista interna) → escopo pequeno e independente, dá pra incluir se sobrar tempo, senão deferido.
- Touch DnD em mobile (não temos build mobile).

---

## Pré-requisitos (estado atual pós-merge do Plano 7)

- [src-tauri/src/config/schema.rs](../../src-tauri/src/config/schema.rs:1): `Profile { tabs: Vec<Tab> }`. Ordem do `Vec` = ordem de render.
- [src-tauri/src/commands.rs](../../src-tauri/src/commands.rs:1): mutadores escopados ao perfil; padrão validate → `save_atomic` → `emit(CONFIG_CHANGED_EVENT)` + rollback in-memory.
- [src/settings/TabList.tsx](../../src/settings/TabList.tsx:1): renderiza linha por aba; sem DnD.
- [src/settings/ProfilePicker.tsx](../../src/settings/ProfilePicker.tsx:1): select + botões; sem DnD (select nativo não dá pra arrastar).
- [src/donut/Donut.tsx](../../src/donut/Donut.tsx:1): consome `tabs` e `profiles` na ordem dada; nada a mudar do lado donut, só receber arrays já reordenados.

---

## Estrutura de arquivos

### Novos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/settings/useDragReorder.ts` | Hook genérico: `useDragReorder<T extends { id: string }>(items, onReorder)` retorna handlers + estado de "drop indicator" |
| `src/settings/__tests__/useDragReorder.test.tsx` | Reordena, no-op se índice igual, ignora drop fora |
| `src/settings/DraggableProfileList.tsx` | Substitui `<select>` do `<ProfilePicker>` por lista vertical de chips arrastáveis (precisa pra DnD funcionar) |
| `src/settings/__tests__/DraggableProfileList.test.tsx` | Render, click seleciona, drag reordena |

### Modificados

| Arquivo | Mudança |
|---|---|
| `src-tauri/src/commands.rs` | Novos comandos `reorder_tabs(profile_id: Uuid, ordered_ids: Vec<Uuid>)` + `reorder_profiles(ordered_ids: Vec<Uuid>)`. Validam que set é o mesmo (sem add/remove); reconstroem `Vec` na ordem dada; `save_atomic` + emit. Rollback in-memory se IO falhar |
| `src-tauri/src/config/validate.rs` | Nada novo — reorder não muda set, validação existente cobre |
| `src-tauri/src/lib.rs` | `invoke_handler!` registra os 2 novos comandos |
| `src/core/ipc.ts` | Wrappers `reorderTabs`, `reorderProfiles` |
| `src/settings/useConfig.ts` | Helpers `reorderTabs`, `reorderProfiles` |
| `src/settings/TabList.tsx` | Items ganham `draggable`, handlers via `useDragReorder`. Indicador visual (linha azul) no slot-alvo |
| `src/settings/ProfilePicker.tsx` | Substitui `<select>` por `<DraggableProfileList>`. Mantém botões "+ Novo", "Editar", "Excluir" ao lado |
| `src/locales/{pt-BR,en}.json` | `errors.config.reorderMismatch` ("conjunto de ids divergente") |
| `CLAUDE.md` | Mencionar `reorder_tabs`/`reorder_profiles` + nova UI do ProfilePicker |

---

## Tarefas

### Task 1 — Comandos Rust `reorder_tabs` / `reorder_profiles` (TDD)

**Arquivos:** `src-tauri/src/commands.rs` + testes inline ou em `src-tauri/src/__tests__/commands_reorder.rs`.

Casos de teste a cobrir antes da impl:

- `reorder_tabs` com `ordered_ids` permutação válida → array reescrito na ordem; persiste; emite event.
- `reorder_tabs` com id faltando → `AppError::config("reorder_mismatch", &[("scope","tabs")])`; nada persiste.
- `reorder_tabs` com id extra → mesmo erro.
- `reorder_tabs` com profile_id inexistente → `AppError::config("profile_not_found", ...)` (já existe? reusar).
- Análogo pra `reorder_profiles`; bloqueia se `ordered_ids` não cobre exatamente o set.
- IO falha (mock `save_atomic`) → estado em memória volta ao anterior.

Assinatura:

```rust
#[tauri::command]
pub fn reorder_tabs<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    profile_id: Uuid,
    ordered_ids: Vec<Uuid>,
) -> Result<Config, AppError> { ... }

#[tauri::command]
pub fn reorder_profiles<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, AppState>,
    ordered_ids: Vec<Uuid>,
) -> Result<Config, AppError> { ... }
```

Helper a extrair: `reorder_in_place<T, F>(items: &mut Vec<T>, ordered_ids: &[Uuid], get_id: F) -> Result<(), AppError>` — valida set + reordena.

### Task 2 — IPC + useConfig helpers

**Arquivos:** `src/core/ipc.ts`, `src/settings/useConfig.ts`, `src/settings/__tests__/useConfig.test.tsx`

Wrappers tipados; testes mock-IPC verificam delegação.

### Task 3 — Hook `useDragReorder` (TDD)

**Arquivos:** `src/settings/useDragReorder.ts`, `src/settings/__tests__/useDragReorder.test.tsx`

Interface:

```ts
function useDragReorder<T extends { id: string }>(opts: {
  items: T[];
  onReorder: (orderedIds: string[]) => void;
}): {
  getItemProps: (id: string) => {
    draggable: true;
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
    "data-dragging": boolean;
    "data-drop-target": "above" | "below" | null;
  };
};
```

Lógica:

- `onDragStart` → guarda `draggingId` em state, `e.dataTransfer.setData("text/plain", id)`, `effectAllowed = "move"`.
- `onDragOver` → `e.preventDefault()`; calcula se cursor está acima/abaixo do meio do alvo (via `e.clientY` + `e.currentTarget.getBoundingClientRect()`); set `dropTarget = { id, where: "above"|"below" }`.
- `onDrop` → calcula nova ordem (move `draggingId` para slot indicado); chama `onReorder(newOrderedIds)` se ordem mudou; reset estado.
- `onDragEnd` → reset estado mesmo se drop foi fora.

Testes:

- Drag item 0 sobre item 2 (where=below) → `onReorder` chamado com `[1,2,0,3]`.
- Drop no mesmo slot → `onReorder` NÃO chamado.
- Drag cancelado (dragend sem drop) → estado limpo.
- `data-dragging` true no item arrastado; `data-drop-target` "above"/"below" no alvo.

### Task 4 — `<DraggableProfileList>` (substitui `<select>`)

**Arquivos:** `src/settings/DraggableProfileList.tsx`, `src/settings/ProfilePicker.tsx`, `src/settings/__tests__/DraggableProfileList.test.tsx`

`<select>` HTML não suporta drag de `<option>`. Trocar por lista de chips (botões) horizontal/vertical:

```tsx
<DraggableProfileList
  profiles={profiles}
  selectedId={selectedId}
  activeId={activeId}
  onSelect={onSelect}
  onReorder={onReorder}
/>
```

- Cada chip: ícone (ou inicial fallback) + nome. Active marcado com indicador (bolinha dourada, mesmo do switcher).
- Selected: borda accent.
- Botões "+ Novo", "Editar", "Excluir" ficam ao lado da lista (não dentro dela).

Testes:

- Renderiza N chips.
- Click seleciona.
- Drag chip 0 sobre chip 1 → `onReorder([id1, id0, ...])`.
- Active marker aparece no perfil ativo.

### Task 5 — DnD no `<TabList>`

**Arquivos:** `src/settings/TabList.tsx`, `src/settings/__tests__/TabList.test.tsx`

- Cada linha de aba ganha `draggable` via `useDragReorder.getItemProps(tab.id)`.
- Visual: linha de drop indicator (1px accent) acima/abaixo do alvo.
- A linha "+ Adicionar aba" continua **não** draggable (não tem id, não está no array).
- Submit chama `reorderTabs(selectedProfile.id, newIds)`.

Testes (ajustar existentes + novos):

- Reordenar aba 0 pra última posição → `ipc.reorderTabs` chamado com nova ordem.
- "+" não tem `draggable`.

### Task 6 — Pipeline + CLAUDE.md + PR

- `cargo test/clippy/fmt` + `npm test` + `tsc`.
- CLAUDE.md atualizado: `reorder_tabs`/`reorder_profiles`, `<DraggableProfileList>` substitui `<select>`.
- Commit + push + PR.

---

## Resumo dos commits previstos

1. `feat(commands): reorder_tabs + reorder_profiles with set-equality validation`
2. `feat(ipc): reorderTabs + reorderProfiles wrappers`
3. `feat(settings): useDragReorder hook (HTML5 native DnD)`
4. `feat(settings): DraggableProfileList replaces native select`
5. `feat(settings): drag-and-drop in TabList`
6. `docs(claude): mark Plano 8 (drag-and-drop) complete`

---

## Critérios de aceitação

- [ ] Arrastar aba na Settings reordena visualmente, persiste, e o donut respeita a nova ordem após `config-changed`.
- [ ] Arrastar perfil no `<DraggableProfileList>` reordena, persiste, e o switcher do donut respeita.
- [ ] Cancelar drag (soltar fora) não muta nada.
- [ ] `reorder_*` rejeita set divergente sem persistir.
- [ ] Keyboard: lista de perfis ainda navegável por Tab/Enter (não regredir acessibilidade).
- [ ] CI verde.

---

## Notas

- **Por que HTML5 e não react-dnd**: 2 listas, comportamento padrão; libs grandes não pagam aqui. HTML5 DnD tem quirks (drag image, dragenter vs dragover) mas o hook abstrai.
- **Drop visual indicator**: 1px accent acima/abaixo do alvo é suficiente; evitar deslocamento real dos items (caro + pisca).
- **Race com config-changed**: reorder otimista local seria bom mas complica reconciliação. Estratégia simples: aguardar IPC retornar, deixar `useConfig` aplicar o snapshot novo. Lag perceptível? Se sim, aplicar estado otimista + rollback no `.catch`.
- **Toque/teclado**: HTML5 DnD não cobre touch. Aceitável — o app é desktop. Acessibilidade por teclado pode ser adicionada depois (botões "↑/↓" no chip).
- **Move entre perfis**: deferido — `dataTransfer` carregaria `{ tabId, sourceProfileId }` e o drop site no `<DraggableProfileList>` aceitaria; precisa decidir UX (chip do perfil "highlight" como drop target).
