import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useHoverToExpand, type HoveredGroup } from "../useHoverToExpand";

describe("useHoverToExpand", () => {
  it("fires expand the first time a group is hovered", () => {
    const expand = vi.fn();
    renderHook(({ g }: { g: HoveredGroup | null }) => useHoverToExpand(g, expand), {
      initialProps: { g: { id: "g1", depth: 0 } },
    });
    expect(expand).toHaveBeenCalledTimes(1);
    expect(expand).toHaveBeenCalledWith("g1", 0);
  });

  it("does not fire when nothing is hovered", () => {
    const expand = vi.fn();
    renderHook(({ g }: { g: HoveredGroup | null }) => useHoverToExpand(g, expand), {
      initialProps: { g: null },
    });
    expect(expand).not.toHaveBeenCalled();
  });

  it("does NOT re-fire when the hoveredGroup reference changes but the id stays the same (regression: click-to-close was reopening)", () => {
    const expand = vi.fn();
    const { rerender } = renderHook(
      ({ g }: { g: HoveredGroup | null }) => useHoverToExpand(g, expand),
      { initialProps: { g: { id: "g1", depth: 0 } } },
    );
    expect(expand).toHaveBeenCalledTimes(1);
    // Simulates the bug condition: upstream useMemo creates a new object
    // with the same id (e.g., after `toggle` collapses the ring and
    // `currentPerRing` is recomputed). Without the id guard, this would
    // re-fire `expand` and reopen the ring.
    rerender({ g: { id: "g1", depth: 0 } });
    expect(expand).toHaveBeenCalledTimes(1);
  });

  it("fires expand again when transitioning to a different group", () => {
    const expand = vi.fn();
    const { rerender } = renderHook(
      ({ g }: { g: HoveredGroup | null }) => useHoverToExpand(g, expand),
      { initialProps: { g: { id: "g1", depth: 0 } } },
    );
    rerender({ g: { id: "g2", depth: 0 } });
    expect(expand).toHaveBeenCalledTimes(2);
    expect(expand).toHaveBeenLastCalledWith("g2", 0);
  });

  it("after cursor leaves and re-enters the same group, expand fires again", () => {
    const expand = vi.fn();
    const { rerender } = renderHook(
      ({ g }: { g: HoveredGroup | null }) => useHoverToExpand(g, expand),
      { initialProps: { g: { id: "g1", depth: 0 } as HoveredGroup | null } },
    );
    rerender({ g: null });
    rerender({ g: { id: "g1", depth: 0 } });
    expect(expand).toHaveBeenCalledTimes(2);
  });

  it("forwards the ring depth to expand", () => {
    const expand = vi.fn();
    renderHook(({ g }: { g: HoveredGroup | null }) => useHoverToExpand(g, expand), {
      initialProps: { g: { id: "deep", depth: 1 } },
    });
    expect(expand).toHaveBeenCalledWith("deep", 1);
  });
});
