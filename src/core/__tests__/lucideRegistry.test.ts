import { describe, it, expect } from "vitest";
import { LUCIDE_REGISTRY, LUCIDE_NAMES, getLucideComponent } from "../lucideRegistry";

describe("lucideRegistry", () => {
  it("exposes a non-empty curated list", () => {
    expect(LUCIDE_NAMES.length).toBeGreaterThan(50);
  });

  it("LUCIDE_NAMES matches LUCIDE_REGISTRY keys", () => {
    expect(LUCIDE_NAMES).toEqual(Object.keys(LUCIDE_REGISTRY));
  });

  it("returns the component for a known name", () => {
    expect(getLucideComponent("Coffee")).toBeTruthy();
    expect(getLucideComponent("MessageSquare")).toBeTruthy();
  });

  it("returns null for an unknown name", () => {
    expect(getLucideComponent("DefinitelyNotAnIcon")).toBeNull();
    expect(getLucideComponent("")).toBeNull();
  });
});
