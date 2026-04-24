import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShortcutRecorder } from "./ShortcutRecorder";
import { translateAppError } from "../core/errors";

export interface ShortcutSectionProps {
  current: string;
  onCapture: (combo: string) => Promise<void>;
}

export const ShortcutSection: React.FC<ShortcutSectionProps> = ({
  current,
  onCapture,
}) => {
  const { t } = useTranslation();
  const [serverError, setServerError] = useState<string | null>(null);

  const handleCapture = async (combo: string) => {
    setServerError(null);
    try {
      await onCapture(combo);
    } catch (err) {
      setServerError(translateAppError(err, t));
    }
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
      <h2 style={{ margin: 0 }}>{t("settings.shortcut.sectionTitle")}</h2>
      <ShortcutRecorder current={current} onCapture={handleCapture} />
      {serverError && (
        <div role="alert" style={{ color: "var(--danger-fg)" }}>
          {serverError}
        </div>
      )}
    </section>
  );
};
