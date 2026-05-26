import { useCallback, useEffect, useMemo, useState } from "react";
import type { Tab } from "../core/types/Tab";
import { findTabByPath } from "./findTab";

export interface RingDescriptor {
  /** `null` no anel root (não tem parent). */
  parentId: string | null;
  /** Children renderizados nesse anel (root tabs no ring 0). */
  tabs: Tab[];
  /** Profundidade 0-based — espelha índice do anel concêntrico. */
  depth: number;
}

export interface UseRingStack {
  /** Ids dos grupos expandidos, mais externo primeiro. Length 0 = só root.
   *  Length 1 = root + 1 sub-anel (max — issue #39 reduziu de 2 sub-níveis
   *  pra 1 pra encolher a janela do donut). */
  expandedGroupIds: string[];
  /** Anéis renderizáveis em ordem (innermost first). Sempre tem pelo menos
   *  o ring 0 (root); cada item subsequente é um sub-anel expandido. */
  rings: RingDescriptor[];
  /** Toggle do anel a partir de `depth`: se `groupId` já é o último
   *  expandido, colapsa-o e tudo fora dele. Senão, abre o anel
   *  no nível `depth + 1` substituindo qualquer anel mais externo. */
  toggle: (groupId: string, depth: number) => void;
  /** Issue #71 — abre o grupo no nível `depth + 1` sem colapsar caso já
   *  esteja aberto (idempotente). Usado pela expansão por hover: passar o
   *  cursor de novo sobre o mesmo group não fecha o ring. Se outro group
   *  estiver expandido nesse depth, substitui. */
  expand: (groupId: string, depth: number) => void;
  /** Colapsa todos os anéis externos. Equivale a expandedGroupIds = []. */
  collapseAll: () => void;
}

/** Plano 23 / Issue #39 — máximo de anéis concêntricos (root + 1 sub-nível).
 *  Espelha `MAX_TAB_DEPTH = 2` no backend. Reduzido de 3 pra encolher a
 *  janela do donut e diminuir área transparente sobre a tela. */
export const MAX_RINGS = 2;

/**
 * Plano 23 — gerencia a stack de grupos expandidos e resolve cada um deles
 * num `RingDescriptor` consumível pelo `<Donut>`. Substitui o
 * `useDonutNavigation` (substituição radical: anéis ficam visíveis
 * simultaneamente em vez de troca de nível).
 *
 * Se `rootTabs` mudar (config-changed) e algum dos paths expandidos sumir
 * (group deletado por outra janela enquanto estávamos drillados), o hook
 * trunca silenciosamente até o último prefixo válido.
 */
export function useRingStack(rootTabs: Tab[]): UseRingStack {
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([]);

  // Sanitize: cada prefixo precisa apontar pra um group válido. Trunca no
  // primeiro id que não existir mais ou que não seja group.
  const sanitized = useMemo(() => {
    const valid: string[] = [];
    for (const id of expandedGroupIds) {
      const result = findTabByPath(rootTabs, [...valid, id]);
      if (!result.valid) break;
      valid.push(id);
    }
    return valid;
  }, [rootTabs, expandedGroupIds]);

  // Reescreve o state quando a sanitization detecta que o último config
  // dropou um group. Reset silencioso — comportamento esperado quando
  // outra janela edita o config enquanto o donut está aberto.
  useEffect(() => {
    if (sanitized.length !== expandedGroupIds.length) {
      setExpandedGroupIds(sanitized);
    }
  }, [sanitized, expandedGroupIds.length]);

  const rings = useMemo<RingDescriptor[]>(() => {
    const list: RingDescriptor[] = [
      { parentId: null, tabs: rootTabs, depth: 0 },
    ];
    for (let i = 0; i < sanitized.length; i++) {
      const path = sanitized.slice(0, i + 1);
      const result = findTabByPath(rootTabs, path);
      if (!result.valid) break;
      list.push({
        parentId: sanitized[i],
        tabs: result.tabs,
        depth: i + 1,
      });
    }
    return list;
  }, [rootTabs, sanitized]);

  const toggle = useCallback(
    (groupId: string, depth: number) => {
      setExpandedGroupIds((current) => {
        // Plano 23 — `depth` é o índice do anel onde o group reside.
        // Click em group da raiz (depth 0) abre/fecha o ring 1 → mexe em
        // expandedGroupIds[0]. Click no ring 1 (depth 1) → mexe em [1].
        // Click em ring 2 (depth 2) já é o outermost permitido; clicks
        // em groups lá são no-op pois não há onde expandir.
        if (depth >= MAX_RINGS - 1) return current;

        const targetIndex = depth;
        const alreadyExpanded = current[targetIndex] === groupId;
        if (alreadyExpanded) {
          // Toggle off: colapsa este e todos externos.
          return current.slice(0, targetIndex);
        }
        // Substitui anéis externos por este novo.
        return [...current.slice(0, targetIndex), groupId];
      });
    },
    [],
  );

  const expand = useCallback((groupId: string, depth: number) => {
    setExpandedGroupIds((current) => {
      if (depth >= MAX_RINGS - 1) return current;
      const targetIndex = depth;
      if (current[targetIndex] === groupId) return current;
      return [...current.slice(0, targetIndex), groupId];
    });
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedGroupIds((c) => (c.length === 0 ? c : []));
  }, []);

  return {
    expandedGroupIds: sanitized,
    rings,
    toggle,
    expand,
    collapseAll,
  };
}
