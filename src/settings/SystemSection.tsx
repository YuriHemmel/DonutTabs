import React from "react";
import { useTranslation } from "react-i18next";
import type { Language } from "../core/types/Language";
import type { SpawnPosition } from "../core/types/SpawnPosition";
import { groupStyle, legendStyle } from "./fieldsetStyles";

export interface SystemSectionProps {
  language: Language;
  onLanguageChange: (language: Language) => void;
  autostart: boolean;
  onAutostartChange: (enabled: boolean) => void;
  /** Backup do config.json para um arquivo arbitrário escolhido pelo user. */
  onExportConfig?: () => void;
  /** Substitui o config inteiro por um JSON externo. */
  onImportConfig?: () => void;
  /** Plano 14: kill-switch global de scripts no perfil em edição. */
  allowScripts?: boolean;
  onAllowScriptsChange?: (allow: boolean) => void;
  /** Issue #54 (rev) — habilita captura de saída de scripts E expõe a aba
   *  "Histórico" no Settings. Quando `false`, scripts continuam rodando mas
   *  saída não é capturada e a aba some da nav. */
  scriptHistoryEnabled?: boolean;
  onScriptHistoryEnabledChange?: (enabled: boolean) => void;
  /** Issue #52: posição inicial do donut quando aberto pelo atalho. */
  spawnPosition?: SpawnPosition;
  onSpawnPositionChange?: (position: SpawnPosition) => void;
  /** Plano 22: re-armar tutorial de boas-vindas na próxima manual launch.
   *  Quando ausente, o botão não renderiza. */
  onResetOnboarding?: () => void;
}

export const SystemSection: React.FC<SystemSectionProps> = ({
  language,
  onLanguageChange,
  autostart,
  onAutostartChange,
  onExportConfig,
  onImportConfig,
  allowScripts,
  onAllowScriptsChange,
  scriptHistoryEnabled,
  onScriptHistoryEnabledChange,
  spawnPosition,
  onSpawnPositionChange,
  onResetOnboarding,
}) => {
  const { t } = useTranslation();

  const showScripts =
    (allowScripts !== undefined && onAllowScriptsChange !== undefined) ||
    (scriptHistoryEnabled !== undefined &&
      onScriptHistoryEnabledChange !== undefined);

  const showBackupAndTutorial =
    !!onExportConfig || !!onImportConfig || !!onResetOnboarding;

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
      <h2 style={{ margin: 0 }}>{t("settings.sections.system")}</h2>

      {/* Geral: idioma + autostart. */}
      <fieldset style={groupStyle}>
        <legend style={legendStyle}>
          {t("settings.system.groups.general")}
        </legend>
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

        <div>
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
        </div>
      </fieldset>

      {/* Donut: posição de spawn. */}
      {spawnPosition !== undefined && onSpawnPositionChange && (
        <fieldset style={groupStyle}>
          <legend style={legendStyle}>
            {t("settings.system.groups.donut")}
          </legend>
          <div role="group" aria-label={t("settings.system.spawnPositionLegend")}>
            <div style={{ marginBottom: 4, fontSize: 14 }}>
              {t("settings.system.spawnPositionLegend")}
            </div>
            <label
              style={{ display: "flex", gap: 6, alignItems: "center", padding: 4 }}
            >
              <input
                type="radio"
                name="spawn-position"
                data-testid="spawn-position-cursor"
                checked={spawnPosition === "cursor"}
                onChange={() => onSpawnPositionChange("cursor")}
              />
              {t("settings.system.spawnPositionCursor")}
            </label>
            <label
              style={{ display: "flex", gap: 6, alignItems: "center", padding: 4 }}
            >
              <input
                type="radio"
                name="spawn-position"
                data-testid="spawn-position-center"
                checked={spawnPosition === "center"}
                onChange={() => onSpawnPositionChange("center")}
              />
              {t("settings.system.spawnPositionCenter")}
            </label>
            <small style={{ color: "var(--muted)", display: "block", paddingTop: 4 }}>
              {t("settings.system.spawnPositionHint")}
            </small>
          </div>
        </fieldset>
      )}

      {/* Scripts: kill-switch do perfil + captura de output. */}
      {showScripts && (
        <fieldset style={groupStyle}>
          <legend style={legendStyle}>
            {t("settings.system.groups.scripts")}
          </legend>
          {allowScripts !== undefined && onAllowScriptsChange && (
            <div>
              <label
                style={{ display: "flex", gap: 6, alignItems: "center", padding: 4 }}
              >
                <input
                  type="checkbox"
                  data-testid="allow-scripts-toggle"
                  checked={allowScripts}
                  onChange={(e) => onAllowScriptsChange(e.target.checked)}
                />
                {t("settings.system.allowScriptsLabel")}
              </label>
              <small style={{ color: "var(--muted)", display: "block", paddingLeft: 26 }}>
                {t("settings.system.allowScriptsHint")}
              </small>
            </div>
          )}

          {scriptHistoryEnabled !== undefined && onScriptHistoryEnabledChange && (
            <div>
              <label
                style={{ display: "flex", gap: 6, alignItems: "center", padding: 4 }}
              >
                <input
                  type="checkbox"
                  data-testid="script-history-toggle"
                  checked={scriptHistoryEnabled}
                  onChange={(e) => onScriptHistoryEnabledChange(e.target.checked)}
                />
                {t("settings.system.scriptHistoryLabel")}
              </label>
              <small style={{ color: "var(--muted)", display: "block", paddingLeft: 26 }}>
                {t("settings.system.scriptHistoryHint")}
              </small>
            </div>
          )}
        </fieldset>
      )}

      {/* Backup e tutorial: export/import + reset onboarding. */}
      {showBackupAndTutorial && (
        <fieldset style={groupStyle}>
          <legend style={legendStyle}>
            {t("settings.system.groups.backupAndTutorial")}
          </legend>

          {(onExportConfig || onImportConfig) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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

          {onResetOnboarding && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <button
                type="button"
                data-testid="reset-onboarding"
                onClick={onResetOnboarding}
                style={{
                  alignSelf: "flex-start",
                  background: "transparent",
                  color: "var(--fg)",
                  border: "1px solid var(--ghost-border)",
                  borderRadius: 4,
                  padding: "6px 12px",
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                {t("settings.system.resetOnboardingButton")}
              </button>
              <small style={{ color: "var(--muted)" }}>
                {t("settings.system.resetOnboardingHint")}
              </small>
            </div>
          )}
        </fieldset>
      )}
    </section>
  );
};
