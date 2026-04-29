import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { dialog } from "../core/ipc";
import { AppPicker } from "./AppPicker";

export type ItemKind = "url" | "file" | "folder" | "app" | "script";

export interface ItemDraft {
  kind: ItemKind;
  /** Para url=value, file/folder=path, app=name, script=command. */
  value: string;
  /** Optional handler/program. Empty string ⇔ unset (uses OS default).
   *  Não se aplica a `app`/`script` (sempre empty para esses kinds). */
  openWith: string;
  /** Só `kind: "script"` carrega esse flag. Default `false`; flipped via
   *  `<ScriptConfirmModal>` ou checkbox no editor. */
  trusted?: boolean;
}

export interface ItemListEditorProps {
  values: ItemDraft[];
  onChange: (next: ItemDraft[]) => void;
}

const KIND_OPTIONS: ReadonlyArray<ItemKind> = [
  "url",
  "file",
  "folder",
  "app",
  "script",
];

const KIND_SUFFIX: Record<ItemKind, string> = {
  url: "Url",
  file: "File",
  folder: "Folder",
  app: "App",
  script: "Script",
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: "var(--input-bg)",
  color: "var(--fg)",
  border: "1px solid var(--input-border)",
  borderRadius: 4,
  padding: "6px 8px",
  font: "inherit",
};
const selectStyle: React.CSSProperties = {
  ...inputStyle,
  flex: "0 0 110px",
};
const openWithStyle: React.CSSProperties = {
  ...inputStyle,
  flex: "0 0 140px",
};
const ghostBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--fg)",
  border: "1px solid var(--ghost-border)",
  borderRadius: 4,
  padding: "4px 10px",
  cursor: "pointer",
  font: "inherit",
};
const removeBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--danger-fg)",
  border: "1px solid var(--danger-border)",
  borderRadius: 4,
  padding: "4px 10px",
  cursor: "pointer",
};
const addBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--fg)",
  border: "1px dashed var(--input-border)",
  borderRadius: 4,
  padding: "4px 10px",
  cursor: "pointer",
  fontSize: 12,
};

const usesOpenWith = (k: ItemKind) => k === "url" || k === "file" || k === "folder";
const usesBrowse = (k: ItemKind) => k === "file" || k === "folder";
const isScript = (k: ItemKind) => k === "script";
const isApp = (k: ItemKind) => k === "app";

export const ItemListEditor: React.FC<ItemListEditorProps> = ({
  values,
  onChange,
}) => {
  const { t } = useTranslation();
  /** Plano 17 — index do row de `kind: "app"` aberto no `<AppPicker>`,
   *  ou `null` quando o picker está fechado. */
  const [appPickerIndex, setAppPickerIndex] = useState<number | null>(null);

  const updateAt = (i: number, patch: Partial<ItemDraft>) => {
    const next = values.map((v, idx) => (idx === i ? { ...v, ...patch } : v));
    onChange(next);
  };

  const removeAt = (i: number) => {
    onChange(values.filter((_, idx) => idx !== i));
  };

  const add = (kind: ItemKind) => {
    const draft: ItemDraft = { kind, value: "", openWith: "" };
    if (isScript(kind)) draft.trusted = false;
    onChange([...values, draft]);
  };

  const browse = async (i: number, kind: ItemKind) => {
    const path =
      kind === "folder" ? await dialog.pickFolder() : await dialog.pickFile();
    if (path) updateAt(i, { value: path });
  };

  const placeholderFor = (kind: ItemKind) =>
    t(`settings.editor.itemPlaceholder${KIND_SUFFIX[kind]}`);

  const labelFor = (kind: ItemKind) =>
    t(`settings.editor.itemKind${KIND_SUFFIX[kind]}`);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {values.map((it, i) => (
        <div
          key={i}
          data-testid={`item-row-${i}`}
          style={{ display: "flex", flexDirection: "column", gap: 4 }}
        >
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select
              aria-label={`${t("settings.editor.items")} ${i + 1} kind`}
              data-testid={`item-kind-${i}`}
              value={it.kind}
              onChange={(e) =>
                updateAt(i, { kind: e.target.value as ItemKind })
              }
              style={selectStyle}
            >
              {KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {labelFor(k)}
                </option>
              ))}
            </select>
            {isScript(it.kind) ? (
              <textarea
                aria-label={`${labelFor(it.kind)} ${i + 1}`}
                data-testid={`item-value-${i}`}
                value={it.value}
                onChange={(e) => updateAt(i, { value: e.target.value })}
                placeholder={placeholderFor(it.kind)}
                rows={3}
                style={{
                  ...inputStyle,
                  fontFamily: "ui-monospace, Menlo, Consolas, monospace",
                  fontSize: 12,
                  resize: "vertical",
                }}
              />
            ) : (
              <input
                aria-label={`${labelFor(it.kind)} ${i + 1}`}
                data-testid={`item-value-${i}`}
                value={it.value}
                onChange={(e) => updateAt(i, { value: e.target.value })}
                placeholder={placeholderFor(it.kind)}
                style={inputStyle}
              />
            )}
            {usesBrowse(it.kind) && (
              <button
                type="button"
                data-testid={`item-browse-${i}`}
                onClick={() => browse(i, it.kind)}
                style={ghostBtn}
              >
                {t("settings.editor.browse")}
              </button>
            )}
            {isApp(it.kind) && (
              <button
                type="button"
                data-testid={`item-app-picker-${i}`}
                title={t("settings.editor.appPickerHint")}
                onClick={() => setAppPickerIndex(i)}
                style={ghostBtn}
              >
                {t("settings.editor.appPickerButton")}
              </button>
            )}
            {usesOpenWith(it.kind) && (
              <input
                aria-label={`${t("settings.editor.openWithLabel")} ${i + 1}`}
                data-testid={`item-open-with-${i}`}
                value={it.openWith}
                onChange={(e) => updateAt(i, { openWith: e.target.value })}
                placeholder={t("settings.editor.openWithPlaceholder")}
                title={t("settings.editor.openWithHint")}
                style={openWithStyle}
              />
            )}
            <button
              type="button"
              aria-label={t("settings.editor.removeItem")}
              data-testid={`item-remove-${i}`}
              onClick={() => removeAt(i)}
              style={removeBtn}
            >
              ✕
            </button>
          </div>
          {isScript(it.kind) && (
            <label
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                fontSize: 12,
                color: "var(--muted)",
                paddingLeft: 116,
              }}
            >
              <input
                type="checkbox"
                data-testid={`item-script-trusted-${i}`}
                checked={!!it.trusted}
                onChange={(e) => updateAt(i, { trusted: e.target.checked })}
              />
              {t("settings.editor.scriptTrustedLabel")}
            </label>
          )}
        </div>
      ))}

      <AppPicker
        open={appPickerIndex !== null}
        onSelect={(name) => {
          if (appPickerIndex !== null) updateAt(appPickerIndex, { value: name });
        }}
        onClose={() => setAppPickerIndex(null)}
      />

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button
          type="button"
          data-testid="add-item-url"
          onClick={() => add("url")}
          style={addBtn}
        >
          + {t("settings.editor.addItemUrl")}
        </button>
        <button
          type="button"
          data-testid="add-item-file"
          onClick={() => add("file")}
          style={addBtn}
        >
          + {t("settings.editor.addItemFile")}
        </button>
        <button
          type="button"
          data-testid="add-item-folder"
          onClick={() => add("folder")}
          style={addBtn}
        >
          + {t("settings.editor.addItemFolder")}
        </button>
        <button
          type="button"
          data-testid="add-item-app"
          onClick={() => add("app")}
          style={addBtn}
        >
          + {t("settings.editor.addItemApp")}
        </button>
        <button
          type="button"
          data-testid="add-item-script"
          onClick={() => add("script")}
          style={addBtn}
        >
          + {t("settings.editor.addItemScript")}
        </button>
      </div>
    </div>
  );
};
