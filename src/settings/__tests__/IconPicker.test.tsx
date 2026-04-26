import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../core/i18n";
import { IconPicker } from "../IconPicker";

async function renderPicker(
  onSelect = vi.fn(),
  onClose = vi.fn(),
  open = true,
) {
  const i18n = await createI18n("pt-BR");
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <IconPicker open={open} onSelect={onSelect} onClose={onClose} />
    </I18nextProvider>,
  );
  return { ...utils, onSelect, onClose };
}

describe("IconPicker", () => {
  it("returns null when closed", () => {
    const { container } = render(
      <IconPicker open={false} onSelect={() => {}} onClose={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("emits the literal emoji when an emoji preset is clicked", async () => {
    const { onSelect, onClose } = await renderPicker();
    fireEvent.click(screen.getByTestId("icon-picker-emoji-☕"));
    expect(onSelect).toHaveBeenCalledWith("☕");
    expect(onClose).toHaveBeenCalled();
  });

  it("emits a `lucide:Name` token when a Lucide icon is clicked", async () => {
    const user = userEvent.setup();
    const { onSelect } = await renderPicker();
    await user.click(screen.getByTestId("icon-picker-tab-lucide"));
    fireEvent.click(screen.getByTestId("icon-picker-lucide-Coffee"));
    expect(onSelect).toHaveBeenCalledWith("lucide:Coffee");
  });

  it("filters Lucide icons by search substring", async () => {
    const user = userEvent.setup();
    await renderPicker();
    await user.click(screen.getByTestId("icon-picker-tab-lucide"));
    const input = screen.getByTestId("icon-picker-search");
    await user.type(input, "Coff");
    expect(screen.getByTestId("icon-picker-lucide-Coffee")).toBeTruthy();
    expect(screen.queryByTestId("icon-picker-lucide-Briefcase")).toBeNull();
  });

  it("closes on Escape", async () => {
    const { onClose } = await renderPicker();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
