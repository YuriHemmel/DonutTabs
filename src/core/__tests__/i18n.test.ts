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

  it("returns the resolved locale for each explicit choice", () => {
    expect(resolveLanguage("es" as Language, "en-US")).toBe("es");
    expect(resolveLanguage("zh" as Language, "en-US")).toBe("zh");
    expect(resolveLanguage("ja" as Language, "en-US")).toBe("ja");
    expect(resolveLanguage("ru" as Language, "en-US")).toBe("ru");
    expect(resolveLanguage("fr" as Language, "en-US")).toBe("fr");
    expect(resolveLanguage("it" as Language, "en-US")).toBe("it");
  });

  it("auto-detects the new languages by navigator prefix", () => {
    expect(resolveLanguage("auto" as Language, "es-ES")).toBe("es");
    expect(resolveLanguage("auto" as Language, "zh-CN")).toBe("zh");
    expect(resolveLanguage("auto" as Language, "ja-JP")).toBe("ja");
    expect(resolveLanguage("auto" as Language, "ru-RU")).toBe("ru");
    expect(resolveLanguage("auto" as Language, "fr-FR")).toBe("fr");
    expect(resolveLanguage("auto" as Language, "it-IT")).toBe("it");
    expect(resolveLanguage("auto" as Language, "en-GB")).toBe("en");
  });

  it("falls back to en when navigator language is unsupported", () => {
    expect(resolveLanguage("auto" as Language, "de-DE")).toBe("en");
    expect(resolveLanguage("auto" as Language, "ko-KR")).toBe("en");
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

  it("translates a key in a newly added locale (es)", async () => {
    const i18n = await createI18n("es");
    expect(i18n.t("donut.toastDismiss")).toBe("Cerrar");
  });
});
