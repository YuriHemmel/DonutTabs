import type { Language } from "../core/types/Language";

/** Ordem canônica das opções de idioma; `labelKey` resolve via t(). */
export const LANGUAGE_OPTIONS: ReadonlyArray<{ value: Language; labelKey: string }> = [
  { value: "auto", labelKey: "settings.appearance.languageAuto" },
  { value: "ptBr", labelKey: "settings.appearance.languagePtBr" },
  { value: "en", labelKey: "settings.appearance.languageEn" },
  { value: "es", labelKey: "settings.appearance.languageEs" },
  { value: "zh", labelKey: "settings.appearance.languageZh" },
  { value: "ja", labelKey: "settings.appearance.languageJa" },
  { value: "ru", labelKey: "settings.appearance.languageRu" },
  { value: "fr", labelKey: "settings.appearance.languageFr" },
  { value: "it", labelKey: "settings.appearance.languageIt" },
];
