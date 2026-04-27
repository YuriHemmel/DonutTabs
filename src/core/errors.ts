import type { TFunction } from "i18next";

export interface AppError {
  kind: "config" | "shortcut" | "launcher" | "window" | "io";
  message: {
    code: string;
    context: Record<string, string>;
  };
}

export function isAppError(value: unknown): value is AppError {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.kind !== "string") return false;
  if (typeof v.message !== "object" || v.message === null) return false;
  const m = v.message as Record<string, unknown>;
  return typeof m.code === "string";
}

function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

const ITEM_KIND_LABEL_KEYS: Record<string, string> = {
  url: "settings.editor.itemKindUrl",
  file: "settings.editor.itemKindFile",
  folder: "settings.editor.itemKindFolder",
};

function localizeContext(
  context: Record<string, string>,
  t: TFunction,
): Record<string, string> {
  const kindKey = context.kind && ITEM_KIND_LABEL_KEYS[context.kind];
  if (!kindKey) return context;
  return { ...context, kind: t(kindKey) };
}

/**
 * Produz mensagem traduzida para um `AppError` vindo do Rust.
 *
 * Ordem de resolução:
 * 1. `errors.{kind}.{camelCode}` — chave específica do erro.
 * 2. `errors.{kind}.unknown` — chave genérica da família, recebe `{ code }`.
 * 3. `errors.fallback` — último recurso, recebe `{ kind }`.
 */
export function translateAppError(err: unknown, t: TFunction): string {
  if (!isAppError(err)) {
    return t("errors.fallback", { kind: typeof err });
  }
  const camel = snakeToCamel(err.message.code);
  const specificKey = `errors.${err.kind}.${camel}`;
  const localizedContext = localizeContext(err.message.context, t);
  const translated = t(specificKey, {
    ...localizedContext,
    defaultValue: "",
  });
  if (translated) return translated;

  const unknownKey = `errors.${err.kind}.unknown`;
  const unknownTranslated = t(unknownKey, {
    code: err.message.code,
    defaultValue: "",
  });
  if (unknownTranslated) return unknownTranslated;

  return t("errors.fallback", { kind: err.kind });
}
