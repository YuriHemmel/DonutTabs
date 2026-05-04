import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../core/i18n";
import { AppearanceSection } from "../AppearanceSection";
import type { Theme } from "../../core/types/Theme";

async function renderSection(overrides: Partial<{
  theme: Theme;
  onThemeChange: (t: Theme) => void;
  onSetActiveProfile: () => void;
}> = {}) {
  const i18n = await createI18n("pt-BR");
  const props = {
    theme: "dark" as Theme,
    onThemeChange: vi.fn(),
    ...overrides,
  };
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <AppearanceSection {...props} />
    </I18nextProvider>,
  );
  return { ...utils, props };
}

describe("AppearanceSection", () => {
  it("pre-selects the current theme radio", async () => {
    await renderSection({ theme: "light" });
    const light = screen.getByLabelText(/^claro$/i) as HTMLInputElement;
    const dark = screen.getByLabelText(/^escuro$/i) as HTMLInputElement;
    expect(light.checked).toBe(true);
    expect(dark.checked).toBe(false);
  });

  it("calls onThemeChange when a different radio is selected", async () => {
    const user = userEvent.setup();
    const { props } = await renderSection({ theme: "dark" });
    await user.click(screen.getByLabelText(/^claro$/i));
    expect(props.onThemeChange).toHaveBeenCalledWith("light");
  });

  it("does not render the set-active button when onSetActiveProfile is undefined", async () => {
    await renderSection();
    expect(screen.queryByTestId("set-active-profile")).toBeNull();
  });

  it("renders the set-active button and invokes the callback when clicked", async () => {
    const user = userEvent.setup();
    const onSetActiveProfile = vi.fn();
    await renderSection({ onSetActiveProfile });
    const btn = screen.getByTestId("set-active-profile");
    expect(btn).toBeTruthy();
    await user.click(btn);
    expect(onSetActiveProfile).toHaveBeenCalledTimes(1);
  });
});
