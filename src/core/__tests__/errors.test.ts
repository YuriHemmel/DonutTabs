import { describe, it, expect, beforeAll } from "vitest";
import { translateAppError, isAppError } from "../errors";
import { createI18n } from "../i18n";
import type { i18n as I18n } from "i18next";

let i18nPt: I18n;
let i18nEn: I18n;

beforeAll(async () => {
  i18nPt = await createI18n("pt-BR");
  i18nEn = await createI18n("en");
});

describe("isAppError", () => {
  it("accepts the shape {kind, message: {code, context}}", () => {
    expect(
      isAppError({ kind: "config", message: { code: "x", context: {} } }),
    ).toBe(true);
  });

  it("rejects unrelated shapes", () => {
    expect(isAppError("string")).toBe(false);
    expect(isAppError({ random: true })).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
  });
});

describe("translateAppError", () => {
  it("translates config.items_per_page_out_of_range with interpolation", () => {
    const err = {
      kind: "config",
      message: { code: "items_per_page_out_of_range", context: { got: "99" } },
    };
    const pt = translateAppError(err, i18nPt.t.bind(i18nPt));
    const en = translateAppError(err, i18nEn.t.bind(i18nEn));
    expect(pt).toContain("99");
    expect(en).toContain("99");
    expect(pt).not.toBe(en);
  });

  it("translates launcher.tab_not_found with id interpolation", () => {
    const err = {
      kind: "launcher",
      message: { code: "tab_not_found", context: { id: "abc123" } },
    };
    expect(translateAppError(err, i18nPt.t.bind(i18nPt))).toContain("abc123");
    expect(translateAppError(err, i18nEn.t.bind(i18nEn))).toContain("abc123");
  });

  it("falls back to errors.{kind}.unknown when code is unmapped", () => {
    const err = {
      kind: "config",
      message: { code: "totally_made_up", context: {} },
    };
    const text = translateAppError(err, i18nPt.t.bind(i18nPt));
    expect(text).toContain("totally_made_up");
  });

  it("falls back to errors.fallback for non-AppError input", () => {
    const text = translateAppError("random string", i18nPt.t.bind(i18nPt));
    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain("errors.fallback");
  });

  it("falls back to errors.fallback for null input", () => {
    const text = translateAppError(null, i18nPt.t.bind(i18nPt));
    expect(text.length).toBeGreaterThan(0);
  });

  it("localizes the `kind` context for path_empty (PT)", () => {
    const fileErr = {
      kind: "config",
      message: {
        code: "path_empty",
        context: { tabId: "t1", profileId: "p1", kind: "file" },
      },
    };
    const folderErr = {
      kind: "config",
      message: {
        code: "path_empty",
        context: { tabId: "t1", profileId: "p1", kind: "folder" },
      },
    };
    expect(translateAppError(fileErr, i18nPt.t.bind(i18nPt))).toContain(
      "Arquivo",
    );
    expect(translateAppError(folderErr, i18nPt.t.bind(i18nPt))).toContain(
      "Pasta",
    );
  });

  it("localizes the `kind` context for path_empty (EN)", () => {
    const folderErr = {
      kind: "config",
      message: {
        code: "path_empty",
        context: { tabId: "t1", profileId: "p1", kind: "folder" },
      },
    };
    expect(translateAppError(folderErr, i18nEn.t.bind(i18nEn))).toContain(
      "Folder",
    );
  });
});
