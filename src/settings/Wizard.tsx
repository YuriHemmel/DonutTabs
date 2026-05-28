import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Section } from "./SectionTabs";
import type { Language } from "../core/types/Language";
import type { SpawnPosition } from "../core/types/SpawnPosition";
import { WIZARD_MEDIA, isVideoSrc } from "./wizardMedia";

type SectionStepId =
  | "welcome"
  | "tabs"
  | "profiles"
  | "appearance"
  | "shortcut"
  | "system"
  | "about"
  | "done";
type DemoStepId =
  | "demoCreateTab"
  | "demoSubdonuts"
  | "demoGroupInDonut"
  | "demoProfileSwitch"
  | "demoSearchOverlay"
  | "demoQuickMode"
  | "demoSpawnPosition";

type WizardStep =
  | { kind: "section"; id: SectionStepId; section: Section }
  | { kind: "demo"; id: DemoStepId };

const STEPS: WizardStep[] = [
  { kind: "section", id: "welcome", section: "tabs" },
  { kind: "section", id: "tabs", section: "tabs" },
  { kind: "demo", id: "demoCreateTab" },
  { kind: "demo", id: "demoSubdonuts" },
  { kind: "demo", id: "demoGroupInDonut" },
  { kind: "section", id: "profiles", section: "profiles" },
  { kind: "demo", id: "demoProfileSwitch" },
  { kind: "section", id: "appearance", section: "appearance" },
  { kind: "section", id: "shortcut", section: "shortcut" },
  { kind: "demo", id: "demoSearchOverlay" },
  { kind: "section", id: "system", section: "system" },
  { kind: "demo", id: "demoQuickMode" },
  { kind: "demo", id: "demoSpawnPosition" },
  { kind: "section", id: "about", section: "about" },
  { kind: "section", id: "done", section: "tabs" },
];

/** Section steps que se referem à Settings real por trás → card desloca pro
 *  canto e o backdrop fica transparente. welcome/done são cerimoniais e
 *  ficam centralizados com dim suave. */
const CORNERED_SECTION_IDS = new Set<SectionStepId>([
  "tabs",
  "profiles",
  "appearance",
  "shortcut",
  "system",
  "about",
]);

interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  "data-testid"?: string;
  ariaLabel?: string;
}

/** Switch estilizado. Usa <input role="switch"> nativo pra acessibilidade;
 *  visual é puramente CSS via dois `<span>` (track + thumb). Click no track
 *  toggle; teclado segue padrão (espaço/enter no input). */
const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  "data-testid": testId,
  ariaLabel,
}) => (
  <span
    style={{
      position: "relative",
      display: "inline-block",
      width: 36,
      height: 20,
      flexShrink: 0,
    }}
  >
    <input
      type="checkbox"
      role="switch"
      data-testid={testId}
      aria-label={ariaLabel}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      style={{
        position: "absolute",
        inset: 0,
        opacity: 0,
        margin: 0,
        cursor: "pointer",
        width: "100%",
        height: "100%",
      }}
    />
    <span
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        background: checked ? "#3a8d5a" : "#3a4968",
        borderRadius: 10,
        transition: "background 120ms ease",
      }}
    />
    <span
      aria-hidden
      style={{
        position: "absolute",
        top: 2,
        left: checked ? 18 : 2,
        width: 16,
        height: 16,
        background: "#fff",
        borderRadius: "50%",
        transition: "left 120ms ease",
        boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
      }}
    />
  </span>
);

/** Renderiza mídia ilustrativa: `<video>` autoPlay/muted/loop pra MP4
 *  (smaller que GIF animado), `<img>` pra WebP/JPG estático. `flex: 1`
 *  pra dividir o espaço quando há mídia secundária ao lado. */
const WizardMedia: React.FC<{ src: string }> = ({ src }) => {
  if (isVideoSrc(src)) {
    return (
      <video
        src={src}
        autoPlay
        muted
        loop
        playsInline
        style={{
          flex: 1,
          minWidth: 0,
          maxHeight: 360,
          objectFit: "contain",
          display: "block",
          background: "#0e1422",
        }}
      />
    );
  }
  return (
    <img
      src={src}
      alt=""
      style={{
        flex: 1,
        minWidth: 0,
        maxHeight: 360,
        objectFit: "contain",
        display: "block",
        background: "#0e1422",
      }}
    />
  );
};

export interface WizardProps {
  open: boolean;
  onClose: () => void;
  onSectionChange: (section: Section) => void;
  shortcutDisplay: string;
  language: Language;
  onLanguageChange: (lang: Language) => void;
  autostart: boolean;
  onAutostartChange: (enabled: boolean) => void;
  allowScripts: boolean;
  onAllowScriptsChange: (enabled: boolean) => void;
  spawnPosition: SpawnPosition;
  onSpawnPositionChange: (pos: SpawnPosition) => void;
  quickMode: boolean;
  onQuickModeChange: (enabled: boolean) => void;
}

export const Wizard: React.FC<WizardProps> = ({
  open,
  onClose,
  onSectionChange,
  shortcutDisplay,
  language,
  onLanguageChange,
  autostart,
  onAutostartChange,
  allowScripts,
  onAllowScriptsChange,
  spawnPosition,
  onSpawnPositionChange,
  quickMode,
  onQuickModeChange,
}) => {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [confirmingSkip, setConfirmingSkip] = useState(false);

  // Reset ao reabrir (após pular/concluir e reabrir via botão).
  useEffect(() => {
    if (open) {
      setStepIndex(0);
      setConfirmingSkip(false);
    }
  }, [open]);

  const total = STEPS.length;
  const step = STEPS[stepIndex];

  // Section step troca a seção atrás; demo step mantém a última (irrelevante,
  // overlay opaco cobre o fundo).
  useEffect(() => {
    if (!open) return;
    if (step.kind === "section") {
      onSectionChange(step.section);
    }
  }, [open, step, onSectionChange]);

  const isLast = stepIndex === total - 1;

  const handleNext = () => {
    if (isLast) {
      onClose();
      return;
    }
    setStepIndex((i) => Math.min(i + 1, total - 1));
  };
  const handleBack = () => setStepIndex((i) => Math.max(0, i - 1));
  const handleSkipClick = () => {
    if (isLast) {
      onClose();
      return;
    }
    setConfirmingSkip(true);
  };
  const handleSkipConfirm = () => {
    setConfirmingSkip(false);
    onClose();
  };
  const handleSkipCancel = () => setConfirmingSkip(false);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (confirmingSkip) {
        handleSkipCancel();
      } else {
        handleSkipClick();
      }
    }
  };

  // Mídia ilustrativa: lookup em `WIZARD_MEDIA[stepId]`. Steps sem entry
  // caem no placeholder textual (mídia ainda não disponibilizada).
  const mediaEntry = step.kind === "demo" ? WIZARD_MEDIA[step.id] : undefined;

  if (!open) return null;

  const titleKey = `wizard.steps.${step.id}.title`;
  const bodyKey = `wizard.steps.${step.id}.body`;
  const isDemo = step.kind === "demo";
  // Section steps que comentam a UI por trás ficam num card menor no canto
  // superior direito, e o backdrop fica transparente pra revelar o Settings.
  const cornered = step.kind === "section" && CORNERED_SECTION_IDS.has(step.id);

  const backdropStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: cornered
      ? "transparent"
      : isDemo
        ? "rgba(0,0,0,0.78)"
        : "rgba(0,0,0,0.42)",
    // Quando o backdrop é transparente (cornered), liberamos pointer-events
    // pra deixar a Settings clicável atrás. O card filho re-habilita os
    // seus próprios eventos.
    pointerEvents: cornered ? "none" : "auto",
    display: "flex",
    alignItems: cornered ? "flex-start" : "center",
    justifyContent: cornered ? "flex-end" : "center",
    padding: cornered ? 24 : 0,
    zIndex: 1300,
  };

  const cardStyle: React.CSSProperties = {
    background: "#1b2436",
    color: "#eaeaea",
    border: "1px solid #3a4968",
    borderRadius: 10,
    padding: cornered ? 18 : 24,
    width: cornered ? "min(360px, 92vw)" : isDemo ? "min(720px, 94vw)" : "min(520px, 92vw)",
    maxHeight: "88vh",
    overflow: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    boxShadow: "0 16px 50px rgba(0,0,0,0.6)",
    fontSize: 14,
    pointerEvents: "auto",
  };

  return (
    <>
      <div
        data-testid="wizard-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={t(titleKey)}
        onKeyDown={handleKeyDown}
        tabIndex={-1}
        ref={(el) => {
          if (el && document.activeElement === document.body) el.focus();
        }}
        style={backdropStyle}
      >
        <div data-testid={`wizard-card-${step.id}`} style={cardStyle}>
          <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ fontSize: 11, color: "#9aa6bf", letterSpacing: 0.5 }}>
              {t("wizard.stepCounter", { current: stepIndex + 1, total })}
            </div>
            <h2 style={{ margin: 0, fontSize: cornered ? 16 : 18, color: "#ffd089" }}>
              {t(titleKey)}
            </h2>
          </header>

          {isDemo && (
            <figure
              data-testid="wizard-media"
              style={{
                margin: 0,
                padding: 0,
                background: "#0e1422",
                border: "1px solid #2a3550",
                borderRadius: 6,
                minHeight: 200,
                display: "flex",
                alignItems: "stretch",
                justifyContent: "center",
                overflow: "hidden",
                gap: mediaEntry?.secondary ? 6 : 0,
              }}
            >
              {mediaEntry ? (
                <>
                  <WizardMedia src={mediaEntry.primary} />
                  {mediaEntry.secondary && (
                    <WizardMedia src={mediaEntry.secondary} />
                  )}
                </>
              ) : (
                <span style={{ color: "#6c7a99", fontSize: 12, padding: 16 }}>
                  {t("wizard.mediaPlaceholder")}
                </span>
              )}
            </figure>
          )}

          <p
            style={{
              margin: 0,
              lineHeight: 1.5,
              color: "#d6dceb",
              fontSize: cornered ? 13 : 14,
              whiteSpace: "pre-line",
            }}
          >
            {t(bodyKey)}
          </p>

          {step.kind === "section" && step.id === "shortcut" && (
            <div style={{ fontSize: 13, color: "#9aa6bf" }}>
              {t("wizard.steps.shortcut.currentLabel")}{" "}
              <code
                style={{
                  background: "#0e1422",
                  border: "1px solid #2a3550",
                  borderRadius: 3,
                  padding: "2px 6px",
                  fontFamily: "ui-monospace, Menlo, Consolas, monospace",
                }}
              >
                {shortcutDisplay || "—"}
              </code>
            </div>
          )}

          {step.kind === "demo" && step.id === "demoQuickMode" && (
            <label
              style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}
            >
              <Switch
                data-testid="wizard-quick-mode"
                checked={quickMode}
                onChange={onQuickModeChange}
                ariaLabel={t("wizard.steps.demoQuickMode.quickModeLabel")}
              />
              {t("wizard.steps.demoQuickMode.quickModeLabel")}
            </label>
          )}

          {step.kind === "demo" && step.id === "demoSpawnPosition" && (
            <fieldset
              style={{
                border: "1px solid #2a3550",
                borderRadius: 6,
                padding: "10px 12px",
                margin: 0,
              }}
            >
              <legend
                style={{
                  padding: "0 6px",
                  fontSize: 12,
                  color: "#9aa6bf",
                }}
              >
                {t("wizard.steps.demoSpawnPosition.spawnPositionLabel")}
              </legend>
              <label
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  marginBottom: 4,
                }}
              >
                <input
                  type="radio"
                  name="wizard-spawn"
                  data-testid="wizard-spawn-cursor"
                  checked={spawnPosition === "cursor"}
                  onChange={() => onSpawnPositionChange("cursor")}
                />
                {t("wizard.spawnPositionCursor")}
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  type="radio"
                  name="wizard-spawn"
                  data-testid="wizard-spawn-center"
                  checked={spawnPosition === "center"}
                  onChange={() => onSpawnPositionChange("center")}
                />
                {t("wizard.spawnPositionCenter")}
              </label>
            </fieldset>
          )}

          {step.kind === "section" && step.id === "system" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <label
                style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}
              >
                {t("wizard.steps.system.languageLabel")}
                <select
                  data-testid="wizard-language"
                  value={language}
                  onChange={(e) => onLanguageChange(e.target.value as Language)}
                  style={{
                    background: "#0e1422",
                    color: "#eaeaea",
                    border: "1px solid #3a4968",
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
              <label
                style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}
              >
                <Switch
                  data-testid="wizard-autostart"
                  checked={autostart}
                  onChange={onAutostartChange}
                  ariaLabel={t("wizard.steps.system.autostartLabel")}
                />
                {t("wizard.steps.system.autostartLabel")}
              </label>
              <label
                style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}
              >
                <Switch
                  data-testid="wizard-allow-scripts"
                  checked={allowScripts}
                  onChange={onAllowScriptsChange}
                  ariaLabel={t("wizard.steps.system.allowScriptsLabel")}
                />
                {t("wizard.steps.system.allowScriptsLabel")}
              </label>
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: "#ffb366",
                  background: "#3a2a1e",
                  border: "1px solid #6a4e3a",
                  borderRadius: 4,
                  padding: "6px 8px",
                }}
              >
                ⚠ {t("wizard.steps.system.allowScriptsWarning")}
              </p>
            </div>
          )}

          <footer
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              marginTop: 4,
            }}
          >
            <button
              type="button"
              data-testid="wizard-skip"
              onClick={handleSkipClick}
              disabled={confirmingSkip}
              style={{
                background: "transparent",
                color: "#9aa6bf",
                border: "1px solid #2a3550",
                borderRadius: 4,
                padding: "6px 12px",
                cursor: confirmingSkip ? "not-allowed" : "pointer",
                font: "inherit",
              }}
            >
              {t("wizard.skip")}
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                data-testid="wizard-back"
                onClick={handleBack}
                disabled={stepIndex === 0}
                style={{
                  background: "transparent",
                  color: stepIndex === 0 ? "#4a5577" : "#eaeaea",
                  border: "1px solid #3a4968",
                  borderRadius: 4,
                  padding: "6px 14px",
                  cursor: stepIndex === 0 ? "not-allowed" : "pointer",
                  font: "inherit",
                }}
              >
                {t("wizard.back")}
              </button>
              <button
                type="button"
                data-testid="wizard-next"
                onClick={handleNext}
                style={{
                  background: "#3a4968",
                  color: "#fff",
                  border: "1px solid #3a4968",
                  borderRadius: 4,
                  padding: "6px 14px",
                  cursor: "pointer",
                  font: "inherit",
                }}
              >
                {isLast ? t("wizard.finish") : t("wizard.next")}
              </button>
            </div>
          </footer>
        </div>
      </div>

      {confirmingSkip && (
        <div
          data-testid="wizard-skip-confirm"
          role="alertdialog"
          aria-modal="true"
          aria-label={t("wizard.confirmSkipTitle")}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              handleSkipCancel();
            }
          }}
          tabIndex={-1}
          ref={(el) => {
            if (el && document.activeElement === document.body) el.focus();
          }}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1400,
          }}
        >
          <div
            style={{
              background: "#1b2436",
              color: "#eaeaea",
              border: "1px solid #6a4e3a",
              borderRadius: 10,
              padding: 22,
              width: "min(420px, 92vw)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
              boxShadow: "0 18px 60px rgba(0,0,0,0.65)",
              fontSize: 14,
            }}
          >
            <h3 style={{ margin: 0, fontSize: 16, color: "#ffb366" }}>
              {t("wizard.confirmSkipTitle")}
            </h3>
            <p style={{ margin: 0, color: "#d6dceb", lineHeight: 1.5 }}>
              {t("wizard.confirmSkipBody")}
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={handleSkipCancel}
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
                {t("wizard.confirmSkipNo")}
              </button>
              <button
                type="button"
                data-testid="wizard-skip-confirm-yes"
                onClick={handleSkipConfirm}
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
                {t("wizard.confirmSkipYes")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
