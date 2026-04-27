import { describe, it, expect } from "vitest";
import { matchesCombo, parseCombo } from "../matchesCombo";

function evt(
  key: string,
  mods: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {},
): KeyboardEvent {
  return {
    key,
    ctrlKey: mods.ctrl ?? false,
    shiftKey: mods.shift ?? false,
    altKey: mods.alt ?? false,
    metaKey: mods.meta ?? false,
  } as KeyboardEvent;
}

describe("parseCombo", () => {
  it("parses Ctrl+F", () => {
    expect(parseCombo("Ctrl+F", false)).toEqual({
      ctrl: true,
      shift: false,
      alt: false,
      meta: false,
      key: "f",
    });
  });

  it("translates CommandOrControl to ctrl on non-mac", () => {
    expect(parseCombo("CommandOrControl+F", false)).toMatchObject({
      ctrl: true,
      meta: false,
    });
  });

  it("translates CommandOrControl to meta on mac", () => {
    expect(parseCombo("CommandOrControl+F", true)).toMatchObject({
      ctrl: false,
      meta: true,
    });
  });

  it("returns null for empty input", () => {
    expect(parseCombo("", false)).toBeNull();
    expect(parseCombo("   ", false)).toBeNull();
  });

  it("returns null for unknown modifier", () => {
    expect(parseCombo("Hyper+F", false)).toBeNull();
  });

  it("accepts multi-modifier combos", () => {
    expect(parseCombo("Ctrl+Shift+Alt+F", false)).toEqual({
      ctrl: true,
      shift: true,
      alt: true,
      meta: false,
      key: "f",
    });
  });
});

describe("matchesCombo", () => {
  it("matches Ctrl+F on a corresponding event", () => {
    expect(matchesCombo(evt("f", { ctrl: true }), "Ctrl+F", false)).toBe(true);
    expect(matchesCombo(evt("F", { ctrl: true }), "Ctrl+F", false)).toBe(true);
  });

  it("rejects when an extra modifier is pressed", () => {
    expect(
      matchesCombo(evt("f", { ctrl: true, shift: true }), "Ctrl+F", false),
    ).toBe(false);
  });

  it("rejects when a required modifier is missing", () => {
    expect(matchesCombo(evt("f"), "Ctrl+F", false)).toBe(false);
  });

  it("rejects when the key differs", () => {
    expect(matchesCombo(evt("g", { ctrl: true }), "Ctrl+F", false)).toBe(false);
  });

  it("CommandOrControl matches Ctrl on non-mac", () => {
    expect(
      matchesCombo(evt("f", { ctrl: true }), "CommandOrControl+F", false),
    ).toBe(true);
    // ...and rejects Meta there.
    expect(
      matchesCombo(evt("f", { meta: true }), "CommandOrControl+F", false),
    ).toBe(false);
  });

  it("CommandOrControl matches Meta on mac", () => {
    expect(
      matchesCombo(evt("f", { meta: true }), "CommandOrControl+F", true),
    ).toBe(true);
    expect(
      matchesCombo(evt("f", { ctrl: true }), "CommandOrControl+F", true),
    ).toBe(false);
  });

  it("returns false on malformed combo without throwing", () => {
    expect(matchesCombo(evt("f"), "garbage", false)).toBe(false);
    expect(matchesCombo(evt("f"), "", false)).toBe(false);
  });
});
