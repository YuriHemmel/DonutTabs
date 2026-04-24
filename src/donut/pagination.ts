import type { Tab } from "../core/types/Tab";

export interface Page {
  tabs: Tab[];
  hasPlus: boolean;
}

/**
 * Distribui as abas em páginas seguindo a regra do `Plano.md` 5.6:
 *   "+ é sempre a última fatia da última página. Se a última página está
 *    cheia de abas normais, uma nova página é criada contendo apenas '+'."
 *
 * Exemplos com `itemsPerPage = 6`:
 *   0 abas  → [ {tabs:[], hasPlus:true} ]
 *   3 abas  → [ {tabs:[a,b,c], hasPlus:true} ]
 *   6 abas  → [ {tabs:[a..f], hasPlus:false}, {tabs:[], hasPlus:true} ]
 *   7 abas  → [ {tabs:[a..f], hasPlus:false}, {tabs:[g], hasPlus:true} ]
 *  12 abas  → [ {tabs:[a..f], hasPlus:false}, {tabs:[g..l], hasPlus:false}, {tabs:[], hasPlus:true} ]
 */
export function paginate(tabs: Tab[], itemsPerPage: number): Page[] {
  if (tabs.length === 0) return [{ tabs: [], hasPlus: true }];

  const pages: Page[] = [];
  let i = 0;
  while (i < tabs.length) {
    const remaining = tabs.length - i;
    if (remaining < itemsPerPage) {
      // último pedaço cabe junto com o "+"
      pages.push({ tabs: tabs.slice(i, i + remaining), hasPlus: true });
      i += remaining;
    } else if (remaining === itemsPerPage) {
      // último pedaço enche a página; "+" ganha página própria
      pages.push({ tabs: tabs.slice(i, i + itemsPerPage), hasPlus: false });
      pages.push({ tabs: [], hasPlus: true });
      i += itemsPerPage;
    } else {
      // página intermediária cheia de abas
      pages.push({ tabs: tabs.slice(i, i + itemsPerPage), hasPlus: false });
      i += itemsPerPage;
    }
  }
  return pages;
}
