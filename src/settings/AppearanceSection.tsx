import React from "react";
import { useTranslation } from "react-i18next";
import type { Theme } from "../core/types/Theme";
import type { Language } from "../core/types/Language";
import type { ThemeOverrides } from "../core/types/ThemeOverrides";
import { ThemeCustomizer } from "./ThemeCustomizer";
import { UpdateCard } from "./UpdateCard";

export interface AppearanceSectionProps {
  theme: Theme;
  language: Language;
  autostart: boolean;
  onThemeChange: (theme: Theme) => void;
  onLanguageChange: (language: Language) => void;
  onAutostartChange: (enabled: boolean) => void;
  /** Backup do config.json para um arquivo arbitrário escolhido pelo user. */
  onExportConfig?: () => void;
  /** Substitui o config inteiro por um JSON externo. */
  onImportConfig?: () => void;
  /** Quando o perfil sob edição não é o ativo, mostra um botão pra ativá-lo. */
  onSetActiveProfile?: () => void;
  /** Plano 14: kill-switch global de scripts no perfil ativo. */
  allowScripts?: boolean;
  onAllowScriptsChange?: (allow: boolean) => void;
  /** Plano 15: overrides cosméticos do perfil em edição. */
  themeOverrides?: ThemeOverrides | null;
  onThemeOverridesChange?: (overrides: ThemeOverrides | null) => void;
  /** Plano 18: toggle global do check de update no startup. */
  autoCheckUpdates?: boolean;
  onAutoCheckUpdatesChange?: (enabled: boolean) => void;
  /** Plano 19: toggle global da captura de output de scripts. */
  scriptHistoryEnabled?: boolean;
  onScriptHistoryEnabledChange?: (enabled: boolean) => void;
}

const THEMES: Theme[] = ["dark", "light", "auto"];
const THEME_KEY: Record<Theme, string> = {
  dark: "settings.appearance.themeDark",
  light: "settings.appearance.themeLight",
  auto: "settings.appearance.themeAuto",
};

export const AppearanceSection: React.FC<AppearanceSectionProps> = ({
  theme,
  language,
  autostart,
  onThemeChange,
  onLanguageChange,
  onAutostartChange,
  onExportConfig,
  onImportConfig,
  onSetActiveProfile,
  allowScripts,
  onAllowScriptsChange,
  themeOverrides,
  onThemeOverridesChange,
  autoCheckUpdates,
  onAutoCheckUpdatesChange,
  scriptHistoryEnabled,
  onScriptHistoryEnabledChange,
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

      <label
        style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 320 }}
      >
        <span>{t("settings.appearance.language")}</span>
        <select
          value={language}
          onChange={(e) => onLanguageChange(e.target.value as Language)}
          style={{
            background: "var(--input-bg)",
            color: "var(--fg)",
            border: "1px solid var(--input-border)",
            borderRadius: 4,
            padding: "6px 8px",
            font: "inherit",
          }}
        >
          <option value="auto">{t("settings.appearance.languageAuto")}</option>
          <option value="ptBr">{t("settings.appearance.languagePtBr")}</option>
          <option value="en">{t("settings.appearance.languageEn")}</option>
        </select>
      </label>

      <fieldset
        style={{ border: "1px solid var(--input-border)", borderRadius: 4, padding: 12 }}
      >
        <legend style={{ padding: "0 6px" }}>{t("settings.system.title")}</legend>
        <label
          style={{ display: "flex", gap: 6, alignItems: "center", padding: 4 }}
        >
          <input
            type="checkbox"
            data-testid="autostart-toggle"
            checked={autostart}
            onChange={(e) => onAutostartChange(e.target.checked)}
          />
          {t("settings.system.autostart")}
        </label>
        <small style={{ color: "var(--muted)", display: "block", paddingLeft: 26 }}>
          {t("settings.system.autostartHint")}
        </small>

        {allowScripts !== undefined && onAllowScriptsChange && (
          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: "1px solid var(--input-border)",
            }}
          >
            <label
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                padding: 4,
              }}
            >
              <input
                type="checkbox"
                data-testid="allow-scripts-toggle"
                checked={allowScripts}
                onChange={(e) => onAllowScriptsChange(e.target.checked)}
              />
              {t("settings.system.allowScriptsLabel")}
            </label>
            <small
              style={{
                color: "var(--muted)",
                display: "block",
                paddingLeft: 26,
              }}
            >
              {t("settings.system.allowScriptsHint")}
            </small>
          </div>
        )}

        {autoCheckUpdates !== undefined && onAutoCheckUpdatesChange && (
          <UpdateCard
            autoCheckUpdates={autoCheckUpdates}
            onAutoCheckUpdatesChange={onAutoCheckUpdatesChange}
          />
        )}

        {scriptHistoryEnabled !== undefined && onScriptHistoryEnabledChange && (
          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: "1px solid var(--input-border)",
            }}
          >
            <label
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                padding: 4,
              }}
            >
              <input
                type="checkbox"
                data-testid="script-history-toggle"
                checked={scriptHistoryEnabled}
                onChange={(e) => onScriptHistoryEnabledChange(e.target.checked)}
              />
              {t("settings.system.scriptHistoryLabel")}
            </label>
            <small
              style={{
                color: "var(--muted)",
                display: "block",
                paddingLeft: 26,
              }}
            >
              {t("settings.system.scriptHistoryHint")}
            </small>
          </div>
        )}

        {(onExportConfig || onImportConfig) && (
          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: "1px solid var(--input-border)",
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {onExportConfig && (
                <button
                  type="button"
                  data-testid="export-config"
                  onClick={onExportConfig}
                  style={{
                    background: "transparent",
                    color: "var(--fg)",
                    border: "1px solid var(--ghost-border)",
                    borderRadius: 4,
                    padding: "6px 12px",
                    cursor: "pointer",
                    font: "inherit",
                  }}
                >
                  {t("settings.system.exportButton")}
                </button>
              )}
              {onImportConfig && (
                <button
                  type="button"
                  data-testid="import-config"
                  onClick={onImportConfig}
                  style={{
                    background: "transparent",
                    color: "var(--fg)",
                    border: "1px solid var(--ghost-border)",
                    borderRadius: 4,
                    padding: "6px 12px",
                    cursor: "pointer",
                    font: "inherit",
                  }}
                >
                  {t("settings.system.importButton")}
                </button>
              )}
            </div>
            <small style={{ color: "var(--muted)" }}>
              {t("settings.system.exportImportHint")}
            </small>
          </div>
        )}
      </fieldset>

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
