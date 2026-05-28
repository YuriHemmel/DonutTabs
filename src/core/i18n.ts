import i18next, { type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import ptBr from "../locales/pt-BR.json";
import en from "../locales/en.json";
import es from "../locales/es.json";
import zh from "../locales/zh.json";
import ja from "../locales/ja.json";
import ru from "../locales/ru.json";
import fr from "../locales/fr.json";
import it from "../locales/it.json";
import type { Language } from "./types/Language";

export type ResolvedLocale =
  | "pt-BR"
  | "en"
  | "es"
  | "zh"
  | "ja"
  | "ru"
  | "fr"
  | "it";

const resources = {
  "pt-BR": { translation: ptBr },
  en: { translation: en },
  es: { translation: es },
  zh: { translation: zh },
  ja: { translation: ja },
  ru: { translation: ru },
  fr: { translation: fr },
  it: { translation: it },
} as const;

/** Escolha explícita de idioma (config) → locale efetivo. */
const EXPLICIT_LOCALE: Record<Exclude<Language, "auto">, ResolvedLocale> = {
  ptBr: "pt-BR",
  en: "en",
  es: "es",
  zh: "zh",
  ja: "ja",
  ru: "ru",
  fr: "fr",
  it: "it",
};

/**
 * Prefixos de `navigator.language` → locale efetivo no modo `auto`.
 * A ordem não importa (cada prefixo é exclusivo). Idiomas não listados
 * caem no fallback inglês.
 */
const AUTO_PREFIX: ReadonlyArray<[string, ResolvedLocale]> = [
  ["pt", "pt-BR"],
  ["es", "es"],
  ["zh", "zh"],
  ["ja", "ja"],
  ["ru", "ru"],
  ["fr", "fr"],
  ["it", "it"],
  ["en", "en"],
];

/**
 * Resolve o locale efetivo a partir da preferência do config e do idioma do navegador.
 * - Idioma explícito (`ptBr`, `en`, `es`, …) → uso direto.
 * - `auto` → detecta pelo prefixo de `navigator.language`; qualquer idioma
 *   não suportado (ou ausente) cai no fallback inglês.
 */
export function resolveLanguage(
  configLanguage: Language,
  navigatorLanguage: string | undefined,
): ResolvedLocale {
  if (configLanguage !== "auto") return EXPLICIT_LOCALE[configLanguage];
  const lower = navigatorLanguage?.toLowerCase() ?? "";
  for (const [prefix, locale] of AUTO_PREFIX) {
    if (lower.startsWith(prefix)) return locale;
  }
  return "en";
}

/**
 * Cria uma instância isolada do i18next. Usada em testes; em produção,
 * `initI18n` configura a instância global que `useTranslation` consome.
 */
export async function createI18n(locale: ResolvedLocale): Promise<I18nInstance> {
  const instance = i18next.createInstance();
  await instance.init({
    resources,
    lng: locale,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });
  return instance;
}

/**
 * Inicializa a instância global do i18next. Deve ser chamada uma vez no
 * entrypoint de cada janela, antes do render do React.
 */
export async function initI18n(configLanguage: Language): Promise<ResolvedLocale> {
  const locale = resolveLanguage(
    configLanguage,
    typeof navigator !== "undefined" ? navigator.language : undefined,
  );
  await i18next.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });
  return locale;
}

/**
 * Troca o idioma em runtime (preparado para o seletor de idioma do Plano 3).
 */
export async function changeLanguage(configLanguage: Language): Promise<ResolvedLocale> {
  const locale = resolveLanguage(
    configLanguage,
    typeof navigator !== "undefined" ? navigator.language : undefined,
  );
  await i18next.changeLanguage(locale);
  return locale;
}
