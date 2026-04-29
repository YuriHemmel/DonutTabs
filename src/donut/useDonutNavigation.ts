import { useCallback, useEffect, useState } from "react";
import type { Tab } from "../core/types/Tab";
import { findTabByPath } from "./findTab";

export interface UseDonutNavigation {
  /** Path acumulado: ids de grupos do externo pra dentro. Vazio = root. */
  path: string[];
  /** Tabs do nível atual. Reage a mudanças em `rootTabs` (config-changed). */
  currentTabs: Tab[];
  /** `false` quando o path correspondia a um group que sumiu — hook resetou. */
  valid: boolean;
  /** Drilla pra dentro de `groupId` se ele existir no nível atual. Senão noop. */
  enter: (groupId: string) => void;
  /** Volta um nível. No root é noop. */
  back: () => void;
  /** Volta direto pro root (path vazio). */
  reset: () => void;
  /** Trunca o path mantendo os primeiros `depth+1` itens (0 = primeiro nível
   *  abaixo do root). Idempotente quando o `depth` é >= ao length-1 atual. */
  jumpTo: (depth: number) => void;
}

/**
 * Plano 16 — controla a navegação dentro do sub-donut. Estado é local ao
 * hook; reabrir o donut começa do root (intencional — sub-donutos não são
 * "lugares" persistentes).
 *
 * Se `rootTabs` mudar (config-changed) e o path atual referenciar um group
 * que sumiu, o hook reseta silenciosamente para `valid=false` no próximo
 * render. O caller pode logar/diagnosticar via `valid`.
 */
export function useDonutNavigation(rootTabs: Tab[]): UseDonutNavigation {
  const [path, setPath] = useState<string[]>([]);

  const resolved = findTabByPath(rootTabs, path);

  // rootTabs mudou e o path ficou inválido (ex: group deletado em outra janela
  // enquanto estávamos drillados). Reset silencioso.
  useEffect(() => {
    if (!resolved.valid && path.length > 0) {
      setPath([]);
    }
  }, [resolved.valid, path.length]);

  const enter = useCallback(
    (groupId: string) => {
      const found = resolved.tabs.find((t) => t.id === groupId);
      if (!found || found.children.length === 0) return;
      setPath((p) => [...p, groupId]);
    },
    [resolved.tabs],
  );

  const back = useCallback(() => {
    setPath((p) => (p.length === 0 ? p : p.slice(0, -1)));
  }, []);

  const reset = useCallback(() => {
    setPath([]);
  }, []);

  const jumpTo = useCallback((depth: number) => {
    setPath((p) => {
      if (depth < 0) return [];
      const target = depth + 1;
      if (target >= p.length) return p;
      return p.slice(0, target);
    });
  }, []);

  return {
    path,
    currentTabs: resolved.valid ? resolved.tabs : rootTabs,
    valid: resolved.valid,
    enter,
    back,
    reset,
    jumpTo,
  };
}
