import { describe, expect, it } from "vitest";
import { findTabByPath } from "../findTab";
import type { Tab } from "../../core/types/Tab";

const leaf = (id: string, name = id): Tab => ({
  id,
  name,
  icon: null,
  order: 0,
  openMode: "reuseOrNewWindow",
  items: [{ kind: "url", value: "https://x", openWith: null }],
  children: [],
});

const group = (id: string, children: Tab[], name = id): Tab => ({
  id,
  name,
  icon: null,
  order: 0,
  openMode: "reuseOrNewWindow",
  items: [],
  children,
});

describe("findTabByPath", () => {
  it("empty path returns rootTabs untouched", () => {
    const root = [leaf("a"), leaf("b")];
    const r = findTabByPath(root, []);
    expect(r.valid).toBe(true);
    expect(r.tabs).toBe(root);
  });

  it("descends one level into a group", () => {
    const root = [group("g1", [leaf("c1"), leaf("c2")])];
    const r = findTabByPath(root, ["g1"]);
    expect(r.valid).toBe(true);
    expect(r.tabs.map((t) => t.id)).toEqual(["c1", "c2"]);
  });

  it("descends multiple levels", () => {
    const root = [group("g1", [group("g2", [leaf("deep")])])];
    const r = findTabByPath(root, ["g1", "g2"]);
    expect(r.valid).toBe(true);
    expect(r.tabs[0].id).toBe("deep");
  });

  it("invalid id at any level returns valid=false and empty tabs", () => {
    const root = [group("g1", [leaf("c1")])];
    const r = findTabByPath(root, ["nonexistent"]);
    expect(r.valid).toBe(false);
    expect(r.tabs).toEqual([]);
  });

  it("path pointing to a leaf (no children) returns valid=false", () => {
    const root = [leaf("a")];
    const r = findTabByPath(root, ["a"]);
    expect(r.valid).toBe(false);
  });
});
