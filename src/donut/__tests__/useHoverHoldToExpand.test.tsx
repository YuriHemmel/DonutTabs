import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  useHoverHoldToExpand,
  decideExpand,
  type HoveredGroup,
} from "../useHoverHoldToExpand";

const HOLD = 1000;

describe("decideExpand", () => {
  it("instant when the depth slot is empty", () => {
    expect(decideExpand({ id: "g1", depth: 0 }, [])).toBe("instant");
  });

  it("hold when another group occupies the depth slot", () => {
    expect(decideExpand({ id: "g2", depth: 0 }, ["g1"])).toBe("hold");
  });

  it("none when the same group already occupies the depth slot", () => {
    expect(decideExpand({ id: "g1", depth: 0 }, ["g1"])).toBe("none");
  });
});

describe("useHoverHoldToExpand", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("expands instantly when no group is open at that depth (first group)", () => {
    const expand = vi.fn();
    renderHook(
      ({ g, e }: { g: HoveredGroup | null; e: string[] }) =>
        useHoverHoldToExpand(g, e, expand, HOLD),
      { initialProps: { g: { id: "g1", depth: 0 }, e: [] as string[] } },
    );
    // Sem avançar timer — instantâneo.
    expect(expand).toHaveBeenCalledTimes(1);
    expect(expand).toHaveBeenCalledWith("g1", 0);
  });

  it("does not fire when nothing is hovered", () => {
    const expand = vi.fn();
    renderHook(
      ({ g, e }: { g: HoveredGroup | null; e: string[] }) =>
        useHoverHoldToExpand(g, e, expand, HOLD),
      { initialProps: { g: null, e: [] as string[] } },
    );
    act(() => {
      vi.advanceTimersByTime(HOLD * 2);
    });
    expect(expand).not.toHaveBeenCalled();
  });

  it("requires hold to swap to another group when one is already open", () => {
    const expand = vi.fn();
    const { rerender } = renderHook(
      ({ g, e }: { g: HoveredGroup | null; e: string[] }) =>
        useHoverHoldToExpand(g, e, expand, HOLD),
      {
        initialProps: {
          g: { id: "g1", depth: 0 } as HoveredGroup | null,
          e: ["g1"] as string[],
        },
      },
    );
    // g1 já está aberto (occupant === id) → none. Cursor move pra g2.
    expect(expand).not.toHaveBeenCalled();
    rerender({ g: { id: "g2", depth: 0 }, e: ["g1"] });
    // Antes do prazo: não troca.
    act(() => {
      vi.advanceTimersByTime(HOLD - 1);
    });
    expect(expand).not.toHaveBeenCalled();
    // Cumprido o hold: troca.
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(expand).toHaveBeenCalledTimes(1);
    expect(expand).toHaveBeenCalledWith("g2", 0);
  });

  it("does nothing when hovering the already-open group", () => {
    const expand = vi.fn();
    renderHook(
      ({ g, e }: { g: HoveredGroup | null; e: string[] }) =>
        useHoverHoldToExpand(g, e, expand, HOLD),
      {
        initialProps: {
          g: { id: "g1", depth: 0 } as HoveredGroup | null,
          e: ["g1"] as string[],
        },
      },
    );
    act(() => {
      vi.advanceTimersByTime(HOLD * 2);
    });
    expect(expand).not.toHaveBeenCalled();
  });

  it("switching swap-target before the hold cancels the pending timer", () => {
    const expand = vi.fn();
    const { rerender } = renderHook(
      ({ g, e }: { g: HoveredGroup | null; e: string[] }) =>
        useHoverHoldToExpand(g, e, expand, HOLD),
      {
        initialProps: {
          g: { id: "g2", depth: 0 } as HoveredGroup | null,
          e: ["g1"] as string[],
        },
      },
    );
    act(() => {
      vi.advanceTimersByTime(HOLD - 200);
    });
    rerender({ g: { id: "g3", depth: 0 }, e: ["g1"] });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(expand).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(HOLD - 200);
    });
    expect(expand).toHaveBeenCalledTimes(1);
    expect(expand).toHaveBeenCalledWith("g3", 0);
  });

  it("leaving the group before the hold cancels the swap", () => {
    const expand = vi.fn();
    const { rerender } = renderHook(
      ({ g, e }: { g: HoveredGroup | null; e: string[] }) =>
        useHoverHoldToExpand(g, e, expand, HOLD),
      {
        initialProps: {
          g: { id: "g2", depth: 0 } as HoveredGroup | null,
          e: ["g1"] as string[],
        },
      },
    );
    act(() => {
      vi.advanceTimersByTime(HOLD - 100);
    });
    rerender({ g: null, e: ["g1"] });
    act(() => {
      vi.advanceTimersByTime(HOLD);
    });
    expect(expand).not.toHaveBeenCalled();
  });

  it("re-rendering with the same id but a new object reference does not reset the pending swap timer", () => {
    const expand = vi.fn();
    const { rerender } = renderHook(
      ({ g, e }: { g: HoveredGroup | null; e: string[] }) =>
        useHoverHoldToExpand(g, e, expand, HOLD),
      {
        initialProps: {
          g: { id: "g2", depth: 0 } as HoveredGroup | null,
          e: ["g1"] as string[],
        },
      },
    );
    act(() => {
      vi.advanceTimersByTime(500);
    });
    rerender({ g: { id: "g2", depth: 0 }, e: ["g1"] });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(expand).toHaveBeenCalledTimes(1);
    expect(expand).toHaveBeenCalledWith("g2", 0);
  });

  it("does not re-fire when the cursor stays on a just-opened group (no re-arm without leaving)", () => {
    const expand = vi.fn();
    const { rerender } = renderHook(
      ({ g, e }: { g: HoveredGroup | null; e: string[] }) =>
        useHoverHoldToExpand(g, e, expand, HOLD),
      {
        initialProps: {
          g: { id: "g1", depth: 0 } as HoveredGroup | null,
          e: [] as string[],
        },
      },
    );
    // Instant fire.
    expect(expand).toHaveBeenCalledTimes(1);
    // Config-changed reflects the open ring; cursor still on g1.
    rerender({ g: { id: "g1", depth: 0 }, e: ["g1"] });
    act(() => {
      vi.advanceTimersByTime(HOLD * 2);
    });
    expect(expand).toHaveBeenCalledTimes(1);
  });

  it("after leaving and returning to a group it can fire again", () => {
    const expand = vi.fn();
    const { rerender } = renderHook(
      ({ g, e }: { g: HoveredGroup | null; e: string[] }) =>
        useHoverHoldToExpand(g, e, expand, HOLD),
      {
        initialProps: {
          g: { id: "g1", depth: 0 } as HoveredGroup | null,
          e: [] as string[],
        },
      },
    );
    expect(expand).toHaveBeenCalledTimes(1);
    rerender({ g: null, e: ["g1"] });
    // Volta pro g1, que já está aberto → none (não dispara de novo).
    rerender({ g: { id: "g1", depth: 0 }, e: ["g1"] });
    act(() => {
      vi.advanceTimersByTime(HOLD * 2);
    });
    expect(expand).toHaveBeenCalledTimes(1);
  });
});
