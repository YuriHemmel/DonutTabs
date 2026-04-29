import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDonutNavigation } from "../useDonutNavigation";
import type { Tab } from "../../core/types/Tab";

const leaf = (id: string): Tab => ({
  id,
  name: id,
  icon: null,
  order: 0,
  openMode: "reuseOrNewWindow",
  items: [{ kind: "url", value: "https://x", openWith: null }],
  kind: "leaf",
  children: [],
});

const group = (id: string, children: Tab[]): Tab => ({
  id,
  name: id,
  icon: null,
  order: 0,
  openMode: "reuseOrNewWindow",
  items: [],
  kind: "group",
  children,
});

describe("useDonutNavigation", () => {
  it("starts at root with rootTabs", () => {
    const root = [leaf("a"), leaf("b")];
    const { result } = renderHook(() => useDonutNavigation(root));
    expect(result.current.path).toEqual([]);
    expect(result.current.currentTabs).toEqual(root);
    expect(result.current.valid).toBe(true);
  });

  it("enter into a group descends one level", () => {
    const root = [group("g1", [leaf("c1"), leaf("c2")])];
    const { result } = renderHook(() => useDonutNavigation(root));
    act(() => result.current.enter("g1"));
    expect(result.current.path).toEqual(["g1"]);
    expect(result.current.currentTabs.map((t) => t.id)).toEqual(["c1", "c2"]);
  });

  it("back at root is noop", () => {
    const root = [leaf("a")];
    const { result } = renderHook(() => useDonutNavigation(root));
    act(() => result.current.back());
    expect(result.current.path).toEqual([]);
  });

  it("back inside a group returns to parent", () => {
    const root = [group("g1", [leaf("c")])];
    const { result } = renderHook(() => useDonutNavigation(root));
    act(() => result.current.enter("g1"));
    act(() => result.current.back());
    expect(result.current.path).toEqual([]);
    expect(result.current.currentTabs[0].id).toBe("g1");
  });

  it("enter on non-existent id is noop", () => {
    const root = [leaf("a")];
    const { result } = renderHook(() => useDonutNavigation(root));
    act(() => result.current.enter("nope"));
    expect(result.current.path).toEqual([]);
  });

  it("enter on a leaf (no children) is noop", () => {
    const root = [leaf("a")];
    const { result } = renderHook(() => useDonutNavigation(root));
    act(() => result.current.enter("a"));
    expect(result.current.path).toEqual([]);
  });

  it("reset clears the path", () => {
    const root = [group("g1", [group("g2", [leaf("deep")])])];
    const { result } = renderHook(() => useDonutNavigation(root));
    act(() => result.current.enter("g1"));
    act(() => result.current.enter("g2"));
    expect(result.current.path).toEqual(["g1", "g2"]);
    act(() => result.current.reset());
    expect(result.current.path).toEqual([]);
  });

  it("rootTabs change drops invalid path silently", () => {
    const root1 = [group("g1", [leaf("c")])];
    const { result, rerender } = renderHook((tabs: Tab[]) => useDonutNavigation(tabs), {
      initialProps: root1,
    });
    act(() => result.current.enter("g1"));
    expect(result.current.path).toEqual(["g1"]);
    // Group desaparece (config-changed em outra janela).
    rerender([leaf("a")]);
    expect(result.current.path).toEqual([]);
    expect(result.current.valid).toBe(true);
  });
});
