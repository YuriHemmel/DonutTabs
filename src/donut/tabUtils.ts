import type { Tab } from "../core/types/Tab";

/**
 * Retorna a inicial do nome para fallback de ícone.
 * Trata grafemas multi-codepoint via `Array.from`.
 */
export function tabInitial(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return "?";
  return Array.from(trimmed)[0]?.toUpperCase() ?? "?";
}

export const isGroup = (tab: Tab): boolean => tab.kind === "group";
