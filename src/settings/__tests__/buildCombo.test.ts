import { describe, it, expect } from "vitest";
import { buildCombo } from "../buildCombo";

type Evt = Parameters<typeof buildCombo>[0];
const fake = (over: Partial<Evt>): Evt => ({
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  key: "",
  code: "",
  ...over,
});

describe("buildCombo", () => {
  it("Ctrl+Shift+Space", () => {
    expect(buildCombo(fake({ ctrlKey: true, shiftKey: true, key: " " }))).toMatchObject({
      combo: "CommandOrControl+Shift+Space",
      error: null,
    });
  });

  it("Ctrl+A (lowercase a normalized to uppercase)", () => {
    expect(buildCombo(fake({ ctrlKey: true, key: "a" }))).toMatchObject({
      combo: "CommandOrControl+A",
      error: null,
    });
  });

  it("Alt+ArrowUp → Alt+Up", () => {
    expect(buildCombo(fake({ altKey: true, key: "ArrowUp" }))).toMatchObject({
      combo: "Alt+Up",
      error: null,
    });
  });

  it("Meta+Shift+F (Mac-style)", () => {
    expect(buildCombo(fake({ metaKey: true, shiftKey: true, key: "f" }))).toMatchObject({
      combo: "CommandOrControl+Shift+F",
      error: null,
    });
  });

  it("Ctrl+Alt+Shift+F5", () => {
    expect(
      buildCombo(fake({ ctrlKey: true, altKey: true, shiftKey: true, key: "F5" })),
    ).toMatchObject({ combo: "CommandOrControl+Alt+Shift+F5", error: null });
  });

  it("plain letter without modifier is rejected (footgun)", () => {
    expect(buildCombo(fake({ key: "a" }))).toMatchObject({
      combo: null,
      error: "noModifier",
      context: { key: "A" },
    });
  });

  it("plain digit without modifier is rejected (footgun)", () => {
    expect(buildCombo(fake({ key: "5" }))).toMatchObject({
      combo: null,
      error: "noModifier",
      context: { key: "5" },
    });
  });

  it("plain F-key without modifier is allowed", () => {
    expect(buildCombo(fake({ key: "F12" }))).toMatchObject({
      combo: "F12",
      error: null,
    });
  });

  it("plain Space without modifier is allowed", () => {
    expect(buildCombo(fake({ key: " " }))).toMatchObject({
      combo: "Space",
      error: null,
    });
  });

  it("plain ArrowUp without modifier is allowed", () => {
    expect(buildCombo(fake({ key: "ArrowUp" }))).toMatchObject({
      combo: "Up",
      error: null,
    });
  });

  it("Shift+A is allowed (any modifier unblocks alphanumeric)", () => {
    expect(buildCombo(fake({ shiftKey: true, key: "a" }))).toMatchObject({
      combo: "Shift+A",
      error: null,
    });
  });

  it("reserved: Ctrl+Enter", () => {
    expect(buildCombo(fake({ ctrlKey: true, key: "Enter" }))).toMatchObject({
      combo: null,
      error: "reservedKey",
      context: { key: "Enter" },
    });
  });

  it("reserved: Ctrl+Tab", () => {
    expect(buildCombo(fake({ ctrlKey: true, key: "Tab" }))).toMatchObject({
      combo: null,
      error: "reservedKey",
    });
  });

  it("reserved: bare Escape", () => {
    expect(buildCombo(fake({ key: "Escape" }))).toMatchObject({
      error: "reservedKey",
    });
  });

  it("modifier-only keydown (key='Control') returns null without error", () => {
    expect(buildCombo(fake({ ctrlKey: true, key: "Control" }))).toEqual({
      combo: null,
      error: null,
    });
  });

  it("modifier-only keydown (key='Shift')", () => {
    expect(buildCombo(fake({ shiftKey: true, key: "Shift" }))).toEqual({
      combo: null,
      error: null,
    });
  });

  // Issue #81 — dead-key composition on Mac (Option+letter) and AltGr on
  // Linux/Windows produce composed characters in `e.key` that the muda
  // parser rejects. The fix is to prefer `e.code` (physical key) over
  // `e.key` (composed character).
  it("Mac Option+C: e.key='Ç' but e.code='KeyC' resolves to Alt+C", () => {
    expect(
      buildCombo(fake({ altKey: true, key: "Ç", code: "KeyC" })),
    ).toMatchObject({ combo: "Alt+C", error: null });
  });

  it("Mac Option+E (dead key): e.key='Dead'/'´' with e.code='KeyE' → Alt+E", () => {
    expect(
      buildCombo(fake({ altKey: true, key: "Dead", code: "KeyE" })),
    ).toMatchObject({ combo: "Alt+E", error: null });
    expect(
      buildCombo(fake({ altKey: true, key: "´", code: "KeyE" })),
    ).toMatchObject({ combo: "Alt+E", error: null });
  });

  it("Mac Option+Shift+8: e.key='°' but e.code='Digit8' → Alt+Shift+8", () => {
    expect(
      buildCombo(fake({ altKey: true, shiftKey: true, key: "°", code: "Digit8" })),
    ).toMatchObject({ combo: "Alt+Shift+8", error: null });
  });

  it("Linux AltGr+E: e.key='€' with e.code='KeyE' (ctrlKey+altKey) → CommandOrControl+Alt+E", () => {
    expect(
      buildCombo(fake({ ctrlKey: true, altKey: true, key: "€", code: "KeyE" })),
    ).toMatchObject({ combo: "CommandOrControl+Alt+E", error: null });
  });

  it("regression: Ctrl+A with empty e.code still uses e.key path", () => {
    expect(
      buildCombo(fake({ ctrlKey: true, key: "a", code: "" })),
    ).toMatchObject({ combo: "CommandOrControl+A", error: null });
  });
});
