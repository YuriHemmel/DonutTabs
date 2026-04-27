import type { Tab } from "../core/types/Tab";

const LUCIDE_PREFIX = "lucide:";

/**
 * Filtra abas por substring case-insensitive em `name` + `icon`. Tokens
 * `lucide:Coffee` são detalhe de implementação (nome do componente
 * lucide-react), não user-facing — são ignorados no match para evitar
 * resultados confusos quando o user busca a substring "coffee".
 *
 * Query vazia ou só whitespace retorna a lista intacta na ordem original.
 */
export function searchTabs(tabs: Tab[], query: string): Tab[] {
  const q = query.trim().toLowerCase();
  if (!q) return tabs;
  return tabs.filter((tab) => {
    const name = (tab.name ?? "").toLowerCase();
    const rawIcon = tab.icon ?? "";
    const icon = rawIcon.startsWith(LUCIDE_PREFIX) ? "" : rawIcon.toLowerCase();
    return name.includes(q) || icon.includes(q);
  });
}
