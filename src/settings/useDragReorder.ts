import { useCallback, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";

export type DropWhere = "above" | "below";
export type DragOrientation = "vertical" | "horizontal";

interface DropTarget {
  id: string;
  where: DropWhere;
}

interface UseDragReorderOpts<T extends { id: string }> {
  items: T[];
  onReorder: (orderedIds: string[]) => void;
  /**
   * Eixo do layout. `vertical` (default) compara `clientY` com o centro Y do
   * alvo; `horizontal` compara `clientX` com o centro X. `"above"` mapeia para
   * "inserir antes" (acima/à esquerda) e `"below"` para "inserir depois"
   * (abaixo/à direita) na direção do flow.
   */
  orientation?: DragOrientation;
}

export interface DragItemProps {
  draggable: true;
  onDragStart: (e: ReactDragEvent) => void;
  onDragOver: (e: ReactDragEvent) => void;
  onDrop: (e: ReactDragEvent) => void;
  onDragEnd: () => void;
  "data-dragging": boolean;
  "data-drop-target": DropWhere | null;
}

export interface UseDragReorder {
  getItemProps: (id: string) => DragItemProps;
}

/**
 * HTML5 native DnD para reordenar uma lista plana cuja única chave é `id`.
 * O limiar `above`/`below` segue o eixo do layout (`orientation`): vertical
 * compara `clientY` com o meio Y do alvo; horizontal compara `clientX` com o
 * meio X. `onReorder` recebe o array completo de ids na nova ordem; chamadas
 * são suprimidas quando o resultado seria idêntico ao estado atual.
 */
export function useDragReorder<T extends { id: string }>(
  opts: UseDragReorderOpts<T>,
): UseDragReorder {
  const { items, onReorder, orientation = "vertical" } = opts;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const reset = useCallback(() => {
    setDraggingId(null);
    setDropTarget(null);
  }, []);

  const computeNewOrder = useCallback(
    (sourceId: string, targetId: string, where: DropWhere): string[] | null => {
      const sourceIdx = items.findIndex((t) => t.id === sourceId);
      const targetIdx = items.findIndex((t) => t.id === targetId);
      if (sourceIdx < 0 || targetIdx < 0) return null;
      let insertAt = where === "below" ? targetIdx + 1 : targetIdx;
      // Removendo o source antes de inserir desloca o índice em -1 quando
      // estava à esquerda do alvo.
      if (sourceIdx < insertAt) insertAt -= 1;
      if (insertAt === sourceIdx) return null;
      const next = items.map((t) => t.id);
      const [moved] = next.splice(sourceIdx, 1);
      next.splice(insertAt, 0, moved);
      return next;
    },
    [items],
  );

  const getItemProps = useCallback(
    (id: string): DragItemProps => ({
      draggable: true,
      onDragStart: (e) => {
        setDraggingId(id);
        try {
          e.dataTransfer.setData("text/plain", id);
          e.dataTransfer.effectAllowed = "move";
        } catch {
          // jsdom / sandbox podem rejeitar — a lógica não depende disso.
        }
      },
      onDragOver: (e) => {
        e.preventDefault();
        if (!draggingId || draggingId === id) return;
        try {
          e.dataTransfer.dropEffect = "move";
        } catch {
          // idem.
        }
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const where: DropWhere =
          orientation === "horizontal"
            ? e.clientX < rect.left + rect.width / 2
              ? "above"
              : "below"
            : e.clientY < rect.top + rect.height / 2
              ? "above"
              : "below";
        setDropTarget((prev) =>
          prev?.id === id && prev.where === where ? prev : { id, where },
        );
      },
      onDrop: (e) => {
        e.preventDefault();
        if (!draggingId) {
          reset();
          return;
        }
        const where: DropWhere =
          dropTarget?.id === id ? dropTarget.where : "below";
        const next = computeNewOrder(draggingId, id, where);
        if (next) onReorder(next);
        reset();
      },
      onDragEnd: () => {
        reset();
      },
      "data-dragging": draggingId === id,
      "data-drop-target":
        dropTarget?.id === id && draggingId !== id ? dropTarget.where : null,
    }),
    [draggingId, dropTarget, computeNewOrder, onReorder, reset, orientation],
  );

  return { getItemProps };
}
