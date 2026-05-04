import React from "react";
import { useTranslation } from "react-i18next";

export interface OnboardingHintProps {
  /** Atalho global do perfil ativo, formato Tauri (ex.: `CommandOrControl+Shift+Space`).
   *  Renderizado já com tradução aplicada (substitui `CommandOrControl` por
   *  `Ctrl/⌘`). */
  shortcut: string;
  /** Disparado quando o user dispensa explicitamente — ESC, clique no
   *  botão "Entendi", ou abrir uma aba. Deve persistir
   *  `firstLaunchCompleted=true` no caller. */
  onDismiss: () => void;
}

/** Plano 22 — overlay de hint mostrado SÓ na 1ª manual launch. Texto
 *  posicionado no rodapé do donut com fade automático no mount; user
 *  dispensa via ESC, click no "Entendi", ou interagindo normalmente
 *  com qualquer slice. */
export const OnboardingHint: React.FC<OnboardingHintProps> = ({
  shortcut,
  onDismiss,
}) => {
  const { t } = useTranslation();
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  const friendlyShortcut = shortcut
    .replace(/CommandOrControl/g, isMac ? "⌘" : "Ctrl")
    .replace(/\+/g, " + ");

  return (
    <div
      role="dialog"
      aria-live="polite"
      data-testid="onboarding-hint"
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        padding: "12px 18px",
        borderRadius: 10,
        background: "rgba(20, 20, 28, 0.92)",
        color: "#f8f8f2",
        border: "1px solid rgba(255, 255, 255, 0.18)",
        maxWidth: "92vw",
        fontSize: 13,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4)",
        textAlign: "center",
        backdropFilter: "blur(6px)",
      }}
    >
      <strong style={{ fontSize: 14 }}>{t("donut.onboarding.title")}</strong>
      <span>
        {t("donut.onboarding.body", { shortcut: friendlyShortcut })}
      </span>
      <button
        type="button"
        data-testid="onboarding-dismiss"
        onClick={onDismiss}
        style={{
          background: "rgba(255, 255, 255, 0.12)",
          color: "inherit",
          border: "1px solid rgba(255, 255, 255, 0.25)",
          borderRadius: 6,
          padding: "4px 14px",
          cursor: "pointer",
          font: "inherit",
        }}
      >
        {t("donut.onboarding.dismiss")}
      </button>
    </div>
  );
};
