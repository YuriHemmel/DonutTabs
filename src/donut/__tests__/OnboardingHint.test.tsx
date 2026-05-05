import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../core/i18n";
import { OnboardingHint } from "../OnboardingHint";

async function renderHint(shortcut: string) {
  const i18n = await createI18n("pt-BR");
  const onDismiss = vi.fn();
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <OnboardingHint shortcut={shortcut} onDismiss={onDismiss} />
    </I18nextProvider>,
  );
  return { ...utils, onDismiss };
}

describe("OnboardingHint", () => {
  it("renders welcome title and dismiss button", async () => {
    await renderHint("CommandOrControl+Shift+Space");
    expect(screen.getByTestId("onboarding-hint")).toBeTruthy();
    expect(screen.getByTestId("onboarding-dismiss")).toBeTruthy();
    // Title content should be present (pt-BR).
    expect(screen.getByText(/bem-vindo/i)).toBeTruthy();
  });

  it("renders shortcut with friendly modifier substitution", async () => {
    await renderHint("CommandOrControl+Shift+Space");
    // jsdom default platform isn't Mac → CommandOrControl → Ctrl.
    const body = screen.getByText(/ctrl \+ shift \+ space/i);
    expect(body).toBeTruthy();
  });

  it("dismiss button click triggers onDismiss", async () => {
    const { onDismiss } = await renderHint("CommandOrControl+F");
    fireEvent.click(screen.getByTestId("onboarding-dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("renders even with empty shortcut (defensive)", async () => {
    await renderHint("");
    expect(screen.getByTestId("onboarding-hint")).toBeTruthy();
  });
});
