import { useEffect, useRef } from "react";

/** Identidade do group atualmente sob o cursor (ou `null` se não há
 *  group hovered). Passar a "shape" + a função de expansão para o hook. */
export interface HoveredGroup {
  id: string;
  depth: number;
}

/** Issue #71 — dispara `expand(id, depth)` apenas quando o grupo sob o
 *  cursor muda de identidade. Sem essa guarda, qualquer re-render que
 *  altere a referência do objeto `hoveredGroup` (ex.: click em `toggle`
 *  que reescreve `expandedGroupIds` → `currentPerRing` ganha nova ref →
 *  o `useMemo` upstream produz um novo objeto com o mesmo id) re-dispara
 *  `expand` e desfaz o `toggle` de fechamento. Comparar pela string `id`
 *  isola "mesmo group, ref nova" do caso real "cursor entrou em outro
 *  group / saiu e voltou".
 *
 *  Pós-fechamento: o user precisa sair do slice e voltar para re-expandir
 *  via hover (o ref é zerado quando `hoveredGroup` vira `null`).
 */
export function useHoverToExpand(
  hoveredGroup: HoveredGroup | null,
  expand: (groupId: string, depth: number) => void,
): void {
  const lastIdRef = useRef<string | null>(null);
  useEffect(() => {
    const currentId = hoveredGroup?.id ?? null;
    if (currentId === lastIdRef.current) return;
    lastIdRef.current = currentId;
    if (hoveredGroup) {
      expand(hoveredGroup.id, hoveredGroup.depth);
    }
  }, [hoveredGroup, expand]);
}
