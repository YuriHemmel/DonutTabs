import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRingStack } from "../useRingStack";
import type { Tab } from "../../core/types/Tab";

const leaf = (id: string, name = id): Tab => ({
  id,
  name,
  icon: null,
  order: 0,
  openMode: "reuseOrNewWindow",
  items: [{ kind: "url", value: "https://x", openWith: null, monitor: null }],
  kind: "leaf",
  children: [],
});

const group = (id: string, children: Tab[], name = id): Tab => ({
  id,
  name,
  icon: null,
  order: 0,
  openMode: "reuseOrNewWindow",
  items: [],
  kind: "group",
  children,
});

describe("useRingStack", () => {
  it("starts collapsed: only root ring", () => {
    const tabs = [leaf("a"), group("g", [leaf("g1")])];
    const { result } = renderHook(() => useRingStack(tabs));
    expect(result.current.expandedGroupIds).toEqual([]);
    expect(result.current.rings).toHaveLength(1);
    expect(result.current.rings[0].depth).toBe(0);
    expect(result.current.rings[0].parentId).toBeNull();
    expect(result.current.rings[0].tabs).toEqual(tabs);
  });

  it("toggle at depth 0 expands ring 1 with the group's children", () => {
    const tabs = [group("g", [leaf("g1"), leaf("g2")])];
    const { result } = renderHook(() => useRingStack(tabs));
    act(() => result.current.toggle("g", 0));
    expect(result.current.expandedGroupIds).toEqual(["g"]);
    expect(result.current.rings).toHaveLength(2);
    expect(result.current.rings[1].depth).toBe(1);
    expect(result.current.rings[1].parentId).toBe("g");
    expect(result.current.rings[1].tabs.map((t) => t.id)).toEqual(["g1", "g2"]);
  });

  it("toggle at depth 0 with same id collapses ring 1 (and outer rings)", () => {
    const tabs = [group("g", [group("g1", [leaf("l")])])];
    const { result } = renderHook(() => useRingStack(tabs));
    act(() => result.current.toggle("g", 0));
    act(() => result.current.toggle("g1", 1));
    expect(result.current.rings).toHaveLength(3);
    // Toggle off ring 1 → collapses ring 2 também.
    act(() => result.current.toggle("g", 0));
    expect(result.current.expandedGroupIds).toEqual([]);
    expect(result.current.rings).toHaveLength(1);
  });

  it("toggle at depth 0 with different id replaces ring 1 (and clears outer)", () => {
    const tabs = [
      group("a", [leaf("a1")]),
      group("b", [leaf("b1")]),
    ];
    const { result } = renderHook(() => useRingStack(tabs));
    act(() => result.current.toggle("a", 0));
    expect(result.current.rings[1].tabs[0].id).toBe("a1");
    act(() => result.current.toggle("b", 0));
    expect(result.current.expandedGroupIds).toEqual(["b"]);
    expect(result.current.rings[1].tabs[0].id).toBe("b1");
  });

  it("toggle at depth 1 expands ring 2 (3 rings total)", () => {
    const tabs = [group("g1", [group("g2", [leaf("leaf")])])];
    const { result } = renderHook(() => useRingStack(tabs));
    act(() => result.current.toggle("g1", 0));
    act(() => result.current.toggle("g2", 1));
    expect(result.current.expandedGroupIds).toEqual(["g1", "g2"]);
    expect(result.current.rings).toHaveLength(3);
    expect(result.current.rings[2].tabs[0].id).toBe("leaf");
  });

  it("toggle at outermost depth (MAX-1) is no-op (no expansion possible)", () => {
    const tabs = [group("g1", [group("g2", [group("g3", [leaf("l")])])])];
    const { result } = renderHook(() => useRingStack(tabs));
    act(() => result.current.toggle("g1", 0));
    act(() => result.current.toggle("g2", 1));
    // depth 2 = ring outermost. Group g3 click é no-op (não há ring 3).
    act(() => result.current.toggle("g3", 2));
    expect(result.current.expandedGroupIds).toEqual(["g1", "g2"]);
    expect(result.current.rings).toHaveLength(3);
  });

  it("collapseAll resets to root only", () => {
    const tabs = [group("g1", [group("g2", [leaf("l")])])];
    const { result } = renderHook(() => useRingStack(tabs));
    act(() => result.current.toggle("g1", 0));
    act(() => result.current.toggle("g2", 1));
    act(() => result.current.collapseAll());
    expect(result.current.expandedGroupIds).toEqual([]);
    expect(result.current.rings).toHaveLength(1);
  });

  it("sanitizes when rootTabs no longer contains an expanded group", () => {
    const tabs = [group("g", [leaf("g1")])];
    const { result, rerender } = renderHook(
      ({ ts }: { ts: Tab[] }) => useRingStack(ts),
      { initialProps: { ts: tabs } },
    );
    act(() => result.current.toggle("g", 0));
    expect(result.current.rings).toHaveLength(2);
    // Outra janela deletou o group g.
    rerender({ ts: [leaf("a")] });
    expect(result.current.expandedGroupIds).toEqual([]);
    expect(result.current.rings).toHaveLength(1);
  });

  it("toggle ignores leaves (not groups)", () => {
    const tabs = [leaf("a")];
    const { result } = renderHook(() => useRingStack(tabs));
    act(() => result.current.toggle("a", 0));
    // Leaf não é drillável; sanitization remove o id inválido.
    expect(result.current.expandedGroupIds).toEqual([]);
    expect(result.current.rings).toHaveLength(1);
  });
});
