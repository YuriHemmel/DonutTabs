import { useEffect, useRef } from "react";

/** Identidade do group atualmente sob o cursor (ou `null` se não há
 *  group hovered). */
export interface HoveredGroup {
  id: string;
  depth: number;
}

/** Issue #91 — decide se a expansão de um group hovered deve ser
 *  instantânea ou exigir hold. Pure pra teste.
 *
 *  Regra: se o slot do anel naquele `depth` está **vazio** (nenhum group
 *  expandido ali), abrir é instantâneo — "o primeiro grupo abre na hora".
 *  Se já há **outro** group expandido nesse depth, trocar exige hold
 *  (gesto deliberado, não acidental ao atravessar o anel interno). Se o
 *  group já é o expandido nesse depth, nada a fazer.
 */
export function decideExpand(
  hovered: HoveredGroup,
  expandedGroupIds: string[],
): "instant" | "hold" | "none" {
  const occupant = expandedGroupIds[hovered.depth];
  if (occupant === hovered.id) return "none";
  if (occupant === undefined) return "instant";
  return "hold";
}

/** Issue #91 — abre o sub-anel ao passar o cursor sobre um group, com duas
 *  velocidades: **instantâneo** quando o anel externo naquele nível está
 *  fechado, e com **hold** de `holdMs` quando já há outro group aberto ali
 *  (trocar de grupo é deliberado). O anel externo **não** colapsa por
 *  hover — fechar sem trocar é só via click no group ativo (toggle).
 *
 *  Guarda por `id` (não por ref do objeto): re-renders que produzem nova
 *  ref do `hoveredGroup` com o mesmo id **não** reiniciam nem cancelam o
 *  timer pendente. Trocar de group antes do prazo cancela o pendente e
 *  reavalia. Sair do donut (group vira `null`) cancela.
 *
 *  Uma vez disparado (instant ou hold), o mesmo id não re-dispara enquanto
 *  o cursor não sair (id → null) e voltar. Isso evita reabrir um anel que
 *  o usuário acabou de fechar com click enquanto o cursor segue parado
 *  sobre a fatia.
 */
export function useHoverHoldToExpand(
  hoveredGroup: HoveredGroup | null,
  expandedGroupIds: string[],
  expand: (groupId: string, depth: number) => void,
  holdMs = 500,
): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSeenIdRef = useRef<string | null>(null);
  const lastFiredIdRef = useRef<string | null>(null);

  // Mantém o snapshot mais recente acessível dentro do callback do timer
  // sem recriar o effect a cada mudança de `expandedGroupIds`.
  const expandedRef = useRef(expandedGroupIds);
  expandedRef.current = expandedGroupIds;
  const expandFnRef = useRef(expand);
  expandFnRef.current = expand;

  useEffect(() => {
    const currentId = hoveredGroup?.id ?? null;
    if (currentId === lastSeenIdRef.current) return;
    lastSeenIdRef.current = currentId;

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (hoveredGroup === null) {
      // Saiu de qualquer group: re-arma a habilidade do mesmo id disparar
      // novamente quando voltar.
      lastFiredIdRef.current = null;
      return;
    }

    if (lastFiredIdRef.current === hoveredGroup.id) {
      // Já disparamos esse id sem o cursor ter saído desde então. No-op.
      return;
    }

    const decision = decideExpand(hoveredGroup, expandedRef.current);
    if (decision === "none") return;

    const id = hoveredGroup.id;
    const depth = hoveredGroup.depth;

    if (decision === "instant") {
      lastFiredIdRef.current = id;
      expandFnRef.current(id, depth);
      return;
    }

    // decision === "hold"
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      lastFiredIdRef.current = id;
      expandFnRef.current(id, depth);
    }, holdMs);
  }, [hoveredGroup, holdMs]);

  // Cleanup só no desmonte.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);
}
