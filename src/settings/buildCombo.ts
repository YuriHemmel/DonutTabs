export interface ComboBuildResult {
  /** Combo finalizada (no formato aceito por `tauri-plugin-global-shortcut`). */
  combo: string | null;
  /** Erro de validação — componente mostra mensagem correspondente. */
  error: "reservedKey" | "noModifier" | null;
  /** Contexto opcional do erro (ex: qual tecla foi rejeitada). */
  context?: Record<string, string>;
}

const RESERVED_KEYS = new Set([
  "Enter",
  "Escape",
  "Tab",
  "Dead",
  "Unidentified",
]);

const MODIFIER_KEYS = new Set([
  "Control",
  "Shift",
  "Alt",
  "Meta",
  "AltGraph",
  "Super",
  "OS",
  "ContextMenu",
]);

const PASSTHROUGH_CODES = new Set([
  "Space",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Insert",
  "Delete",
  "Backspace",
  "Minus",
  "Equal",
  "BracketLeft",
  "BracketRight",
  "Semicolon",
  "Quote",
  "Comma",
  "Period",
  "Slash",
  "Backslash",
  "Backquote",
]);

// Issue #81 — resolve a tecla física a partir de `KeyboardEvent.code`,
// independente do layout/dead-key do SO. Sem isso, Option+C no Mac vira
// "Ç" via composição diacrítica e o muda rejeita a string. O `code` é
// estável por posição física (KeyC sempre é a tecla "C" no QWERTY).
function physicalKeyFromCode(code: string | undefined): string | null {
  if (!code) return null;
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter) return letter[1];
  const digit = /^Digit([0-9])$/.exec(code);
  if (digit) return digit[1];
  const numpad = /^Numpad([0-9])$/.exec(code);
  if (numpad) return `Numpad${numpad[1]}`;
  const fkey = /^F([1-9][0-9]?)$/.exec(code);
  if (fkey) {
    const n = parseInt(fkey[1], 10);
    if (n >= 1 && n <= 24) return code;
  }
  if (code === "ArrowUp") return "Up";
  if (code === "ArrowDown") return "Down";
  if (code === "ArrowLeft") return "Left";
  if (code === "ArrowRight") return "Right";
  if (PASSTHROUGH_CODES.has(code)) return code;
  return null;
}

/**
 * Converte `KeyboardEvent.key` em um nome aceito pelo Tauri global-shortcut.
 * Retorna `null` para teclas que não devem ser bindadas (modificadores
 * sozinhos, teclas reservadas, teclas mortas).
 */
function normalizeKey(e: {
  key: string;
  code?: string;
}): { kind: "ok"; value: string } | { kind: "modifier" } | { kind: "reserved"; value: string } {
  const k = e.key;
  if (MODIFIER_KEYS.has(k)) return { kind: "modifier" };

  // Issue #81 — preferir a key física pelo `code` quando disponível. Cobre
  // o caso clássico Option+C no Mac (e.key="Ç" mas e.code="KeyC") e
  // AltGr+E no Linux/Windows (e.key="€" mas e.code="KeyE").
  const physical = physicalKeyFromCode(e.code);
  if (physical !== null) return { kind: "ok", value: physical };

  if (RESERVED_KEYS.has(k)) return { kind: "reserved", value: k };
  if (k === " " || k === "Spacebar") return { kind: "ok", value: "Space" };
  if (k === "ArrowUp") return { kind: "ok", value: "Up" };
  if (k === "ArrowDown") return { kind: "ok", value: "Down" };
  if (k === "ArrowLeft") return { kind: "ok", value: "Left" };
  if (k === "ArrowRight") return { kind: "ok", value: "Right" };
  // Letras → uppercase; dígitos / F-keys / Home/End/etc. passam como estão.
  if (/^[a-zA-Z]$/.test(k)) return { kind: "ok", value: k.toUpperCase() };
  if (k.length === 1) return { kind: "ok", value: k.toUpperCase() };
  return { kind: "ok", value: k };
}

/**
 * Constrói uma string de atalho a partir de um evento de teclado.
 *
 * Regras:
 *   - Modificador sozinho (ex: só Ctrl) → `{ combo: null, error: null }` (ainda compondo).
 *   - Tecla reservada (Enter/Tab/Esc) → `error: "reservedKey"`.
 *   - Letra/dígito sem modificador → `error: "noModifier"` (footgun: gravar
 *     `A` como atalho global captura a letra em qualquer app). F-keys,
 *     Space, setas, Home/End/etc. seguem aceitos sem modificador.
 *   - Combo válida → `{ combo: "F12" | "CommandOrControl+Shift+Space" }`.
 */
export function buildCombo(e: {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  key: string;
  code?: string;
}): ComboBuildResult {
  const normalized = normalizeKey(e);
  if (normalized.kind === "modifier") {
    return { combo: null, error: null };
  }
  if (normalized.kind === "reserved") {
    return { combo: null, error: "reservedKey", context: { key: normalized.value } };
  }

  const hasModifier = e.ctrlKey || e.metaKey || e.altKey || e.shiftKey;
  if (!hasModifier && /^[A-Z0-9]$/.test(normalized.value)) {
    return { combo: null, error: "noModifier", context: { key: normalized.value } };
  }

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  parts.push(normalized.value);
  return { combo: parts.join("+"), error: null };
}
