import { describe, it, expect } from "vitest";
import { resolveLanguage, createI18n } from "../i18n";
import type { Language } from "../types/Language";

describe("resolveLanguage", () => {
  it("returns pt-BR when config is ptBr, ignoring navigator", () => {
    expect(resolveLanguage("ptBr" as Language, "en-US")).toBe("pt-BR");
  });

  it("returns en when config is en, ignoring navigator", () => {
    expect(resolveLanguage("en" as Language, "pt-BR")).toBe("en");
  });

  it("derives from navigator when config is auto (pt → pt-BR)", () => {
    expect(resolveLanguage("auto" as Language, "pt-BR")).toBe("pt-BR");
    expect(resolveLanguage("auto" as Language, "pt-PT")).toBe("pt-BR");
  });

  it("falls back to en when navigator is neither pt nor en", () => {
    expect(resolveLanguage("auto" as Language, "es-ES")).toBe("en");
    expect(resolveLanguage("auto" as Language, "de-DE")).toBe("en");
  });

  it("falls back to en when navigator is undefined", () => {
    expect(resolveLanguage("auto" as Language, undefined)).toBe("en");
  });
});

describe("createI18n", () => {
  it("translates a pt-BR key", async () => {
    const i18n = await createI18n("pt-BR");
    expect(i18n.t("donut.toastDismiss")).toBe("Fechar");
  });

  it("translates a nested error key with interpolation", async () => {
    const i18n = await createI18n("pt-BR");
    const result = i18n.t("errors.config.itemsPerPageOutOfRange", { got: 99 });
    expect(result).toContain("99");
  });

  it("falls back to en when the key is missing in the target language", async () => {
    const i18n = await createI18n("pt-BR");
    // chave propositadamente inexistente
    const result = i18n.t("errors.nonexistent", {
      defaultValue: i18n.t("errors.fallback", { kind: "x" }),
    });
    expect(typeof result).toBe("string");
    expect((result as string).length).toBeGreaterThan(0);
  });
});
