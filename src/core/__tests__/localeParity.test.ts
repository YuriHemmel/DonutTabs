import { describe, it, expect } from "vitest";
import en from "../../locales/en.json";
import ptBr from "../../locales/pt-BR.json";
import es from "../../locales/es.json";
import zh from "../../locales/zh.json";
import ja from "../../locales/ja.json";
import ru from "../../locales/ru.json";
import fr from "../../locales/fr.json";
import itLocale from "../../locales/it.json";

type Json = Record<string, unknown>;

/** Coleta todas as chaves "folha" (valores string) em notação pontilhada. */
function flatten(obj: Json, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v !== null && typeof v === "object") {
      keys.push(...flatten(v as Json, path));
    } else {
      keys.push(path);
    }
  }
  return keys;
}

/**
 * Remove o sufixo de pluralização do i18next (`_one`, `_other`, `_few`, …)
 * para que variantes de plural específicas de um idioma (ex.: russo) não
 * sejam tratadas como chaves estranhas.
 */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
function basePluralKey(key: string): string {
  return key.replace(PLURAL_SUFFIX, "");
}

const enKeys = flatten(en as Json);
const enKeySet = new Set(enKeys);
const enBaseSet = new Set(enKeys.map(basePluralKey));

const locales: ReadonlyArray<[string, Json]> = [
  ["pt-BR", ptBr as Json],
  ["es", es as Json],
  ["zh", zh as Json],
  ["ja", ja as Json],
  ["ru", ru as Json],
  ["fr", fr as Json],
  ["it", itLocale as Json],
];

describe("locale parity with en.json", () => {
  for (const [name, locale] of locales) {
    const localeKeys = flatten(locale);
    const localeKeySet = new Set(localeKeys);

    it(`${name} has no missing keys`, () => {
      const missing = enKeys.filter((k) => !localeKeySet.has(k));
      expect(missing).toEqual([]);
    });

    it(`${name} has no stray keys (plural variants allowed)`, () => {
      const stray = localeKeys.filter(
        (k) => !enKeySet.has(k) && !enBaseSet.has(basePluralKey(k)),
      );
      expect(stray).toEqual([]);
    });
  }
});
