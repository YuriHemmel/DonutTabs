import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildCombo } from "./buildCombo";

export interface ShortcutRecorderProps {
  current: string;
  onCapture: (combo: string) => void;
}

export const ShortcutRecorder: React.FC<ShortcutRecorderProps> = ({
  current,
  onCapture,
}) => {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;

    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setRecording(false);
        setError(null);
        return;
      }

      const r = buildCombo(e);
      if (r.error === "reservedKey") {
        setError(t("settings.shortcut.reservedKey", { key: r.context?.key ?? e.key }));
        return;
      }
      if (r.error === "noModifier") {
        setError(t("settings.shortcut.noModifier"));
        return;
      }
      if (r.combo) {
        setRecording(false);
        setError(null);
        onCapture(r.combo);
      }
      // r.combo === null && error === null → ainda compondo (só modificador
      // pressionado). Espera a próxima tecla.
    };

    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [recording, t, onCapture]);

  const buttonStyle: React.CSSProperties = {
    background: "#2a4a7d",
    color: "#fff",
    border: 0,
    borderRadius: 4,
    padding: "8px 16px",
    cursor: "pointer",
  };

  const cancelStyle: React.CSSProperties = {
    background: "transparent",
    color: "#dde",
    border: "1px solid #334",
    borderRadius: 4,
    padding: "8px 16px",
    cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span>{t("settings.shortcut.current")}</span>
        <code
          style={{
            background: "#12192c",
            border: "1px solid #2a3557",
            borderRadius: 4,
            padding: "4px 8px",
            fontFamily: "ui-monospace, Consolas, monospace",
          }}
        >
          {current}
        </code>
      </div>

      {recording ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span>{t("settings.shortcut.recording")}</span>
          <button
            type="button"
            onClick={() => {
              setRecording(false);
              setError(null);
            }}
            style={cancelStyle}
          >
            {t("settings.shortcut.cancel")}
          </button>
        </div>
      ) : (
        <div>
          <button type="button" onClick={() => setRecording(true)} style={buttonStyle}>
            {t("settings.shortcut.record")}
          </button>
        </div>
      )}

      <small style={{ color: "#889" }}>{t("settings.shortcut.hint")}</small>

      {error && (
        <div role="alert" style={{ color: "#f99" }}>
          {error}
        </div>
      )}
    </div>
  );
};
