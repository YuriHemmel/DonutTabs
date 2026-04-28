import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import type { ComponentProps } from "react";
import { createI18n } from "../../core/i18n";
import { ThemeCustomizer } from "../ThemeCustomizer";
import { resolvePresetTokens } from "../../core/themeTokens";
import type { ThemeOverrides } from "../../core/types/ThemeOverrides";

type Props = ComponentProps<typeof ThemeCustomizer>;

async function renderCustomizer(overrides: Partial<Props> = {}) {
  const i18n = await createI18n("pt-BR");
  const merged: Props = {
    theme: "dark",
    overrides: null,
    onOverridesChange: vi.fn(),
    ...overrides,
  };
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <ThemeCustomizer {...merged} />
    </I18nextProvider>,
  );
  return { ...utils, props: merged };
}

describe("ThemeCustomizer", () => {
  it("renders the customizer fieldset and a preview", async () => {
    await renderCustomizer();
    expect(screen.getByTestId("theme-customizer")).toBeTruthy();
    expect(screen.getByTestId("mini-donut-preview")).toBeTruthy();
  });

  it("color picker reflects preset default when no override", async () => {
    await renderCustomizer({ overrides: null });
    const dark = resolvePresetTokens("dark");
    const sliceFill = screen.getByTestId("color-sliceFill") as HTMLInputElement;
    expect(sliceFill.value).toBe(dark.colors.sliceFill);
  });

  it("changing a color emits an override containing only that field", async () => {
    const onOverridesChange = vi.fn();
    await renderCustomizer({ onOverridesChange });
    const sliceFill = screen.getByTestId("color-sliceFill") as HTMLInputElement;
    fireEvent.change(sliceFill, { target: { value: "#abcdef" } });
    expect(onOverridesChange).toHaveBeenCalledTimes(1);
    const arg = onOverridesChange.mock.calls[0][0] as ThemeOverrides;
    expect(arg.colors?.sliceFill).toBe("#abcdef");
    expect(arg.colors?.sliceHighlight).toBeNull();
    expect(arg.dimensions).toBeNull();
    expect(arg.alpha).toBeNull();
  });

  it("alpha slider emits override with overlay set", async () => {
    const onOverridesChange = vi.fn();
    await renderCustomizer({ onOverridesChange });
    const slider = screen.getByTestId("alpha-overlay") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "0.5" } });
    expect(onOverridesChange).toHaveBeenCalled();
    const arg = onOverridesChange.mock.calls[0][0] as ThemeOverrides;
    expect(arg.alpha?.overlay).toBe(0.5);
  });

  it("inner-ratio slider emits override with innerRatio set", async () => {
    const onOverridesChange = vi.fn();
    await renderCustomizer({ onOverridesChange });
    const slider = screen.getByTestId("dim-inner") as HTMLInputElement;
    fireEvent.change(slider, { target: { value: "0.30" } });
    const arg = onOverridesChange.mock.calls[0][0] as ThemeOverrides;
    expect(arg.dimensions?.innerRatio).toBe(0.3);
    expect(arg.dimensions?.outerRatio).toBeNull();
  });

  it("reset-all clears overrides via onChange(null)", async () => {
    const onOverridesChange = vi.fn();
    await renderCustomizer({
      onOverridesChange,
      overrides: {
        colors: {
          sliceFill: "#111111",
          sliceHighlight: null,
          sliceStroke: null,
          centerFill: null,
          text: null,
        },
        dimensions: null,
        alpha: null,
      },
    });
    const reset = screen.getByTestId("theme-reset-all");
    fireEvent.click(reset);
    expect(onOverridesChange).toHaveBeenCalledWith(null);
  });

  it("clearing the only override returns null (compactOverrides)", async () => {
    const onOverridesChange = vi.fn();
    await renderCustomizer({
      onOverridesChange,
      overrides: {
        colors: {
          sliceFill: "#111111",
          sliceHighlight: null,
          sliceStroke: null,
          centerFill: null,
          text: null,
        },
        dimensions: null,
        alpha: null,
      },
    });
    // Per-color reset button (the ↺ next to the active sliceFill).
    const resetBtns = screen.getAllByLabelText(/restaurar padrão|reset/i);
    fireEvent.click(resetBtns[0]);
    // Como sliceFill era o único override, compactOverrides retorna null.
    expect(onOverridesChange).toHaveBeenLastCalledWith(null);
  });

  it("expands #RGB hex to #RRGGBB before binding to the color picker", async () => {
    // `<input type="color">` exige `#RRGGBB`; `#abc` (válido no schema Rust)
    // sem normalização é silenciosamente reescrito pelo navegador.
    await renderCustomizer({
      overrides: {
        colors: {
          sliceFill: "#abc",
          sliceHighlight: null,
          sliceStroke: null,
          centerFill: null,
          text: null,
        },
        dimensions: null,
        alpha: null,
      },
    });
    const sliceFill = screen.getByTestId("color-sliceFill") as HTMLInputElement;
    expect(sliceFill.value).toBe("#aabbcc");
  });

  it("preview reflects current overrides in real time", async () => {
    await renderCustomizer({
      overrides: {
        colors: {
          sliceFill: "#deadbe",
          sliceHighlight: null,
          sliceStroke: null,
          centerFill: null,
          text: null,
        },
        dimensions: null,
        alpha: null,
      },
    });
    const preview = screen.getByTestId("mini-donut-preview");
    // A primeira fatia é highlighted, então sliceFill aparece nas demais 3.
    const fills = Array.from(preview.querySelectorAll("path")).map((p) =>
      p.getAttribute("fill"),
    );
    expect(fills).toContain("#deadbe");
  });
});
