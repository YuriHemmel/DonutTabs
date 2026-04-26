import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import type { ComponentProps } from "react";
import { createI18n } from "../../core/i18n";
import { ProfileEditor } from "../ProfileEditor";
import type { Profile } from "../../core/types/Profile";

type Props = ComponentProps<typeof ProfileEditor>;

async function renderEditor(overrides: Partial<Props> = {}) {
  const i18n = await createI18n("pt-BR");
  const merged: Props = {
    mode: "new",
    initial: null,
    onSubmit: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn(),
    ...overrides,
  };
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <ProfileEditor {...merged} />
    </I18nextProvider>,
  );
  return { ...utils, props: merged };
}

const existing: Profile = {
  id: "p1",
  name: "Trabalho",
  icon: "💼",
  shortcut: "Ctrl+Space",
  theme: "dark",
  tabs: [],
};

describe("ProfileEditor", () => {
  it("requires a non-empty name", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor();
    await user.click(screen.getByRole("button", { name: /^criar$/i }));
    expect(screen.getByText(/obrigatório/i)).toBeTruthy();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("submits with valid name and null icon when icon left blank", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor();
    await user.type(screen.getByLabelText(/nome/i), "Estudo");
    await user.click(screen.getByRole("button", { name: /^criar$/i }));
    expect(props.onSubmit).toHaveBeenCalledWith({ name: "Estudo", icon: null });
  });

  it("submits with provided icon trimmed", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor();
    await user.type(screen.getByLabelText(/nome/i), "Trabalho");
    await user.type(screen.getByLabelText(/ícone/i), "📚");
    await user.click(screen.getByRole("button", { name: /^criar$/i }));
    expect(props.onSubmit).toHaveBeenCalledWith({
      name: "Trabalho",
      icon: "📚",
    });
  });

  it("strips letters from icon input as they are typed", async () => {
    const user = userEvent.setup();
    await renderEditor();
    const iconInput = screen.getByLabelText(/ícone/i) as HTMLInputElement;
    await user.type(iconInput, "abc");
    expect(iconInput.value).toBe("");
  });

  it("rejects an icon with more than one grapheme", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor();
    await user.type(screen.getByLabelText(/nome/i), "X");
    fireEvent.change(screen.getByLabelText(/ícone/i), {
      target: { value: "💼📝" },
    });
    await user.click(screen.getByRole("button", { name: /^criar$/i }));
    expect(screen.getByText(/único caractere ou emoji/i)).toBeTruthy();
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("prefills name and icon in edit mode", async () => {
    await renderEditor({ mode: "edit", initial: existing });
    expect((screen.getByLabelText(/nome/i) as HTMLInputElement).value).toBe(
      "Trabalho",
    );
    expect((screen.getByLabelText(/ícone/i) as HTMLInputElement).value).toBe("💼");
    expect(screen.getByRole("button", { name: /^salvar$/i })).toBeTruthy();
  });

  it("calls onCancel on cancel button", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor();
    await user.click(screen.getByRole("button", { name: /^cancelar$/i }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("clears icon to null when edit mode wipes the field", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor({ mode: "edit", initial: existing });
    const iconInput = screen.getByLabelText(/ícone/i) as HTMLInputElement;
    await user.clear(iconInput);
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    expect(props.onSubmit).toHaveBeenCalledWith({
      name: "Trabalho",
      icon: null,
    });
  });
});
