import React from "react";
import { useTranslation } from "react-i18next";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { UpdateCard } from "./UpdateCard";
import { groupStyle, legendStyle } from "./fieldsetStyles";

export interface AboutSectionProps {
  autoCheckUpdates: boolean;
  onAutoCheckUpdatesChange: (enabled: boolean) => void;
}

const REPO_URL = "https://github.com/YuriHemmel/DonutTabs";
const KOFI_URL = "https://ko-fi.com/yurihm";
const AUTHOR_NAME = "Yuri Hemmel";
const VERSION_PLACEHOLDER = "…";

const linkButtonStyle: React.CSSProperties = {
  background: "transparent",
  color: "var(--fg)",
  border: "1px solid var(--ghost-border)",
  borderRadius: 4,
  padding: "6px 12px",
  cursor: "pointer",
  font: "inherit",
  textDecoration: "none",
  display: "inline-block",
};

export const AboutSection: React.FC<AboutSectionProps> = ({
  autoCheckUpdates,
  onAutoCheckUpdatesChange,
}) => {
  const { t } = useTranslation();
  const [version, setVersion] = React.useState<string | null>(null);
  const [iconBroken, setIconBroken] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    getVersion()
      .then((v) => {
        if (!cancelled) setVersion(v);
      })
      .catch(() => {
        // Falha silenciosa — mostra placeholder. Não bloqueia o resto.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOpenRepo = React.useCallback(() => {
    void openUrl(REPO_URL);
  }, []);

  const handleOpenKofi = React.useCallback(() => {
    void openUrl(KOFI_URL);
  }, []);

  return (
    <section
      style={{
        flex: 1,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        overflow: "auto",
      }}
    >
      <h2 style={{ margin: 0 }}>{t("settings.sections.about")}</h2>

      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        {iconBroken ? (
          <div
            aria-hidden
            style={{
              width: 48,
              height: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 32,
            }}
          >
            🍩
          </div>
        ) : (
          <img
            src="/app-icon.png"
            alt=""
            aria-hidden
            width={48}
            height={48}
            onError={() => setIconBroken(true)}
            style={{ display: "block" }}
          />
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <strong style={{ fontSize: 20 }}>{t("settings.about.appName")}</strong>
          <span
            data-testid="about-version"
            style={{ color: "var(--muted)" }}
          >
            {version
              ? t("settings.about.versionValue", { version })
              : VERSION_PLACEHOLDER}
          </span>
        </div>
      </header>

      <p style={{ margin: 0 }}>{t("settings.about.description")}</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span>
          <strong>{t("settings.about.author")}:</strong> {AUTHOR_NAME}
        </span>
        <button
          type="button"
          data-testid="about-repo-link"
          onClick={handleOpenRepo}
          style={{ ...linkButtonStyle, alignSelf: "flex-start" }}
        >
          {t("settings.about.repository")}
        </button>
      </div>

      <fieldset style={groupStyle}>
        <legend style={legendStyle}>{t("settings.about.updates")}</legend>
        <UpdateCard
          autoCheckUpdates={autoCheckUpdates}
          onAutoCheckUpdatesChange={onAutoCheckUpdatesChange}
        />
      </fieldset>

      <fieldset style={groupStyle}>
        <legend style={legendStyle}>{t("settings.about.support")}</legend>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          {t("settings.about.supportBody")}
        </p>
        <button
          type="button"
          data-testid="about-kofi-button"
          onClick={handleOpenKofi}
          style={{
            ...linkButtonStyle,
            alignSelf: "flex-start",
            background: "var(--accent-bg)",
            color: "var(--accent-fg)",
            border: 0,
            padding: "8px 16px",
          }}
        >
          {t("settings.about.kofiButton")}
        </button>
      </fieldset>
    </section>
  );
};
