/**
 * Helpers de texto compartilhados entre `<TabEditor>` e `<ProfileEditor>`.
 * `stripLetters` derruba letras de qualquer script (`\p{L}`) preservando
 * emojis (`\p{So}`), ZWJ (`\p{Cf}`) e modifiers (`\p{Sk}`). `graphemeCount`
 * usa `Intl.Segmenter` quando disponível pra contar emojis compostos
 * (bandeiras, ZWJ, skin tone) como 1.
 */
export function stripLetters(s: string): string {
  return s.replace(/\p{L}/gu, "");
}

export function graphemeCount(s: string): number {
  // Locale `undefined` deixa o runtime escolher o default; fronteiras de
  // grafema são definidas pelo Unicode e não dependem de locale na prática.
  const IntlAny = Intl as unknown as {
    Segmenter?: new (
      locales?: string | string[],
      opts?: { granularity: "grapheme" },
    ) => { segment: (s: string) => Iterable<unknown> };
  };
  if (IntlAny.Segmenter) {
    let count = 0;
    for (const _ of new IntlAny.Segmenter(undefined, {
      granularity: "grapheme",
    }).segment(s)) {
      count++;
    }
    return count;
  }
  return [...s].length;
}
