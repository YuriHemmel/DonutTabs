import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { ShortcutRecorder } from "./ShortcutRecorder";
import { translateAppError } from "../core/errors";

export interface ShortcutSectionProps {
  current: string;
  onCapture: (combo: string) => Promise<void>;
  searchShortcut: string;
  onCaptureSearchShortcut: (combo: string) => Promise<void>;
}

export const ShortcutSection: React.FC<ShortcutSectionProps> = ({
  current,
  onCapture,
  searchShortcut,
  onCaptureSearchShortcut,
}) => {
  const { t } = useTranslation();
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleCaptureGlobal = async (combo: string) => {
    setGlobalError(null);
    try {
      await onCapture(combo);
    } catch (err) {
      setGlobalError(translateAppError(err, t));
    }
  };

  const handleCaptureSearch = async (combo: string) => {
    setSearchError(null);
    try {
      await onCaptureSearchShortcut(combo);
    } catch (err) {
      setSearchError(translateAppError(err, t));
    }
  };

  return (
    <section
      style={{
        flex: 1,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 24,
        overflow: "auto",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ margin: 0 }}>{t("settings.shortcut.sectionTitle")}</h2>
        <ShortcutRecorder current={current} onCapture={handleCaptureGlobal} />
        {globalError && (
          <div role="alert" style={{ color: "var(--danger-fg)" }}>
            {globalError}
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          paddingTop: 16,
          borderTop: "1px solid var(--input-border)",
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>
            {t("settings.shortcut.searchSectionTitle")}
          </h3>
          <small style={{ color: "var(--muted)" }}>
            {t("settings.shortcut.searchHint")}
          </small>
        </div>
        <div data-testid="search-shortcut-recorder">
          <ShortcutRecorder
            current={searchShortcut}
            onCapture={handleCaptureSearch}
          />
        </div>
        {searchError && (
          <div role="alert" style={{ color: "var(--danger-fg)" }}>
            {searchError}
          </div>
        )}
      </div>
    </section>
  );
};
