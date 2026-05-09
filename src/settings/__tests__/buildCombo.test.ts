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
});
