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
 *   - Tecla sem modificador → `error: "noModifier"`.
 *   - Combo válida → `{ combo: "CommandOrControl+Shift+Space" }`.
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

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  if (parts.length === 0) {
    return { combo: null, error: "noModifier" };
  }

  parts.push(normalized.value);
  return { combo: parts.join("+"), error: null };
}
