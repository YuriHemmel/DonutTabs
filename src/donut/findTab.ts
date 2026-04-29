import type { Tab } from "../core/types/Tab";

export interface FindTabResult {
  /** Tabs no nível indicado pelo path. Vazio se path inválido. */
  tabs: Tab[];
  /** `true` se todo o path resolveu sem dropar; `false` se algum id sumiu. */
  valid: boolean;
}

/**
 * Resolve um `groupPath` (lista de ids de grupos do nível externo pra
 * dentro) em um nó da árvore de tabs. Path vazio retorna `rootTabs`. Cada
 * id no path deve apontar para um group (`kind === "group"`); leaf no
 * meio do caminho ou id ausente derruba a resolução.
 *
 * Pure — não depende de React. Reusado pelo donut runtime e pelo settings
 * pra mapear intents `new-tab-in-group:<csv>`. A checagem de `kind` (não
 * mais `children.length`) permite drillar em groups vazios — necessário
 * pra que `+` no sub-donut funcione antes do primeiro child existir.
 */
export function findTabByPath(
  rootTabs: Tab[],
  path: readonly string[],
): FindTabResult {
  let current = rootTabs;
  for (const id of path) {
    const next = current.find((t) => t.id === id);
    if (!next || next.kind !== "group") {
      return { tabs: [], valid: false };
    }
    current = next.children;
  }
  return { tabs: current, valid: true };
}
