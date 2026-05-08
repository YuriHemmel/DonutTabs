import type { Tab } from "../core/types/Tab";

/** Plano 23 — espelha `BASE_DONUT_SIZE` em `donut_window/mod.rs`. */
export const DONUT_BASE_SIZE = 420;
/** Plano 23 — espelha `RING_SIZE_INCREMENT` em `donut_window/mod.rs`. */
export const DONUT_RING_INCREMENT = 140;
/** Plano 23 / Issue #39 — espelha `MAX_TAB_DEPTH = 2` no `validate.rs`.
 *  Reduzido de 3 pra encolher a janela do donut. */
export const DONUT_MAX_RINGS = 2;

/** Plano 23 — descobre a profundidade máxima de grupos aninhados. Pure
 *  pra teste; espelha `max_group_depth` em `donut_window/mod.rs`. Retorna
 *  1 quando não há grupos (1 ring = root). */
export function maxGroupDepth(tabs: readonly Tab[]): number {
  let max = 1;
  for (const tab of tabs) {
    if (tab.kind === "group") {
      const child = 1 + maxGroupDepth(tab.children ?? []);
      if (child > max) max = child;
    }
  }
  return max;
}

/** Plano 23 — tamanho da janela em logical pixels para `rings` anéis.
 *  Pure; espelha `donut_size_for_rings` em `donut_window/mod.rs`.
 *  Clamped em `[BASE, BASE + (MAX-1) * INCREMENT]`. */
export function donutSizeForRings(rings: number): number {
  const clamped = Math.max(1, Math.min(DONUT_MAX_RINGS, rings));
  return DONUT_BASE_SIZE + DONUT_RING_INCREMENT * (clamped - 1);
}

/** Plano 23 — tamanho final do donut para um conjunto de tabs do perfil
 *  ativo. Backend Rust faz o mesmo cálculo no `donut_window::show` — os
 *  dois precisam concordar pra que o SVG `width/height` cubra a janela
 *  e os rings externos não sejam clipados. */
export function donutSizeForTabs(tabs: readonly Tab[]): number {
  return donutSizeForRings(maxGroupDepth(tabs));
}
