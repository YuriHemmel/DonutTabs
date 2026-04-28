import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../core/i18n";
import { ScriptConfirmModal } from "../ScriptConfirmModal";

async function renderModal(
  command: string,
  onConfirm = vi.fn(),
  onCancel = vi.fn(),
) {
  const i18n = await createI18n("pt-BR");
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <ScriptConfirmModal
        command={command}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </I18nextProvider>,
  );
  return { ...utils, onConfirm, onCancel };
}

describe("ScriptConfirmModal", () => {
  it("renders the command verbatim", async () => {
    await renderModal("git pull && cargo test");
    expect(screen.getByTestId("script-confirm-command").textContent).toBe(
      "git pull && cargo test",
    );
  });

  it("default-focuses the Cancel button (defense against Enter-spam)", async () => {
    await renderModal("ls");
    expect(document.activeElement).toBe(screen.getByTestId("script-confirm-cancel"));
  });

  it("Run without checkbox dispatches onConfirm(false)", async () => {
    const { onConfirm } = await renderModal("ls");
    fireEvent.click(screen.getByTestId("script-confirm-run"));
    expect(onConfirm).toHaveBeenCalledWith(false);
  });

  it("Run with checkbox dispatches onConfirm(true)", async () => {
    const { onConfirm } = await renderModal("ls");
    fireEvent.click(screen.getByTestId("script-confirm-trust"));
    fireEvent.click(screen.getByTestId("script-confirm-run"));
    expect(onConfirm).toHaveBeenCalledWith(true);
  });

  it("Cancel dispatches onCancel", async () => {
    const { onCancel } = await renderModal("ls");
    fireEvent.click(screen.getByTestId("script-confirm-cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("Escape dispatches onCancel", async () => {
    const { onCancel } = await renderModal("ls");
    fireEvent.keyDown(screen.getByTestId("script-confirm-overlay"), {
      key: "Escape",
    });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("dialog exposes aria-modal=true", async () => {
    await renderModal("ls");
    expect(
      screen.getByTestId("script-confirm-overlay").getAttribute("aria-modal"),
    ).toBe("true");
  });
});
