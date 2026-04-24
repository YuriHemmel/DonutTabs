import type { Theme } from "./types/Theme";

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
