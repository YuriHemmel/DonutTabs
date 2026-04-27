/**
 * Compara um `KeyboardEvent` contra uma string de combo no formato Tauri
 * (`"CommandOrControl+Shift+F"`). Usado pelo donut para detectar atalhos
 * window-level (não-globais), tipicamente o atalho de busca rápida.
 *
 * Regra: TODOS os modificadores precisam bater exatamente — `Ctrl+F` não
 * casa um evento com `shiftKey: true`. `CommandOrControl` traduz para
 * `metaKey` no macOS e `ctrlKey` em Windows/Linux (detecção via
 * `navigator.platform`). Combo malformado ou modificador desconhecido
 * retorna `false` sem lançar.
 */

interface ParsedCombo {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  key: string;
}

function detectIsMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac/i.test(navigator.platform);
}

export function parseCombo(combo: string, isMac = detectIsMac()): ParsedCombo | null {
  const tokens = combo.split("+").map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return null;

  const out: ParsedCombo = {
    ctrl: false,
    shift: false,
    alt: false,
    meta: false,
    key: "",
  };

  for (const tok of tokens.slice(0, -1)) {
    const norm = tok.toLowerCase();
    if (norm === "commandorcontrol") {
      if (isMac) out.meta = true;
      else out.ctrl = true;
    } else if (norm === "control" || norm === "ctrl") {
      out.ctrl = true;
    } else if (norm === "shift") {
      out.shift = true;
    } else if (norm === "alt" || norm === "option") {
      out.alt = true;
    } else if (
      norm === "command" ||
      norm === "cmd" ||
      norm === "super" ||
      norm === "meta"
    ) {
      out.meta = true;
    } else {
      return null;
    }
  }

  out.key = tokens[tokens.length - 1].toLowerCase();
  return out;
}

export function matchesCombo(
  e: KeyboardEvent,
  combo: string,
  isMac = detectIsMac(),
): boolean {
  const parsed = parseCombo(combo, isMac);
  if (!parsed) return false;
  return (
    e.ctrlKey === parsed.ctrl &&
    e.shiftKey === parsed.shift &&
    e.altKey === parsed.alt &&
    e.metaKey === parsed.meta &&
    e.key.toLowerCase() === parsed.key
  );
}
