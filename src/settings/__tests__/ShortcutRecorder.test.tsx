import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../core/i18n";
import { ShortcutRecorder } from "../ShortcutRecorder";

async function renderRecorder(overrides: Partial<{
  current: string;
  onCapture: (c: string) => void;
}> = {}) {
  const i18n = await createI18n("pt-BR");
  const props = {
    current: "CommandOrControl+Shift+Space",
    onCapture: vi.fn(),
    ...overrides,
  };
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <ShortcutRecorder {...props} />
    </I18nextProvider>,
  );
  return { ...utils, props };
}

describe("ShortcutRecorder", () => {
  it("shows the current shortcut", async () => {
    await renderRecorder({ current: "CommandOrControl+Alt+D" });
    expect(screen.getByText(/CommandOrControl\+Alt\+D/)).toBeTruthy();
  });

  it("enters recording state when clicking the record button", async () => {
    const user = userEvent.setup();
    await renderRecorder();
    await user.click(screen.getByRole("button", { name: /gravar novo atalho/i }));
    expect(screen.getByText(/pressione a combinação/i)).toBeTruthy();
  });

  it("captures a valid combo and calls onCapture", async () => {
    const user = userEvent.setup();
    const { props } = await renderRecorder();
    await user.click(screen.getByRole("button", { name: /gravar novo atalho/i }));

    fireEvent.keyDown(window, {
      key: "D",
      ctrlKey: true,
      shiftKey: true,
    });

    expect(props.onCapture).toHaveBeenCalledWith("CommandOrControl+Shift+D");
    // após capturar, volta ao estado idle
    expect(screen.queryByText(/pressione a combinação/i)).toBeNull();
  });

  it("ESC cancels recording without calling onCapture", async () => {
    const user = userEvent.setup();
    const { props } = await renderRecorder();
    await user.click(screen.getByRole("button", { name: /gravar novo atalho/i }));

    fireEvent.keyDown(window, { key: "Escape" });

    expect(props.onCapture).not.toHaveBeenCalled();
    expect(screen.queryByText(/pressione a combinação/i)).toBeNull();
  });

  it("shows reserved-key error and stays recording", async () => {
    const user = userEvent.setup();
    const { props } = await renderRecorder();
    await user.click(screen.getByRole("button", { name: /gravar novo atalho/i }));

    fireEvent.keyDown(window, { key: "Tab", ctrlKey: true });
    expect(screen.getByText(/tecla reservada/i)).toBeTruthy();
    expect(props.onCapture).not.toHaveBeenCalled();
    // continua em modo gravação
    expect(screen.getByText(/pressione a combinação/i)).toBeTruthy();
  });

  it("shows noModifier error for a plain letter", async () => {
    const user = userEvent.setup();
    const { props } = await renderRecorder();
    await user.click(screen.getByRole("button", { name: /gravar novo atalho/i }));

    fireEvent.keyDown(window, { key: "a" });
    expect(screen.getByText(/inclua um modificador/i)).toBeTruthy();
    expect(props.onCapture).not.toHaveBeenCalled();
  });

  it("swallowing a modifier-only keydown keeps recording without error", async () => {
    const user = userEvent.setup();
    const { props } = await renderRecorder();
    await user.click(screen.getByRole("button", { name: /gravar novo atalho/i }));

    fireEvent.keyDown(window, { key: "Control", ctrlKey: true });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(props.onCapture).not.toHaveBeenCalled();
    expect(screen.getByText(/pressione a combinação/i)).toBeTruthy();
  });
});
