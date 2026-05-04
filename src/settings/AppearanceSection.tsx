import React from "react";
import { useTranslation } from "react-i18next";
import type { Theme } from "../core/types/Theme";
import type { ThemeOverrides } from "../core/types/ThemeOverrides";
import { ThemeCustomizer } from "./ThemeCustomizer";

export interface AppearanceSectionProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  /** Quando o perfil sob edição não é o ativo, mostra um botão pra ativá-lo. */
  onSetActiveProfile?: () => void;
  /** Plano 15: overrides cosméticos do perfil em edição. */
  themeOverrides?: ThemeOverrides | null;
  onThemeOverridesChange?: (overrides: ThemeOverrides | null) => void;
}

const THEMES: Theme[] = ["dark", "light", "auto"];
const THEME_KEY: Record<Theme, string> = {
  dark: "settings.appearance.themeDark",
  light: "settings.appearance.themeLight",
  auto: "settings.appearance.themeAuto",
};

export const AppearanceSection: React.FC<AppearanceSectionProps> = ({
  theme,
  onThemeChange,
  onSetActiveProfile,
  themeOverrides,
  onThemeOverridesChange,
}) => {
  const { t } = useTranslation();

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
      <h2 style={{ margin: 0 }}>{t("settings.appearance.sectionTitle")}</h2>

      <fieldset
        style={{ border: "1px solid var(--input-border)", borderRadius: 4, padding: 12 }}
      >
        <legend style={{ padding: "0 6px" }}>{t("settings.appearance.theme")}</legend>
        {THEMES.map((opt) => (
          <label
            key={opt}
            style={{ display: "flex", gap: 6, alignItems: "center", padding: 4 }}
          >
            <input
              type="radio"
              name="theme"
              checked={theme === opt}
              onChange={() => onThemeChange(opt)}
            />
            {t(THEME_KEY[opt])}
          </label>
        ))}
      </fieldset>

      {onThemeOverridesChange && (
        <ThemeCustomizer
          theme={theme}
          overrides={themeOverrides ?? null}
          onOverridesChange={onThemeOverridesChange}
        />
      )}

      {onSetActiveProfile && (
        <button
          type="button"
          data-testid="set-active-profile"
          onClick={onSetActiveProfile}
          style={{
            alignSelf: "flex-start",
            background: "var(--accent-bg)",
            color: "var(--accent-fg)",
            border: 0,
            borderRadius: 4,
            padding: "8px 16px",
            cursor: "pointer",
            font: "inherit",
          }}
        >
          {t("settings.profile.activate")}
        </button>
      )}
    </section>
  );
};
