import type { Tab } from "../core/types/Tab";
import { paginate } from "./pagination";

/**
 * Offsets achatados (no array ordenado de abas) onde cada página COM abas
 * começa. A página final "só com +" (quando a contagem é múltipla exata de
 * `itemsPerPage`) não ganha entrada própria — não há aba pra começar nela.
 *
 * Exemplos (itemsPerPage = 6):
 *   0 abas  → [0]        (página única só com "+")
 *   3 abas  → [0]
 *   6 abas  → [0]        (página 1 = só "+", sem start próprio)
 *   7 abas  → [0, 6]
 *  13 abas  → [0, 6, 12]
 *
 * Reusa `paginate` como fonte única da regra do "+".
 */
export function pageStartIndices(tabs: Tab[], itemsPerPage: number): number[] {
  const pages = paginate(tabs, itemsPerPage);
  const starts: number[] = [];
  let acc = 0;
  for (const page of pages) {
    if (page.tabs.length > 0) starts.push(acc);
    acc += page.tabs.length;
  }
  // Lista vazia: `paginate` devolve uma única página "só +" (tabs.length 0),
  // então `starts` ficaria vazio. Tratamos como página única em índice 0.
  return starts.length > 0 ? starts : [0];
}

/**
 * Converte um destino de drop (página alvo + posição dentro da página) num
 * índice achatado de inserção no array ordenado de abas. Clampa a página ao
 * intervalo válido e o slot ao intervalo `[inícioDaPágina, comprimento]`.
 *
 * O resultado é a posição FINAL desejada da aba arrastada no array ordenado;
 * compor com `moveInOrder` produz a permutação a persistir via `reorderTabs`.
 */
export function flatDropIndex(
  tabs: Tab[],
  itemsPerPage: number,
  targetPage: number,
  slotInPage: number,
): number {
  const starts = pageStartIndices(tabs, itemsPerPage);
  const page = Math.min(Math.max(0, targetPage), starts.length - 1);
  const start = starts[page];
  const raw = start + slotInPage;
  return Math.min(Math.max(start, raw), tabs.length);
}

/**
 * Remove o id em `fromIndex` e o reinsere em `toIndex` (índice de inserção no
 * array JÁ sem o item removido), clampado a `[0, n-1]`. `from === to` devolve
 * uma cópia inalterada. Pure pra teste; é a permutação que vai pro
 * `reorderTabs`. Usado quando o drop cai na fatia "+" (mover pro fim da
 * página).
 */
export function moveInOrder(
  orderedIds: string[],
  fromIndex: number,
  toIndex: number,
): string[] {
  const next = [...orderedIds];
  if (fromIndex < 0 || fromIndex >= next.length) return next;
  const [moved] = next.splice(fromIndex, 1);
  const dest = Math.min(Math.max(0, toIndex), next.length);
  next.splice(dest, 0, moved);
  return next;
}

/**
 * Troca de posição os ids `idA` e `idB` no array, preservando todo o resto.
 * É a semântica de "soltar a aba X sobre a aba Y" — X assume a posição
 * (página + fatia) de Y e Y assume a de X. Ids iguais ou ausentes devolvem
 * uma cópia inalterada. Pure pra teste.
 */
export function swapInOrder(
  orderedIds: string[],
  idA: string,
  idB: string,
): string[] {
  const next = [...orderedIds];
  if (idA === idB) return next;
  const ia = next.indexOf(idA);
  const ib = next.indexOf(idB);
  if (ia < 0 || ib < 0) return next;
  next[ia] = idB;
  next[ib] = idA;
  return next;
}
