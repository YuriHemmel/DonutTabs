import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { UrlListEditor } from "./UrlListEditor";
import { translateAppError } from "../core/errors";
import type { Tab } from "../core/types/Tab";
import type { OpenMode } from "../core/types/OpenMode";

type Mode = "new" | "edit";

export interface TabEditorProps {
  mode: Mode;
  initial: Tab | null;
  onSave: (tab: Tab) => Promise<void>;
  onCancel: () => void;
  onDelete: (tabId: string) => Promise<void>;
}

interface FormState {
  id: string;
  name: string;
  icon: string;
  openMode: OpenMode;
  urls: string[];
}

function randomUuid(): string {
  return crypto.randomUUID();
}

function stripLetters(s: string): string {
  // \p{L} cobre letras de qualquer script (Latin, Cyrillic, CJK, etc.).
  // Emojis ficam em \p{So}, ZWJ em \p{Cf}, modifiers em \p{Sk} — passam intactos.
  return s.replace(/\p{L}/gu, "");
}

function graphemeCount(s: string): number {
  // Intl.Segmenter cobre emojis compostos (ZWJ, skin tone, bandeiras).
  // Fallback para contagem de codepoints em runtimes sem Segmenter.
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

function fromTab(tab: Tab | null): FormState {
  if (!tab) {
    return {
      id: randomUuid(),
      name: "",
      icon: "",
      openMode: "reuseOrNewWindow",
      urls: [""],
    };
  }
  return {
    id: tab.id,
    name: tab.name ?? "",
    icon: tab.icon ?? "",
    openMode: tab.openMode,
    urls: tab.items.length
      ? tab.items.map((it) => (it.kind === "url" ? it.value : ""))
      : [""],
  };
}

export const TabEditor: React.FC<TabEditorProps> = ({
  mode,
  initial,
  onSave,
  onCancel,
  onDelete,
}) => {
  const { t } = useTranslation();
  const [state, setState] = useState<FormState>(() => fromTab(initial));
  const [validation, setValidation] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setState(fromTab(initial));
    setValidation(null);
    setServerError(null);
  }, [initial, mode]);

  const submit = async () => {
    setServerError(null);

    const name = state.name.trim();
    const icon = state.icon.trim();
    if (!name && !icon) {
      setValidation(t("settings.editor.validationNameOrIcon"));
      return;
    }

    if (icon && graphemeCount(icon) > 1) {
      setValidation(t("settings.editor.validationIconTooLong"));
      return;
    }

    const urls = state.urls.map((u) => u.trim()).filter((u) => u.length > 0);
    if (urls.length === 0) {
      setValidation(t("settings.editor.validationAtLeastOneUrl"));
      return;
    }

    for (const u of urls) {
      try {
        new URL(u);
      } catch {
        setValidation(t("settings.editor.validationInvalidUrl", { value: u }));
        return;
      }
    }

    setValidation(null);

    const payload: Tab = {
      id: state.id,
      name: name.length > 0 ? name : null,
      icon: icon.length > 0 ? icon : null,
      order: initial?.order ?? 0,
      openMode: state.openMode,
      items: urls.map((value) => ({ kind: "url", value })),
    };

    setSaving(true);
    try {
      await onSave(payload);
    } catch (err) {
      setServerError(translateAppError(err, t));
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = async () => {
    if (!initial) return;
    const label = initial.name ?? initial.icon ?? initial.id.slice(0, 6);
    const confirmed = window.confirm(t("settings.editor.confirmDelete", { label }));
    if (!confirmed) return;
    try {
      await onDelete(initial.id);
    } catch (err) {
      setServerError(translateAppError(err, t));
    }
  };

  const title =
    mode === "new" ? t("settings.editor.newTabTitle") : state.name || state.icon || "";

  const inputStyle: React.CSSProperties = {
    background: "#12192c",
    color: "#dde",
    border: "1px solid #2a3557",
    borderRadius: 4,
    padding: "6px 8px",
    font: "inherit",
  };

  return (
    <section
      style={{
        flex: 1,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        overflow: "auto",
      }}
    >
      <h2 style={{ margin: 0 }}>{title}</h2>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span>{t("settings.editor.name")}</span>
        <input
          value={state.name}
          onChange={(e) => setState({ ...state, name: e.target.value })}
          placeholder={t("settings.editor.namePlaceholder")}
          style={inputStyle}
        />
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>{t("settings.editor.icon")}</span>
          <input
            value={state.icon}
            onChange={(e) =>
              setState({ ...state, icon: stripLetters(e.target.value) })
            }
            placeholder={t("settings.editor.iconPlaceholder")}
            maxLength={16}
            size={4}
            style={{ ...inputStyle, width: 80 }}
          />
        </label>
        <small style={{ color: "#889" }}>{t("settings.editor.iconHint")}</small>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span>{t("settings.editor.urls")}</span>
        <UrlListEditor values={state.urls} onChange={(urls) => setState({ ...state, urls })} />
      </div>

      {validation && (
        <div role="alert" style={{ color: "#f99" }}>
          {validation}
        </div>
      )}
      {serverError && (
        <div role="alert" style={{ color: "#f99" }}>
          {serverError}
        </div>
      )}

      <footer style={{ display: "flex", gap: 8, marginTop: "auto" }}>
        <button
          type="button"
          disabled={saving}
          onClick={submit}
          style={{
            background: "#2a4a7d",
            color: "#fff",
            border: 0,
            borderRadius: 4,
            padding: "8px 16px",
            cursor: saving ? "wait" : "pointer",
          }}
        >
          {saving ? t("settings.editor.saving") : t("settings.editor.save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: "transparent",
            color: "#dde",
            border: "1px solid #334",
            borderRadius: 4,
            padding: "8px 16px",
            cursor: "pointer",
          }}
        >
          {t("settings.editor.cancel")}
        </button>
        {mode === "edit" && initial && (
          <button
            type="button"
            onClick={requestDelete}
            style={{
              marginLeft: "auto",
              background: "transparent",
              color: "#f99",
              border: "1px solid #532",
              borderRadius: 4,
              padding: "8px 16px",
              cursor: "pointer",
            }}
          >
            {t("settings.editor.delete")}
          </button>
        )}
      </footer>
    </section>
  );
};
