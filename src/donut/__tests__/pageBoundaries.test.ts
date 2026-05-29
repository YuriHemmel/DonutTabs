import { describe, it, expect } from "vitest";
import {
  pageStartIndices,
  moveInOrder,
  swapInOrder,
} from "../pageBoundaries";
import { paginate } from "../pagination";
import type { Tab } from "../../core/types/Tab";

function makeTabs(n: number): Tab[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    name: `Tab ${i}`,
    icon: null,
    order: i,
    openMode: "newTab",
    items: [],
    kind: "leaf",
    children: [],
    focusIfOpen: false,
  })) as unknown as Tab[];
}

describe("pageStartIndices", () => {
  it("returns [0] for an empty list (single '+'-only page)", () => {
    expect(pageStartIndices([], 6)).toEqual([0]);
  });

  it("returns [0] when count < itemsPerPage (one page)", () => {
    expect(pageStartIndices(makeTabs(3), 6)).toEqual([0]);
  });

  it("does not add a start for the trailing '+'-only page when count == itemsPerPage", () => {
    // 6 tabs / ipp 6 → page 0 = 6 tabs, page 1 = só "+". O "+" não ganha
    // separador próprio porque não tem aba pra começar nele.
    expect(pageStartIndices(makeTabs(6), 6)).toEqual([0]);
  });

  it("splits at the page boundary when count > itemsPerPage", () => {
    expect(pageStartIndices(makeTabs(7), 6)).toEqual([0, 6]);
  });

  it("handles two full pages plus a tail (2*ipp+1)", () => {
    expect(pageStartIndices(makeTabs(13), 6)).toEqual([0, 6, 12]);
  });

  it("supports itemsPerPage = 4", () => {
    expect(pageStartIndices(makeTabs(9), 4)).toEqual([0, 4, 8]);
  });

  it("supports itemsPerPage = 8", () => {
    expect(pageStartIndices(makeTabs(8), 8)).toEqual([0]);
    expect(pageStartIndices(makeTabs(9), 8)).toEqual([0, 8]);
  });

  it("is consistent with paginate (each start equals the cumulative tab count)", () => {
    const tabs = makeTabs(13);
    const pages = paginate(tabs, 6);
    const starts: number[] = [];
    let acc = 0;
    for (const page of pages) {
      if (page.tabs.length > 0) starts.push(acc);
      acc += page.tabs.length;
    }
    expect(pageStartIndices(tabs, 6)).toEqual(starts);
  });
});

describe("moveInOrder", () => {
  const ids = ["a", "b", "c", "d"];

  it("moves an item forward", () => {
    expect(moveInOrder(ids, 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item backward", () => {
    expect(moveInOrder(ids, 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("returns an unchanged copy when from === to", () => {
    const out = moveInOrder(ids, 1, 1);
    expect(out).toEqual(ids);
    expect(out).not.toBe(ids);
  });

  it("clamps an out-of-range target to the end", () => {
    expect(moveInOrder(ids, 0, 99)).toEqual(["b", "c", "d", "a"]);
  });

  it("treats a drop index past the removal point correctly", () => {
    // remove "a" (idx 0) → [b,c,d]; insert at flat target 3 (end)
    expect(moveInOrder(ids, 0, 3)).toEqual(["b", "c", "d", "a"]);
  });

  it("moves to the end when toIndex equals the array length (drop on '+')", () => {
    // OrganizationSection usa `length` como destino do drop na fatia "+",
    // que sempre representa o fim do ring — inclusive quando a contagem é
    // múltipla exata de itemsPerPage e a última página é "só +".
    expect(moveInOrder(ids, 1, ids.length)).toEqual(["a", "c", "d", "b"]);
  });
});

describe("swapInOrder", () => {
  const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];

  it("swaps two distinct ids, exchanging their positions", () => {
    // 'g' (idx 6, page 2 com ipp 6) ↔ 'b' (idx 1, page 1)
    expect(swapInOrder(ids, "g", "b")).toEqual([
      "a",
      "g",
      "c",
      "d",
      "e",
      "f",
      "b",
      "h",
    ]);
  });

  it("is order-independent for the two ids", () => {
    expect(swapInOrder(ids, "g", "b")).toEqual(swapInOrder(ids, "b", "g"));
  });

  it("returns an unchanged copy when the ids are equal", () => {
    const out = swapInOrder(ids, "c", "c");
    expect(out).toEqual(ids);
    expect(out).not.toBe(ids);
  });

  it("returns an unchanged copy when an id is missing", () => {
    expect(swapInOrder(ids, "a", "zzz")).toEqual(ids);
  });
});
