import i18next, { type i18n as I18nInstance } from "i18next";
import { initReactI18next } from "react-i18next";
import ptBr from "../locales/pt-BR.json";
import en from "../locales/en.json";
import type { Language } from "./types/Language";

export type ResolvedLocale = "pt-BR" | "en";

const resources = {
  "pt-BR": { translation: ptBr },
  en: { translation: en },
} as const;

/**
 * Resolve o locale efetivo a partir da preferência do config e do idioma do navegador.
 * - `ptBr` / `en` → uso direto.
 * - `auto` → navigator.language começando com "pt" → pt-BR; caso contrário en.
 */
export function resolveLanguage(
  configLanguage: Language,
  navigatorLanguage: string | undefined,
): ResolvedLocale {
  if (configLanguage === "ptBr") return "pt-BR";
  if (configLanguage === "en") return "en";
  if (navigatorLanguage && navigatorLanguage.toLowerCase().startsWith("pt")) {
    return "pt-BR";
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
