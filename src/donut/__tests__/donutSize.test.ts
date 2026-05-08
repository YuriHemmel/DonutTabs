import { describe, it, expect } from "vitest";
import {
  DONUT_BASE_SIZE,
  DONUT_RING_INCREMENT,
  DONUT_MAX_RINGS,
  donutSizeForRings,
  donutSizeForTabs,
  maxGroupDepth,
} from "../donutSize";
import type { Tab } from "../../core/types/Tab";

const leaf = (id: string): Tab => ({
  id,
  name: id,
  icon: null,
  order: 0,
  openMode: "reuseOrNewWindow",
  items: [{ kind: "url", value: "https://x", openWith: null, monitor: null }],
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

describe("maxGroupDepth", () => {
  it("returns 1 for empty tabs", () => {
    expect(maxGroupDepth([])).toBe(1);
  });
  it("returns 1 for leaves only", () => {
    expect(maxGroupDepth([leaf("a"), leaf("b")])).toBe(1);
  });
  it("returns 2 for one group level", () => {
    expect(maxGroupDepth([leaf("a"), group("g", [leaf("g1")])])).toBe(2);
  });
  it("returns 3 for nested groups", () => {
    expect(maxGroupDepth([group("g1", [group("g2", [leaf("l")])])])).toBe(3);
  });
  it("picks the deepest branch", () => {
    expect(
      maxGroupDepth([
        leaf("shallow"),
        group("g", [leaf("g1")]),
        group("deep", [group("inner", [leaf("l")])]),
      ]),
    ).toBe(3);
  });
  it("counts empty group as 2 (drillable for + slice)", () => {
    expect(maxGroupDepth([group("empty", [])])).toBe(2);
  });
});

describe("donutSizeForRings", () => {
  it("clamps lower to BASE", () => {
    expect(donutSizeForRings(0)).toBe(DONUT_BASE_SIZE);
    expect(donutSizeForRings(1)).toBe(DONUT_BASE_SIZE);
  });
  it("grows per ring", () => {
    expect(donutSizeForRings(2)).toBe(DONUT_BASE_SIZE + DONUT_RING_INCREMENT);
  });
  it("clamps upper to MAX_RINGS", () => {
    // Issue #39: MAX_RINGS reduzido pra 2.
    const max = donutSizeForRings(DONUT_MAX_RINGS);
    expect(donutSizeForRings(3)).toBe(max);
    expect(donutSizeForRings(99)).toBe(max);
  });
});

describe("donutSizeForTabs", () => {
  it("returns BASE size for leaves only", () => {
    expect(donutSizeForTabs([leaf("a")])).toBe(DONUT_BASE_SIZE);
  });
  it("returns BASE + 1*increment for one-level groups", () => {
    expect(donutSizeForTabs([group("g", [leaf("g1")])])).toBe(
      DONUT_BASE_SIZE + DONUT_RING_INCREMENT,
    );
  });
  it("clamps deeper-than-MAX nesting to MAX", () => {
    // Issue #39: validação rejeita configs com depth > 2, mas o helper de
    // tamanho clamp pra MAX_RINGS pra ser robusto a configs malformados.
    expect(donutSizeForTabs([group("g1", [group("g2", [leaf("l")])])])).toBe(
      DONUT_BASE_SIZE + DONUT_RING_INCREMENT,
    );
  });
});
