import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../core/i18n";
import { ShortcutSection } from "../ShortcutSection";

async function renderSection(
  onCapture: (c: string) => Promise<void>,
  current = "CommandOrControl+Shift+Space",
) {
  const i18n = await createI18n("pt-BR");
  return render(
    <I18nextProvider i18n={i18n}>
      <ShortcutSection current={current} onCapture={onCapture} />
    </I18nextProvider>,
  );
}

describe("ShortcutSection", () => {
  it("forwards the captured combo to onCapture", async () => {
    const onCapture = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderSection(onCapture);

    await user.click(screen.getByRole("button", { name: /gravar novo atalho/i }));
    fireEvent.keyDown(window, { key: "D", ctrlKey: true, altKey: true });

    await waitFor(() =>
      expect(onCapture).toHaveBeenCalledWith("CommandOrControl+Alt+D"),
    );
  });

  it("shows a translated toast when onCapture rejects with an AppError", async () => {
    const rejection = {
      kind: "shortcut",
      message: {
        code: "shortcut_registration_failed",
        context: { combo: "x", reason: "in use" },
      },
    };
    const onCapture = vi.fn().mockRejectedValue(rejection);
    const user = userEvent.setup();
    await renderSection(onCapture);

    await user.click(screen.getByRole("button", { name: /gravar novo atalho/i }));
    fireEvent.keyDown(window, { key: "D", ctrlKey: true });

    await waitFor(() => {
      const alerts = screen.getAllByRole("alert");
      // o alert deve conter a mensagem traduzida de registrationFailed
      expect(alerts.some((a) => /não foi possível registrar o atalho/i.test(a.textContent ?? ""))).toBe(true);
    });
  });
});
