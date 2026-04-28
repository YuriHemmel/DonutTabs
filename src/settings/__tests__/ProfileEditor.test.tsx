import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
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
  allowScripts: false,
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

  it("renders translated server error when onSubmit rejects with AppError", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue({
      kind: "io",
      message: { code: "autostart_failed", context: { reason: "permission" } },
    });
    await renderEditor({ onSubmit });
    await user.type(screen.getByLabelText(/nome/i), "Trabalho");
    await user.click(screen.getByRole("button", { name: /^criar$/i }));
    await waitFor(() => {
      // Locale `errors.io.autostartFailed` interpola `reason`.
      expect(screen.getByText(/permission/i)).toBeTruthy();
    });
    // Botão volta ao estado normal (saving = false).
    expect(
      screen.getByRole("button", { name: /^criar$/i }),
    ).not.toHaveProperty("disabled", true);
  });

  it("preserves in-progress edits when initial reference changes for the same profile", async () => {
    // Reproduz o caso do `config-changed`: parent re-renderiza com novo objeto
    // Profile (mesmo id) — formulário NÃO deve resetar.
    const user = userEvent.setup();
    const i18n = await createI18n("pt-BR");
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    const initialA: Profile = { ...existing };
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <ProfileEditor
          mode="edit"
          initial={initialA}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      </I18nextProvider>,
    );
    const nameInput = screen.getByLabelText(/nome/i) as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Faculdade");
    expect(nameInput.value).toBe("Faculdade");

    // Novo objeto, mesmo id → simula `config-changed` repintando o parent.
    const initialB: Profile = { ...existing };
    rerender(
      <I18nextProvider i18n={i18n}>
        <ProfileEditor
          mode="edit"
          initial={initialB}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      </I18nextProvider>,
    );
    expect(
      (screen.getByLabelText(/nome/i) as HTMLInputElement).value,
    ).toBe("Faculdade");
  });

  it("resets fields when initial.id changes (different profile)", async () => {
    const user = userEvent.setup();
    const i18n = await createI18n("pt-BR");
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onCancel = vi.fn();
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <ProfileEditor
          mode="edit"
          initial={existing}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      </I18nextProvider>,
    );
    const nameInput = screen.getByLabelText(/nome/i) as HTMLInputElement;
    await user.clear(nameInput);
    await user.type(nameInput, "Faculdade");

    const other: Profile = { ...existing, id: "p2", name: "Estudo", icon: "📚" };
    rerender(
      <I18nextProvider i18n={i18n}>
        <ProfileEditor
          mode="edit"
          initial={other}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      </I18nextProvider>,
    );
    expect(
      (screen.getByLabelText(/nome/i) as HTMLInputElement).value,
    ).toBe("Estudo");
    expect(
      (screen.getByLabelText(/ícone/i) as HTMLInputElement).value,
    ).toBe("📚");
  });
});
