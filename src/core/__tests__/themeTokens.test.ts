import { describe, expect, it } from "vitest";
import {
  mergeOverrides,
  resolvePresetForTheme,
  resolvePresetTokens,
  resolveThemeTokens,
  type ThemeTokens,
} from "../themeTokens";
import { applyTokensAsCssVars } from "../theme";
import type { ThemeOverrides } from "../types/ThemeOverrides";

describe("resolvePresetTokens", () => {
  it("dark preset has known colors", () => {
    const t = resolvePresetTokens("dark");
    expect(t.colors.sliceFill).toBe("#1b2436");
    expect(t.colors.sliceHighlight).toBe("#2a3b5a");
    expect(t.colors.sliceStroke).toBe("#3a4968");
    expect(t.colors.text).toBe("#eaeaea");
  });

  it("light preset has different colors than dark", () => {
    const dark = resolvePresetTokens("dark");
    const light = resolvePresetTokens("light");
    expect(light.colors.sliceFill).not.toBe(dark.colors.sliceFill);
    expect(light.colors.text).not.toBe(dark.colors.text);
  });

  it("default dimensions are the historical 0.22 / 0.46", () => {
    const t = resolvePresetTokens("dark");
    expect(t.dimensions.innerRatio).toBe(0.22);
    expect(t.dimensions.outerRatio).toBe(0.46);
  });

  it("default overlay alpha is 1.0", () => {
    const t = resolvePresetTokens("dark");
    expect(t.alpha.overlay).toBe(1.0);
  });

  it("returns a fresh object on each call (no shared references)", () => {
    const a = resolvePresetTokens("dark");
    const b = resolvePresetTokens("dark");
    expect(a).not.toBe(b);
    expect(a.colors).not.toBe(b.colors);
    a.colors.sliceFill = "#000000";
    expect(b.colors.sliceFill).toBe("#1b2436");
  });
});

describe("mergeOverrides", () => {
  const base = (): ThemeTokens => resolvePresetTokens("dark");

  it("returns a clone of base when overrides is null", () => {
    const b = base();
    const merged = mergeOverrides(b, null);
    expect(merged).toEqual(b);
    expect(merged).not.toBe(b);
    expect(merged.colors).not.toBe(b.colors);
  });

  it("partial color override only replaces the named field", () => {
    const overrides: ThemeOverrides = {
      colors: {
        sliceFill: "#abcdef",
        sliceHighlight: null,
        sliceStroke: null,
        centerFill: null,
        text: null,
      },
      dimensions: null,
      alpha: null,
    };
    const merged = mergeOverrides(base(), overrides);
    expect(merged.colors.sliceFill).toBe("#abcdef");
    expect(merged.colors.sliceHighlight).toBe("#2a3b5a");
    expect(merged.colors.text).toBe("#eaeaea");
  });

  it("dimension override of innerRatio leaves outerRatio at base", () => {
    const overrides: ThemeOverrides = {
      colors: null,
      dimensions: { innerRatio: 0.3, outerRatio: null },
      alpha: null,
    };
    const merged = mergeOverrides(base(), overrides);
    expect(merged.dimensions.innerRatio).toBe(0.3);
    expect(merged.dimensions.outerRatio).toBe(0.46);
  });

  it("alpha override sets overlay; base alpha untouched when null", () => {
    const overrides: ThemeOverrides = {
      colors: null,
      dimensions: null,
      alpha: { overlay: 0.5 },
    };
    const merged = mergeOverrides(base(), overrides);
    expect(merged.alpha.overlay).toBe(0.5);
  });

  it("does not mutate the base argument", () => {
    const b = base();
    const original = JSON.parse(JSON.stringify(b));
    mergeOverrides(b, {
      colors: {
        sliceFill: "#111111",
        sliceHighlight: null,
        sliceStroke: null,
        centerFill: null,
        text: null,
      },
      dimensions: null,
      alpha: null,
    });
    expect(b).toEqual(original);
  });

  it("ignores empty subgroups (all-null fields)", () => {
    const overrides: ThemeOverrides = {
      colors: {
        sliceFill: null,
        sliceHighlight: null,
        sliceStroke: null,
        centerFill: null,
        text: null,
      },
      dimensions: { innerRatio: null, outerRatio: null },
      alpha: { overlay: null },
    };
    const merged = mergeOverrides(base(), overrides);
    expect(merged).toEqual(base());
  });
});

describe("resolvePresetForTheme", () => {
  it("dark/light pass through directly", () => {
    expect(resolvePresetForTheme("dark")).toBe("dark");
    expect(resolvePresetForTheme("light")).toBe("light");
  });

  it("auto resolves via matchMedia when available", () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: q.includes("light"),
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    expect(resolvePresetForTheme("auto")).toBe("light");
    window.matchMedia = original;
  });
});

describe("resolveThemeTokens", () => {
  it("combines preset and overrides in one call", () => {
    const tokens = resolveThemeTokens("dark", {
      colors: {
        sliceFill: "#deadbe",
        sliceHighlight: null,
        sliceStroke: null,
        centerFill: null,
        text: null,
      },
      dimensions: null,
      alpha: null,
    });
    expect(tokens.colors.sliceFill).toBe("#deadbe");
    expect(tokens.colors.sliceHighlight).toBe("#2a3b5a");
  });

  it("returns full preset when overrides is null", () => {
    const tokens = resolveThemeTokens("light", null);
    expect(tokens).toEqual(resolvePresetTokens("light"));
  });
});

describe("applyTokensAsCssVars", () => {
  it("writes all 8 vars on documentElement", () => {
    const tokens: ThemeTokens = {
      colors: {
        sliceFill: "#111111",
        sliceHighlight: "#222222",
        sliceStroke: "#333333",
        centerFill: "#444444",
        text: "#555555",
      },
      dimensions: { innerRatio: 0.25, outerRatio: 0.48 },
      alpha: { overlay: 0.7 },
    };
    applyTokensAsCssVars(tokens);
    const s = document.documentElement.style;
    expect(s.getPropertyValue("--donut-slice-fill")).toBe("#111111");
    expect(s.getPropertyValue("--donut-slice-highlight")).toBe("#222222");
    expect(s.getPropertyValue("--donut-slice-stroke")).toBe("#333333");
    expect(s.getPropertyValue("--donut-center-fill")).toBe("#444444");
    expect(s.getPropertyValue("--donut-text")).toBe("#555555");
    expect(s.getPropertyValue("--donut-overlay-alpha")).toBe("0.7");
    expect(s.getPropertyValue("--donut-inner-ratio")).toBe("0.25");
    expect(s.getPropertyValue("--donut-outer-ratio")).toBe("0.48");
  });

  it("overwrites previously set vars on subsequent calls", () => {
    applyTokensAsCssVars(resolvePresetTokens("dark"));
    expect(document.documentElement.style.getPropertyValue("--donut-text")).toBe(
      "#eaeaea",
    );
    applyTokensAsCssVars(resolvePresetTokens("light"));
    expect(document.documentElement.style.getPropertyValue("--donut-text")).toBe(
      "#1b2436",
    );
  });
});
