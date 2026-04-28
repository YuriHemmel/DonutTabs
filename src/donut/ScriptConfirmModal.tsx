import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export interface ScriptConfirmModalProps {
  command: string;
  /** `trustForever: true` quando o user marcou "Confiar nesta aba" antes de
   *  confirmar — caller deve persistir `trusted: true` antes de re-launcher. */
  onConfirm: (trustForever: boolean) => void;
  onCancel: () => void;
}

/**
 * Modal de confirmação antes de executar `kind: "script"` untrusted. Mostra
 * o comando completo + warning de segurança. Default-button = Cancel para
 * defender contra Enter-spam acidental: o user precisa explicitamente
 * focar e confirmar Run.
 */
export const ScriptConfirmModal: React.FC<ScriptConfirmModalProps> = ({
  command,
  onConfirm,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [trustForever, setTrustForever] = useState(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  // Default focus: Cancel. Reduz risco de Enter acidental disparar o script.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };

  return (
    <div
      data-testid="script-confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("donut.scriptModal.title")}
      onKeyDown={handleKeyDown}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1200,
      }}
    >
      <div
        style={{
          background: "#1b2436",
          color: "#eaeaea",
          border: "1px solid #6a4e3a",
          borderRadius: 8,
          padding: 20,
          width: "min(520px, 92vw)",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          boxShadow: "0 12px 40px rgba(0,0,0,0.55)",
          fontSize: 13,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 16, color: "#ffb366" }}>
          {t("donut.scriptModal.title")}
        </h2>
        <div>
          <div style={{ color: "#9aa6bf", fontSize: 12, marginBottom: 4 }}>
            {t("donut.scriptModal.commandLabel")}
          </div>
          <pre
            data-testid="script-confirm-command"
            style={{
              margin: 0,
              padding: "8px 10px",
              background: "#0e1422",
              border: "1px solid #3a4968",
              borderRadius: 4,
              overflow: "auto",
              maxHeight: 180,
              fontFamily: "ui-monospace, Menlo, Consolas, monospace",
              fontSize: 12,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {command}
          </pre>
        </div>
        <div
          style={{
            color: "#ffb366",
            background: "#3a2a1e",
            border: "1px solid #6a4e3a",
            borderRadius: 4,
            padding: "8px 10px",
            fontSize: 12,
          }}
        >
          ⚠ {t("donut.scriptModal.warning")}
        </div>
        <label
          style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12 }}
        >
          <input
            type="checkbox"
            data-testid="script-confirm-trust"
            checked={trustForever}
            onChange={(e) => setTrustForever(e.target.checked)}
          />
          {t("donut.scriptModal.trustLabel")}
        </label>
        <footer style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            ref={cancelRef}
            type="button"
            data-testid="script-confirm-cancel"
            onClick={onCancel}
            style={{
              background: "transparent",
              color: "#eaeaea",
              border: "1px solid #3a4968",
              borderRadius: 4,
              padding: "6px 14px",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            {t("donut.scriptModal.cancel")}
          </button>
          <button
            type="button"
            data-testid="script-confirm-run"
            onClick={() => onConfirm(trustForever)}
            style={{
              background: "#6a4e3a",
              color: "#fff5e6",
              border: "1px solid #6a4e3a",
              borderRadius: 4,
              padding: "6px 14px",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            {t("donut.scriptModal.run")}
          </button>
        </footer>
      </div>
    </div>
  );
};
