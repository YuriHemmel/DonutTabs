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
  const IntlAny = Intl as unknown as {
    Segmenter?: new (
      locale: string,
      opts: { granularity: "grapheme" },
    ) => { segment: (s: string) => Iterable<unknown> };
  };
  if (IntlAny.Segmenter) {
    let count = 0;
    for (const _ of new IntlAny.Segmenter("pt-BR", { granularity: "grapheme" }).segment(
      s,
    )) {
      count++;
    }
    return count;
  }
  return [...s].length;
}
