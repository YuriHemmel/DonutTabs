import { describe, it, expect } from "vitest";
import { searchTabs } from "../searchTabs";
import type { Tab } from "../../core/types/Tab";

function tab(id: string, overrides: Partial<Tab> = {}): Tab {
  return {
    id,
    name: null,
    icon: null,
    order: 0,
    openMode: "reuseOrNewWindow",
    items: [],
    ...overrides,
  } as Tab;
}

describe("searchTabs", () => {
  it("returns all tabs when query is empty", () => {
    const tabs = [tab("a", { name: "Trabalho" }), tab("b", { name: "Pessoal" })];
    expect(searchTabs(tabs, "")).toEqual(tabs);
  });

  it("returns all tabs when query is whitespace", () => {
    const tabs = [tab("a", { name: "Trabalho" })];
    expect(searchTabs(tabs, "   ")).toEqual(tabs);
  });

  it("preserves the original order on empty query", () => {
    const tabs = [tab("a", { name: "Z" }), tab("b", { name: "A" })];
    expect(searchTabs(tabs, "").map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("filters by case-insensitive substring on name", () => {
    const tabs = [
      tab("a", { name: "Trabalho — Work" }),
      tab("b", { name: "WORK" }),
      tab("c", { name: "Pessoal" }),
    ];
    const got = searchTabs(tabs, "work").map((t) => t.id);
    expect(got).toEqual(["a", "b"]);
  });

  it("matches on emoji-literal icon", () => {
    const tabs = [
      tab("a", { name: null, icon: "☕" }),
      tab("b", { name: null, icon: "🛒" }),
    ];
    const got = searchTabs(tabs, "☕").map((t) => t.id);
    expect(got).toEqual(["a"]);
  });

  it("ignores lucide: prefixed icons in match", () => {
    const tabs = [
      tab("a", { name: "Trabalho", icon: "lucide:Coffee" }),
      tab("b", { name: null, icon: "lucide:Briefcase" }),
    ];
    // "coffee" só está no token, não em algum nome — não deve casar.
    expect(searchTabs(tabs, "coffee")).toEqual([]);
    // "trabalho" casa pelo name (que não é token).
    expect(searchTabs(tabs, "trabalho").map((t) => t.id)).toEqual(["a"]);
  });

  it("returns empty array when nothing matches", () => {
    const tabs = [tab("a", { name: "Trabalho" })];
    expect(searchTabs(tabs, "xyzzy")).toEqual([]);
  });

  it("matches a tab with null name when icon matches", () => {
    const tabs = [tab("a", { name: null, icon: "🚀" })];
    expect(searchTabs(tabs, "🚀")).toEqual([tabs[0]]);
  });
});
