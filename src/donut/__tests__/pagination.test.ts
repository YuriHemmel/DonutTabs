import { describe, it, expect } from "vitest";
import { paginate } from "../pagination";
import type { Tab } from "../../core/types/Tab";

const tab = (id: string): Tab => ({
  id,
  name: id,
  icon: null,
  order: 0,
  openMode: "reuseOrNewWindow",
  items: [],
  children: [],
});

describe("paginate", () => {
  it("returns a single page with only '+' when there are no tabs", () => {
    expect(paginate([], 6)).toEqual([{ tabs: [], hasPlus: true }]);
  });

  it("fits all tabs and '+' on one page when count < itemsPerPage", () => {
    const tabs = [tab("a"), tab("b"), tab("c")];
    expect(paginate(tabs, 6)).toEqual([{ tabs, hasPlus: true }]);
  });

  it("pushes '+' to its own page when count == itemsPerPage", () => {
    const tabs = [tab("a"), tab("b"), tab("c"), tab("d"), tab("e"), tab("f")];
    const pages = paginate(tabs, 6);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toEqual({ tabs, hasPlus: false });
    expect(pages[1]).toEqual({ tabs: [], hasPlus: true });
  });

  it("splits tabs across pages when count > itemsPerPage and '+' lands on the last page", () => {
    const tabs = [
      tab("a"),
      tab("b"),
      tab("c"),
      tab("d"),
      tab("e"),
      tab("f"),
      tab("g"),
    ];
    const pages = paginate(tabs, 6);
    expect(pages).toHaveLength(2);
    expect(pages[0]).toEqual({ tabs: tabs.slice(0, 6), hasPlus: false });
    expect(pages[1]).toEqual({ tabs: tabs.slice(6), hasPlus: true });
  });

  it("supports custom itemsPerPage = 4", () => {
    const tabs = Array.from({ length: 5 }, (_, i) => tab(`t${i}`));
    const pages = paginate(tabs, 4);
    expect(pages).toHaveLength(2);
    expect(pages[0].tabs).toHaveLength(4);
    expect(pages[0].hasPlus).toBe(false);
    expect(pages[1].tabs).toHaveLength(1);
    expect(pages[1].hasPlus).toBe(true);
  });

  it("creates a third page when 2*perPage tabs are reached", () => {
    const tabs = Array.from({ length: 12 }, (_, i) => tab(`t${i}`));
    const pages = paginate(tabs, 6);
    expect(pages).toHaveLength(3);
    expect(pages[0].hasPlus).toBe(false);
    expect(pages[1].hasPlus).toBe(false);
    expect(pages[2]).toEqual({ tabs: [], hasPlus: true });
  });

  it("supports itemsPerPage = 8 (max in schema)", () => {
    const tabs = Array.from({ length: 9 }, (_, i) => tab(`t${i}`));
    const pages = paginate(tabs, 8);
    expect(pages).toHaveLength(2);
    expect(pages[0].tabs).toHaveLength(8);
    expect(pages[0].hasPlus).toBe(false);
    expect(pages[1].tabs).toHaveLength(1);
    expect(pages[1].hasPlus).toBe(true);
  });
});
