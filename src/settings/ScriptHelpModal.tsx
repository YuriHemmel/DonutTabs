import React, { useEffect } from "react";
import { useTranslation } from "react-i18next";

export interface ScriptHelpModalProps {
  open: boolean;
  onClose: () => void;
}

/** Detecta default shell pra exibir no texto de ajuda — best-effort.
 *  navigator.platform é deprecated mas suficiente pra escolher entre cmd/sh. */
function detectDefaultShell(): string {
  if (typeof navigator === "undefined") return "sh";
  const platform = (navigator.platform || "").toLowerCase();
  if (platform.startsWith("win")) return "cmd";
  return "sh";
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalStyle: React.CSSProperties = {
  background: "var(--panel)",
  color: "var(--fg)",
  border: "1px solid var(--input-border)",
  borderRadius: 8,
  padding: 24,
  width: "min(560px, 92vw)",
  maxHeight: "85vh",
  overflowY: "auto",
  boxShadow: "0 16px 48px rgba(0, 0, 0, 0.4)",
};

const sectionStyle: React.CSSProperties = {
  marginTop: 16,
};

const sectionTitleStyle: React.CSSProperties = {
  margin: "0 0 6px 0",
  fontSize: 14,
  fontWeight: 600,
};

const codeBlockStyle: React.CSSProperties = {
  background: "var(--input-bg)",
  border: "1px solid var(--input-border)",
  borderRadius: 4,
  padding: 8,
  fontFamily: "ui-monospace, Menlo, Consolas, monospace",
  fontSize: 12,
  overflowX: "auto",
  margin: "4px 0",
};

const closeButtonStyle: React.CSSProperties = {
  background: "var(--accent-bg)",
  color: "var(--accent-fg)",
  border: 0,
  borderRadius: 4,
  padding: "8px 16px",
  cursor: "pointer",
  marginTop: 16,
};

export const ScriptHelpModal: React.FC<ScriptHelpModalProps> = ({
  open,
  onClose,
}) => {
  const { t } = useTranslation();
  const defaultShell = detectDefaultShell();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      data-testid="script-help-modal"
      style={overlayStyle}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="script-help-title"
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="script-help-title" style={{ margin: 0, fontSize: 18 }}>
          {t("settings.scriptHelp.title")}
        </h2>

        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>
            {t("settings.scriptHelp.howItWorksTitle")}
          </h3>
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            {t("settings.scriptHelp.howItWorksBody", { defaultShell })}
          </p>
        </section>

        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>
            {t("settings.scriptHelp.chainingTitle")}
          </h3>
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            {t("settings.scriptHelp.chainingBody")}
          </p>
        </section>

        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>
            {t("settings.scriptHelp.outputTitle")}
          </h3>
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            {t("settings.scriptHelp.outputBody")}
          </p>
        </section>

        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>
            {t("settings.scriptHelp.securityTitle")}
          </h3>
          <p style={{ margin: 0, lineHeight: 1.5 }}>
            {t("settings.scriptHelp.securityBody")}
          </p>
        </section>

        <section style={sectionStyle}>
          <h3 style={sectionTitleStyle}>
            {t("settings.scriptHelp.examplesTitle")}
          </h3>
          <pre style={codeBlockStyle}>echo "Olá"</pre>
          <pre style={codeBlockStyle}>git pull && cargo test</pre>
          <pre style={codeBlockStyle}>ls -la | head -20</pre>
        </section>

        <button
          type="button"
          data-testid="script-help-close"
          onClick={onClose}
          style={closeButtonStyle}
        >
          {t("settings.scriptHelp.close")}
        </button>
      </div>
    </div>
  );
};
