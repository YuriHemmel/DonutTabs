import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDragReorder } from "../useDragReorder";

const makeItems = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `id${i}` }));

interface DragEventStub {
  preventDefault: () => void;
  clientX: number;
  clientY: number;
  currentTarget: { getBoundingClientRect: () => DOMRect };
  dataTransfer: {
    setData: (type: string, value: string) => void;
    effectAllowed: string;
    dropEffect: string;
  };
}

const makeDragEvent = (
  clientY: number,
  rect: { top: number; height: number; left?: number; width?: number },
  clientX = 0,
): DragEventStub => {
  const left = rect.left ?? 0;
  const width = rect.width ?? 0;
  return {
    preventDefault: vi.fn(),
    clientX,
    clientY,
    currentTarget: {
      getBoundingClientRect: () =>
        ({
          top: rect.top,
          height: rect.height,
          left,
          right: left + width,
          bottom: rect.top + rect.height,
          width,
          x: left,
          y: rect.top,
          toJSON: () => "",
        }) as DOMRect,
    },
    dataTransfer: { setData: vi.fn(), effectAllowed: "", dropEffect: "" },
  };
};

describe("useDragReorder", () => {
  it("drag id0 over id2 with where=below produces [id1,id2,id0,id3]", () => {
    const onReorder = vi.fn();
    const items = makeItems(4);
    const { result } = renderHook(() =>
      useDragReorder({ items, onReorder }),
    );

    act(() => {
      result.current
        .getItemProps("id0")
        .onDragStart(makeDragEvent(0, { top: 0, height: 20 }) as never);
    });

    // clientY=50, rect top=30 height=20 → midline=40 → 50>40 → below.
    act(() => {
      result.current
        .getItemProps("id2")
        .onDragOver(makeDragEvent(50, { top: 30, height: 20 }) as never);
    });

    act(() => {
      result.current
        .getItemProps("id2")
        .onDrop(makeDragEvent(50, { top: 30, height: 20 }) as never);
    });

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(["id1", "id2", "id0", "id3"]);
  });

  it("drop on same slot does not call onReorder", () => {
    const onReorder = vi.fn();
    const items = makeItems(3);
    const { result } = renderHook(() =>
      useDragReorder({ items, onReorder }),
    );

    act(() => {
      result.current
        .getItemProps("id1")
        .onDragStart(makeDragEvent(0, { top: 0, height: 20 }) as never);
    });
    act(() => {
      result.current
        .getItemProps("id1")
        .onDrop(makeDragEvent(0, { top: 0, height: 20 }) as never);
    });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it("dragging id0 above id1 is no-op (stays in place)", () => {
    const onReorder = vi.fn();
    const items = makeItems(3);
    const { result } = renderHook(() =>
      useDragReorder({ items, onReorder }),
    );

    act(() => {
      result.current
        .getItemProps("id0")
        .onDragStart(makeDragEvent(0, { top: 0, height: 20 }) as never);
    });
    act(() => {
      result.current
        .getItemProps("id1")
        .onDragOver(makeDragEvent(25, { top: 20, height: 20 }) as never);
    });
    act(() => {
      result.current
        .getItemProps("id1")
        .onDrop(makeDragEvent(25, { top: 20, height: 20 }) as never);
    });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it("dragEnd without drop clears state and does not call onReorder", () => {
    const onReorder = vi.fn();
    const items = makeItems(3);
    const { result } = renderHook(() =>
      useDragReorder({ items, onReorder }),
    );

    act(() => {
      result.current
        .getItemProps("id0")
        .onDragStart(makeDragEvent(0, { top: 0, height: 20 }) as never);
    });
    expect(result.current.getItemProps("id0")["data-dragging"]).toBe(true);

    act(() => {
      result.current.getItemProps("id0").onDragEnd();
    });
    expect(result.current.getItemProps("id0")["data-dragging"]).toBe(false);
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("data-dragging marks the dragged item; data-drop-target marks the hovered item", () => {
    const onReorder = vi.fn();
    const items = makeItems(3);
    const { result } = renderHook(() =>
      useDragReorder({ items, onReorder }),
    );

    act(() => {
      result.current
        .getItemProps("id0")
        .onDragStart(makeDragEvent(0, { top: 0, height: 20 }) as never);
    });
    act(() => {
      result.current
        .getItemProps("id2")
        .onDragOver(makeDragEvent(50, { top: 30, height: 20 }) as never);
    });

    expect(result.current.getItemProps("id0")["data-dragging"]).toBe(true);
    expect(result.current.getItemProps("id2")["data-drop-target"]).toBe(
      "below",
    );
    expect(result.current.getItemProps("id1")["data-drop-target"]).toBeNull();

    // Hover na metade superior → above.
    act(() => {
      result.current
        .getItemProps("id2")
        .onDragOver(makeDragEvent(35, { top: 30, height: 20 }) as never);
    });
    expect(result.current.getItemProps("id2")["data-drop-target"]).toBe(
      "above",
    );
  });

  it("horizontal orientation uses clientX vs midline X (not Y)", () => {
    const onReorder = vi.fn();
    const items = makeItems(3);
    const { result } = renderHook(() =>
      useDragReorder({ items, onReorder, orientation: "horizontal" }),
    );

    act(() => {
      result.current
        .getItemProps("id0")
        .onDragStart(makeDragEvent(0, { top: 0, height: 20 }, 0) as never);
    });

    // Chip alvo (id2): left=30, width=20 → midline X = 40.
    // clientX=50 → 50 > 40 → "below" (insere depois).
    act(() => {
      result.current.getItemProps("id2").onDragOver(
        makeDragEvent(
          0,
          { top: 0, height: 20, left: 30, width: 20 },
          50,
        ) as never,
      );
    });
    expect(result.current.getItemProps("id2")["data-drop-target"]).toBe(
      "below",
    );

    // clientX=32 (mesmo Y irrelevante) → 32 < 40 → "above".
    act(() => {
      result.current.getItemProps("id2").onDragOver(
        makeDragEvent(
          0,
          { top: 0, height: 20, left: 30, width: 20 },
          32,
        ) as never,
      );
    });
    expect(result.current.getItemProps("id2")["data-drop-target"]).toBe(
      "above",
    );
  });

  it("horizontal orientation: drop on right half of id2 produces [id1,id2,id0]", () => {
    const onReorder = vi.fn();
    const items = makeItems(3);
    const { result } = renderHook(() =>
      useDragReorder({ items, onReorder, orientation: "horizontal" }),
    );

    act(() => {
      result.current
        .getItemProps("id0")
        .onDragStart(makeDragEvent(0, { top: 0, height: 20 }, 0) as never);
    });
    act(() => {
      result.current.getItemProps("id2").onDragOver(
        makeDragEvent(
          0,
          { top: 0, height: 20, left: 30, width: 20 },
          48,
        ) as never,
      );
    });
    act(() => {
      result.current.getItemProps("id2").onDrop(
        makeDragEvent(
          0,
          { top: 0, height: 20, left: 30, width: 20 },
          48,
        ) as never,
      );
    });

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(["id1", "id2", "id0"]);
  });

  it("dragOver on the dragged item itself does not set drop target", () => {
    const onReorder = vi.fn();
    const items = makeItems(3);
    const { result } = renderHook(() =>
      useDragReorder({ items, onReorder }),
    );

    act(() => {
      result.current
        .getItemProps("id0")
        .onDragStart(makeDragEvent(0, { top: 0, height: 20 }) as never);
    });
    act(() => {
      result.current
        .getItemProps("id0")
        .onDragOver(makeDragEvent(50, { top: 30, height: 20 }) as never);
    });

    expect(result.current.getItemProps("id0")["data-drop-target"]).toBeNull();
  });
});
