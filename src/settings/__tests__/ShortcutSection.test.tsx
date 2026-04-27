import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../core/i18n";
import { ShortcutSection } from "../ShortcutSection";

async function renderSection(
  onCapture: (c: string) => Promise<void>,
  current = "CommandOrControl+Shift+Space",
  overrides: {
    searchShortcut?: string;
    onCaptureSearchShortcut?: (c: string) => Promise<void>;
  } = {},
) {
  const i18n = await createI18n("pt-BR");
  return render(
    <I18nextProvider i18n={i18n}>
      <ShortcutSection
        current={current}
        onCapture={onCapture}
        searchShortcut={overrides.searchShortcut ?? "CommandOrControl+F"}
        onCaptureSearchShortcut={
          overrides.onCaptureSearchShortcut ??
          (async () => {
            /* noop */
          })
        }
      />
    </I18nextProvider>,
  );
}

describe("ShortcutSection", () => {
  it("forwards the captured combo to onCapture (global shortcut)", async () => {
    const onCapture = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderSection(onCapture);

    // Two recorders are rendered (global + search). Click the FIRST.
    const recordButtons = screen.getAllByRole("button", {
      name: /gravar novo atalho/i,
    });
    await user.click(recordButtons[0]);
    fireEvent.keyDown(window, { key: "D", ctrlKey: true, altKey: true });

    await waitFor(() =>
      expect(onCapture).toHaveBeenCalledWith("CommandOrControl+Alt+D"),
    );
  });

  it("forwards the captured combo to onCaptureSearchShortcut (search shortcut)", async () => {
    const onCaptureSearchShortcut = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderSection(vi.fn(), undefined, { onCaptureSearchShortcut });

    const recordButtons = screen.getAllByRole("button", {
      name: /gravar novo atalho/i,
    });
    await user.click(recordButtons[1]);
    fireEvent.keyDown(window, { key: "G", ctrlKey: true, altKey: true });

    await waitFor(() =>
      expect(onCaptureSearchShortcut).toHaveBeenCalledWith("CommandOrControl+Alt+G"),
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

    const recordButtons = screen.getAllByRole("button", {
      name: /gravar novo atalho/i,
    });
    await user.click(recordButtons[0]);
    fireEvent.keyDown(window, { key: "D", ctrlKey: true });

    await waitFor(() => {
      const alerts = screen.getAllByRole("alert");
      expect(alerts.some((a) => /não foi possível registrar o atalho/i.test(a.textContent ?? ""))).toBe(true);
    });
  });

  it("renders the search shortcut current value in its recorder", async () => {
    await renderSection(vi.fn(), undefined, {
      searchShortcut: "Ctrl+Alt+S",
    });
    // The search recorder is the second; its display element should carry
    // the searchShortcut value somewhere.
    const recorders = screen.getAllByText(/ctrl/i);
    const hasSearch = recorders.some((el) =>
      /alt\+?s/i.test(el.textContent ?? ""),
    );
    expect(hasSearch).toBe(true);
  });
});
