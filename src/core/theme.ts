import type { Theme } from "./types/Theme";
import type { ThemeTokens } from "./themeTokens";

export type ResolvedTheme = "dark" | "light";

/**
 * Resolve o valor efetivo do tema considerando o `auto` (segue o SO).
 */
export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  // auto
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/**
 * Aplica o tema no `<html data-theme="...">`. CSS tokens cuidam do resto.
 */
export function applyTheme(theme: Theme): ResolvedTheme {
  const resolved = resolveTheme(theme);
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", resolved);
  }
  return resolved;
}

/**
 * Quando o tema é `auto`, instala um listener no `prefers-color-scheme` para
 * reaplicar o tema quando o SO mudar. Retorna um `unsubscribe` a ser chamado
 * antes de instalar outro listener (ex: o usuário mudou de auto → dark).
 */
export function watchSystemTheme(theme: Theme, onSystemChange: () => void): () => void {
  if (theme !== "auto") return () => {};
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  const handler = () => onSystemChange();
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}

/**
 * Plano 15 — escreve os tokens visuais como CSS custom properties em
 * `:root`. Usado para que CSS de Settings (HTML) reaja a mudanças de tema
 * sem precisar passar tokens via prop. SVG do donut consome via React
 * Context (mais direto e tipado para `fill`/`stroke` inline).
 *
 * Vars expostas:
 * - `--donut-slice-fill`, `--donut-slice-highlight`, `--donut-slice-stroke`
 * - `--donut-center-fill`, `--donut-text`
 * - `--donut-overlay-alpha`
 * - `--donut-inner-ratio`, `--donut-outer-ratio`
 */
export function applyTokensAsCssVars(tokens: ThemeTokens): void {
  if (typeof document === "undefined") return;
  const s = document.documentElement.style;
  s.setProperty("--donut-slice-fill", tokens.colors.sliceFill);
  s.setProperty("--donut-slice-highlight", tokens.colors.sliceHighlight);
  s.setProperty("--donut-slice-stroke", tokens.colors.sliceStroke);
  s.setProperty("--donut-center-fill", tokens.colors.centerFill);
  s.setProperty("--donut-text", tokens.colors.text);
  s.setProperty("--donut-overlay-alpha", String(tokens.alpha.overlay));
  s.setProperty("--donut-inner-ratio", String(tokens.dimensions.innerRatio));
  s.setProperty("--donut-outer-ratio", String(tokens.dimensions.outerRatio));
}
