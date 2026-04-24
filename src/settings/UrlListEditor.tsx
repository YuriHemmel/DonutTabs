import React from "react";
import { useTranslation } from "react-i18next";

export interface UrlListEditorProps {
  values: string[];
  onChange: (next: string[]) => void;
}

export const UrlListEditor: React.FC<UrlListEditorProps> = ({ values, onChange }) => {
  const { t } = useTranslation();

  const update = (i: number, v: string) => {
    const next = [...values];
    next[i] = v;
    onChange(next);
  };

  const remove = (i: number) => {
    const next = values.filter((_, idx) => idx !== i);
    onChange(next);
  };

  const add = () => onChange([...values, ""]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {values.map((v, i) => (
        <div key={i} style={{ display: "flex", gap: 6 }}>
          <input
            aria-label={`URL ${i + 1}`}
            value={v}
            onChange={(e) => update(i, e.target.value)}
            placeholder={t("settings.editor.urlPlaceholder")}
            style={{
              flex: 1,
              background: "var(--input-bg)",
              color: "var(--fg)",
              border: "1px solid var(--input-border)",
              borderRadius: 4,
              padding: "6px 8px",
              font: "inherit",
            }}
          />
          <button
            type="button"
            aria-label={t("settings.editor.removeUrl")}
            onClick={() => remove(i)}
            style={{
              background: "transparent",
              color: "var(--danger-fg)",
              border: "1px solid var(--danger-border)",
              borderRadius: 4,
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        style={{
          alignSelf: "flex-start",
          background: "transparent",
          color: "var(--fg)",
          border: "1px dashed var(--input-border)",
          borderRadius: 4,
          padding: "4px 10px",
          cursor: "pointer",
          fontSize: 12,
        }}
      >
        + {t("settings.editor.addUrl")}
      </button>
    </div>
  );
};
