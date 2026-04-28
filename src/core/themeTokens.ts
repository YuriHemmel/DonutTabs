import type { ThemeOverrides } from "./types/ThemeOverrides";
import type { Theme } from "./types/Theme";

/**
 * Conjunto resolvido de tokens visuais que o donut usa pra desenhar.
 * Cada campo já está concreto: cores hex, ratios numéricos, alpha em [0,1].
 * Originado de `resolvePresetTokens(preset)` e ajustado por `mergeOverrides`.
 */
export interface ThemeTokens {
  colors: {
    sliceFill: string;
    sliceHighlight: string;
    sliceStroke: string;
    centerFill: string;
    text: string;
  };
  dimensions: {
    innerRatio: number;
    outerRatio: number;
  };
  alpha: {
    overlay: number;
  };
}

/** Preset concreto — `auto` tem que ser resolvido pra dark/light antes. */
export type ResolvedPreset = "dark" | "light";

const DARK_TOKENS: Readonly<ThemeTokens> = Object.freeze({
  colors: {
    sliceFill: "#1b2436",
    sliceHighlight: "#2a3b5a",
    sliceStroke: "#3a4968",
    centerFill: "#141a28",
    text: "#eaeaea",
  },
  dimensions: { innerRatio: 0.22, outerRatio: 0.46 },
  alpha: { overlay: 1.0 },
});

const LIGHT_TOKENS: Readonly<ThemeTokens> = Object.freeze({
  colors: {
    sliceFill: "#e8edf5",
    sliceHighlight: "#c7d4ec",
    sliceStroke: "#9aa5be",
    centerFill: "#dbe2ee",
    text: "#1b2436",
  },
  dimensions: { innerRatio: 0.22, outerRatio: 0.46 },
  alpha: { overlay: 1.0 },
});

/**
 * Retorna o tokens base para o preset resolvido. Cada chamada devolve um
 * objeto novo (deep clone das constantes congeladas) para o caller poder
 * mutar livremente sem afetar outros chamadores.
 */
export function resolvePresetTokens(preset: ResolvedPreset): ThemeTokens {
  const src = preset === "light" ? LIGHT_TOKENS : DARK_TOKENS;
  return {
    colors: { ...src.colors },
    dimensions: { ...src.dimensions },
    alpha: { ...src.alpha },
  };
}

/**
 * Aplica overrides em cima do tokens base. Campos `null`/`undefined` no
 * override são ignorados (o tokens base sobrevive). Campos definidos
 * sobrescrevem por inteiro o respectivo campo. Overrides == `null` retorna
 * o base inalterado (também clonado pra evitar aliasing acidental).
 */
export function mergeOverrides(
  base: ThemeTokens,
  overrides: ThemeOverrides | null,
): ThemeTokens {
  const result: ThemeTokens = {
    colors: { ...base.colors },
    dimensions: { ...base.dimensions },
    alpha: { ...base.alpha },
  };
  if (!overrides) return result;
  if (overrides.colors) {
    if (overrides.colors.sliceFill != null) {
      result.colors.sliceFill = overrides.colors.sliceFill;
    }
    if (overrides.colors.sliceHighlight != null) {
      result.colors.sliceHighlight = overrides.colors.sliceHighlight;
    }
    if (overrides.colors.sliceStroke != null) {
      result.colors.sliceStroke = overrides.colors.sliceStroke;
    }
    if (overrides.colors.centerFill != null) {
      result.colors.centerFill = overrides.colors.centerFill;
    }
    if (overrides.colors.text != null) {
      result.colors.text = overrides.colors.text;
    }
  }
  if (overrides.dimensions) {
    if (overrides.dimensions.innerRatio != null) {
      result.dimensions.innerRatio = overrides.dimensions.innerRatio;
    }
    if (overrides.dimensions.outerRatio != null) {
      result.dimensions.outerRatio = overrides.dimensions.outerRatio;
    }
  }
  if (overrides.alpha) {
    if (overrides.alpha.overlay != null) {
      result.alpha.overlay = overrides.alpha.overlay;
    }
  }
  return result;
}

/**
 * Resolve `Theme` (incluindo `auto`) para um preset concreto. `auto` segue o
 * SO via `prefers-color-scheme`. Em ambientes sem `window.matchMedia`
 * (testes/SSR) o fallback é `dark`, alinhado com `resolveTheme()` em
 * `core/theme.ts`.
 */
export function resolvePresetForTheme(theme: Theme): ResolvedPreset {
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

/**
 * Helper "tudo numa só": pega `theme` (preset) + `overrides` e devolve o
 * tokens efetivo. Atalho mais usado no entrypoint dos webviews.
 */
export function resolveThemeTokens(
  theme: Theme,
  overrides: ThemeOverrides | null,
): ThemeTokens {
  const preset = resolvePresetForTheme(theme);
  const base = resolvePresetTokens(preset);
  return mergeOverrides(base, overrides);
}
