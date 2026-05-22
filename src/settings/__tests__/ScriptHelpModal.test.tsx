import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../core/i18n";
import { ScriptHelpModal } from "../ScriptHelpModal";

async function renderWithI18n(open: boolean, onClose: () => void) {
  const i18n = await createI18n("pt-BR");
  return render(
    <I18nextProvider i18n={i18n}>
      <ScriptHelpModal open={open} onClose={onClose} />
    </I18nextProvider>,
  );
}

describe("ScriptHelpModal", () => {
  it("does not render when open=false", async () => {
    await renderWithI18n(false, () => {});
    expect(screen.queryByTestId("script-help-modal")).toBeNull();
  });

  it("renders title and example blocks when open=true", async () => {
    await renderWithI18n(true, () => {});
    expect(screen.getByTestId("script-help-modal")).toBeTruthy();
    expect(screen.getByText("Como usar scripts")).toBeTruthy();
    expect(screen.getByText('echo "Olá"')).toBeTruthy();
    expect(screen.getByText("git pull && cargo test")).toBeTruthy();
  });

  it("calls onClose when overlay clicked", async () => {
    const onClose = vi.fn();
    await renderWithI18n(true, onClose);
    fireEvent.click(screen.getByTestId("script-help-modal"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when close button clicked", async () => {
    const onClose = vi.fn();
    await renderWithI18n(true, onClose);
    fireEvent.click(screen.getByTestId("script-help-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on Escape", async () => {
    const onClose = vi.fn();
    await renderWithI18n(true, onClose);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("does NOT call onClose when clicking inside the dialog body", async () => {
    const onClose = vi.fn();
    await renderWithI18n(true, onClose);
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
