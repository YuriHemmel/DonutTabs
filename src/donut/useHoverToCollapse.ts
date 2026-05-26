import { useEffect, useRef } from "react";

/** Snapshot do que está sob o cursor relevante para o trim. `ring` é o
 *  índice do anel concêntrico (0 = root, 1 = primeiro sub-anel, etc.).
 *  `tabId` é o id da fatia hovered ou `null` se o cursor está sobre o
 *  "+" / fora de qualquer fatia ainda dentro do ring. */
export interface HoveredForCollapse {
  ring: number;
  tabId: string | null;
}

/** Issue #71 — pure: dado o cursor atual, calcula o comprimento que
 *  `expandedGroupIds` deveria ter pra refletir "groups cuja área (própria
 *  fatia + anel externo de filhos) ainda contém o cursor".
 *
 *  Regra: um group expandido a depth `D` permanece aberto se o cursor
 *  está em (ring D, fatia = id desse group) OU em qualquer ring `> D`.
 *  Cursor fora do donut (null) → tudo colapsa.
 */
export function computeTrimLength(
  hovered: HoveredForCollapse | null,
  expandedGroupIds: string[],
): number {
  if (hovered === null) return 0;
  const { ring, tabId } = hovered;
  // Cursor em ring R > D ⇒ group em depth D fica aberto. Logo, depths
  // 0..R-1 sempre sobrevivem.
  let len = ring;
  // Para depth = ring, sobrevive só se o cursor está na própria fatia
  // do group expandido nesse depth.
  if (ring < expandedGroupIds.length && tabId !== null) {
    if (tabId === expandedGroupIds[ring]) {
      len = ring + 1;
    }
  }
  return len;
}

function sameHover(
  a: HoveredForCollapse | null,
  b: HoveredForCollapse | null,
): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.ring === b.ring && a.tabId === b.tabId;
}

/** Hook que dispara `trim` quando o cursor **realmente muda** para fora
 *  da "zona viva" de algum group expandido. A guarda por transição evita
 *  colapsar no mount inicial (`hovered = null`, sem cursor no donut) e
 *  imediatamente após um click-to-expand em ambientes (testes) onde o
 *  hover não é simulado — em uso real, click no slice implica mouseMove
 *  prévio, mas a guarda mantém a lógica robusta. `enabled = false` pausa
 *  a captura (ex.: context-menu / overlay de busca abertos não devem
 *  colapsar rings por baixo do user).
 *
 *  `trim` recebe uma **closure** `(current) => len`, não um número direto.
 *  Isso é proposital: hover-to-expand e hover-to-collapse podem disparar
 *  no mesmo commit cycle (cursor entra num group), e o cálculo precisa
 *  rodar contra o `current` pós-expand (não contra `expandedGroupIds`
 *  capturado do render stale) para não anular o expand recém-aplicado.
 *  `expandedGroupIds` continua nas deps como trigger de re-evaluação
 *  para mudanças externas (ex.: `toggle` por click). */
export function useHoverToCollapse(args: {
  hovered: HoveredForCollapse | null;
  expandedGroupIds: string[];
  trim: (computeLen: (current: string[]) => number) => void;
  enabled?: boolean;
}): void {
  const { hovered, expandedGroupIds, trim, enabled = true } = args;
  const lastHoveredRef = useRef<HoveredForCollapse | null>(null);
  useEffect(() => {
    if (!enabled) return;
    if (sameHover(lastHoveredRef.current, hovered)) return;
    lastHoveredRef.current = hovered;
    trim((current) => computeTrimLength(hovered, current));
  }, [hovered, expandedGroupIds, trim, enabled]);
}
