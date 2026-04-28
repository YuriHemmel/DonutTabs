import React from "react";
import { useTranslation } from "react-i18next";
import type { Theme } from "../core/types/Theme";
import type { ThemeOverrides } from "../core/types/ThemeOverrides";
import type { ThemeColors } from "../core/types/ThemeColors";
import type { ThemeDimensions } from "../core/types/ThemeDimensions";
import {
  resolvePresetForTheme,
  resolvePresetTokens,
  mergeOverrides,
} from "../core/themeTokens";
import { MiniDonutPreview } from "./MiniDonutPreview";

export interface ThemeCustomizerProps {
  theme: Theme;
  overrides: ThemeOverrides | null;
  onOverridesChange: (overrides: ThemeOverrides | null) => void;
}

type ColorField =
  | "sliceFill"
  | "sliceHighlight"
  | "sliceStroke"
  | "centerFill"
  | "text";

const COLOR_FIELDS: { key: ColorField; labelKey: string }[] = [
  { key: "sliceFill", labelKey: "settings.appearance.colorSliceFill" },
  { key: "sliceHighlight", labelKey: "settings.appearance.colorSliceHighlight" },
  { key: "sliceStroke", labelKey: "settings.appearance.colorSliceStroke" },
  { key: "centerFill", labelKey: "settings.appearance.colorCenterFill" },
  { key: "text", labelKey: "settings.appearance.colorText" },
];

/**
 * Remove subgrupos vazios para evitar persistir `{colors: {sliceFill: null,
 * ...todos null}}`. Retorna `null` se nenhum override sobrou (tudo voltou
 * pro default do preset).
 */
function compactOverrides(o: ThemeOverrides): ThemeOverrides | null {
  const colorsHasValue = o.colors
    ? Object.values(o.colors).some((v) => v != null)
    : false;
  const dimsHasValue = o.dimensions
    ? Object.values(o.dimensions).some((v) => v != null)
    : false;
  const alphaHasValue = o.alpha
    ? Object.values(o.alpha).some((v) => v != null)
    : false;
  if (!colorsHasValue && !dimsHasValue && !alphaHasValue) return null;
  return {
    colors: colorsHasValue ? o.colors : null,
    dimensions: dimsHasValue ? o.dimensions : null,
    alpha: alphaHasValue ? o.alpha : null,
  };
}

const EMPTY_COLORS: ThemeColors = {
  sliceFill: null,
  sliceHighlight: null,
  sliceStroke: null,
  centerFill: null,
  text: null,
};

const EMPTY_DIMENSIONS: ThemeDimensions = {
  innerRatio: null,
  outerRatio: null,
};

function emptyOverrides(): ThemeOverrides {
  return {
    colors: { ...EMPTY_COLORS },
    dimensions: { ...EMPTY_DIMENSIONS },
    alpha: { overlay: null },
  };
}

/**
 * `<input type="color">` exige `#RRGGBB` (HTML spec); strings `#RGB` (3-char,
 * aceitas pelo validate Rust) são silenciosamente reescritas pelo navegador.
 * Expande pra 6 chars antes de bind no input para preservar o valor visível.
 */
function normalizeHexForPicker(hex: string): string {
  if (hex.length === 4 && hex[0] === "#") {
    return `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  return hex;
}

export const ThemeCustomizer: React.FC<ThemeCustomizerProps> = ({
  theme,
  overrides,
  onOverridesChange,
}) => {
  const { t } = useTranslation();
  const preset = resolvePresetForTheme(theme);
  const baseTokens = resolvePresetTokens(preset);
  const previewTokens = mergeOverrides(baseTokens, overrides);

  const setColor = (field: ColorField, value: string | null) => {
    const next = overrides ?? emptyOverrides();
    const base: ThemeColors = next.colors ?? EMPTY_COLORS;
    const colors: ThemeColors = {
      sliceFill: base.sliceFill,
      sliceHighlight: base.sliceHighlight,
      sliceStroke: base.sliceStroke,
      centerFill: base.centerFill,
      text: base.text,
    };
    colors[field] = value;
    onOverridesChange(
      compactOverrides({
        colors,
        dimensions: next.dimensions,
        alpha: next.alpha,
      }),
    );
  };

  const setDimension = (field: "innerRatio" | "outerRatio", value: number | null) => {
    const next = overrides ?? emptyOverrides();
    const base: ThemeDimensions = next.dimensions ?? EMPTY_DIMENSIONS;
    const dimensions: ThemeDimensions = {
      innerRatio: base.innerRatio,
      outerRatio: base.outerRatio,
    };
    dimensions[field] = value;
    onOverridesChange(
      compactOverrides({
        colors: next.colors,
        dimensions,
        alpha: next.alpha,
      }),
    );
  };

  const setAlpha = (value: number | null) => {
    const next = overrides ?? emptyOverrides();
    onOverridesChange(
      compactOverrides({
        colors: next.colors,
        dimensions: next.dimensions,
        alpha: { overlay: value },
      }),
    );
  };

  const reset = () => onOverridesChange(null);

  return (
    <fieldset
      data-testid="theme-customizer"
      style={{
        border: "1px solid var(--input-border)",
        borderRadius: 4,
        padding: 12,
      }}
    >
      <legend style={{ padding: "0 6px" }}>
        {t("settings.appearance.themeCustomTitle")}
      </legend>
      <small
        style={{
          color: "var(--muted)",
          display: "block",
          marginBottom: 12,
        }}
      >
        {t("settings.appearance.themeCustomHint")}
      </small>

      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
          {COLOR_FIELDS.map(({ key, labelKey }) => {
            const value = overrides?.colors?.[key] ?? baseTokens.colors[key];
            const isOverridden = overrides?.colors?.[key] != null;
            return (
              <label
                key={key}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                }}
              >
                <input
                  data-testid={`color-${key}`}
                  type="color"
                  value={normalizeHexForPicker(value)}
                  onChange={(e) => setColor(key, e.target.value)}
                  style={{
                    width: 36,
                    height: 24,
                    padding: 0,
                    border: "1px solid var(--input-border)",
                    borderRadius: 2,
                    cursor: "pointer",
                  }}
                />
                <span style={{ flex: 1 }}>{t(labelKey)}</span>
                {isOverridden && (
                  <button
                    type="button"
                    onClick={() => setColor(key, null)}
                    aria-label={t("settings.appearance.themeReset")}
                    style={{
                      background: "transparent",
                      color: "var(--muted)",
                      border: 0,
                      cursor: "pointer",
                      fontSize: 12,
                    }}
                  >
                    ↺
                  </button>
                )}
              </label>
            );
          })}

          <Slider
            testId="alpha-overlay"
            label={t("settings.appearance.alphaOverlay")}
            value={overrides?.alpha?.overlay ?? baseTokens.alpha.overlay}
            min={0}
            max={1}
            step={0.05}
            isOverridden={overrides?.alpha?.overlay != null}
            onChange={(v) => setAlpha(v)}
            onReset={() => setAlpha(null)}
          />
          <Slider
            testId="dim-inner"
            label={t("settings.appearance.dimensionInnerRatio")}
            value={overrides?.dimensions?.innerRatio ?? baseTokens.dimensions.innerRatio}
            min={0.05}
            max={0.45}
            step={0.01}
            isOverridden={overrides?.dimensions?.innerRatio != null}
            onChange={(v) => setDimension("innerRatio", v)}
            onReset={() => setDimension("innerRatio", null)}
          />
          <Slider
            testId="dim-outer"
            label={t("settings.appearance.dimensionOuterRatio")}
            value={overrides?.dimensions?.outerRatio ?? baseTokens.dimensions.outerRatio}
            min={0.3}
            max={0.5}
            step={0.01}
            isOverridden={overrides?.dimensions?.outerRatio != null}
            onChange={(v) => setDimension("outerRatio", v)}
            onReset={() => setDimension("outerRatio", null)}
          />

          {overrides && (
            <button
              type="button"
              data-testid="theme-reset-all"
              onClick={reset}
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
              {t("settings.appearance.themeReset")}
            </button>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <small style={{ color: "var(--muted)" }}>
            {t("settings.appearance.themePreviewLabel")}
          </small>
          <MiniDonutPreview tokens={previewTokens} />
        </div>
      </div>
    </fieldset>
  );
};

interface SliderProps {
  testId: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  isOverridden: boolean;
  onChange: (value: number) => void;
  onReset: () => void;
}

const Slider: React.FC<SliderProps> = ({
  testId,
  label,
  value,
  min,
  max,
  step,
  isOverridden,
  onChange,
  onReset,
}) => (
  <label
    style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
  >
    <input
      data-testid={testId}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ flex: "0 0 110px" }}
    />
    <span style={{ flex: 1 }}>{label}</span>
    <span
      style={{
        color: "var(--muted)",
        fontVariantNumeric: "tabular-nums",
        fontSize: 12,
        minWidth: 36,
        textAlign: "right",
      }}
    >
      {value.toFixed(2)}
    </span>
    {isOverridden && (
      <button
        type="button"
        onClick={onReset}
        aria-label="reset"
        style={{
          background: "transparent",
          color: "var(--muted)",
          border: 0,
          cursor: "pointer",
          fontSize: 12,
        }}
      >
        ↺
      </button>
    )}
  </label>
);
