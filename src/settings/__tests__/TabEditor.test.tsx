import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import type { ComponentProps } from "react";
import { createI18n } from "../../core/i18n";
import { TabEditor } from "../TabEditor";
import type { Tab } from "../../core/types/Tab";

type Props = ComponentProps<typeof TabEditor>;

async function renderEditor(overrides: Partial<Props> = {}) {
  const i18n = await createI18n("pt-BR");
  const merged: Props = {
    mode: "new",
    initial: null,
    onSave: vi.fn().mockResolvedValue(undefined),
    onCancel: vi.fn(),
    onDelete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <TabEditor {...merged} />
    </I18nextProvider>,
  );
  return { ...utils, props: merged };
}

const existing: Tab = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Trabalho",
  icon: "💼",
  order: 0,
  openMode: "reuseOrNewWindow",
  items: [{ kind: "url", value: "https://example.com" }],
};

describe("TabEditor", () => {
  it("requires name or icon", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor();
    await user.type(screen.getByLabelText(/url 1/i), "https://ok.test");
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    expect(screen.getByText(/preencha nome ou ícone/i)).toBeTruthy();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("requires at least one URL", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor();
    await user.type(screen.getByLabelText(/nome/i), "A");
    await user.click(screen.getByRole("button", { name: /remover url/i }));
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    expect(screen.getByText(/adicione ao menos uma url/i)).toBeTruthy();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("rejects malformed URLs client-side", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor();
    await user.type(screen.getByLabelText(/nome/i), "A");
    await user.type(screen.getByLabelText(/url 1/i), "not a url");
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    expect(screen.getByText(/url inválida/i)).toBeTruthy();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("saves a valid new tab with only-icon", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor();
    await user.type(screen.getByLabelText(/ícone/i), "📝");
    await user.type(screen.getByLabelText(/url 1/i), "https://a.test");
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    expect(props.onSave).toHaveBeenCalledTimes(1);
    const payload = (props.onSave as ReturnType<typeof vi.fn>).mock.calls[0][0] as Tab;
    expect(payload.icon).toBe("📝");
    expect(payload.name).toBeNull();
    expect(payload.items).toHaveLength(1);
  });

  it("prefills fields when editing an existing tab", async () => {
    await renderEditor({ mode: "edit", initial: existing });
    expect((screen.getByLabelText(/nome/i) as HTMLInputElement).value).toBe("Trabalho");
    expect((screen.getByLabelText(/ícone/i) as HTMLInputElement).value).toBe("💼");
    expect((screen.getByLabelText(/url 1/i) as HTMLInputElement).value).toBe(
      "https://example.com",
    );
  });

  it("delete is only shown in edit mode and calls onDelete after confirm", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      const { props } = await renderEditor({ mode: "edit", initial: existing });
      await user.click(screen.getByRole("button", { name: /^excluir$/i }));
      expect(confirmSpy).toHaveBeenCalled();
      expect(props.onDelete).toHaveBeenCalledWith(existing.id);
    } finally {
      confirmSpy.mockRestore();
    }
  });

  it("does not render delete in new mode", async () => {
    await renderEditor({ mode: "new" });
    expect(screen.queryByRole("button", { name: /^excluir$/i })).toBeNull();
  });

  it("rejects an icon with more than one grapheme", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor();
    await user.type(screen.getByLabelText(/ícone/i), "ab");
    await user.type(screen.getByLabelText(/url 1/i), "https://a.test");
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    expect(screen.getByText(/único caractere ou emoji/i)).toBeTruthy();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("accepts a compound emoji as a single grapheme", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor();
    // bandeira do Brasil: 2 codepoints, 1 grafema
    await user.type(screen.getByLabelText(/ícone/i), "🇧🇷");
    await user.type(screen.getByLabelText(/url 1/i), "https://a.test");
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    expect(props.onSave).toHaveBeenCalledTimes(1);
  });

  it("icon input caps UTF-16 length at 16", async () => {
    await renderEditor();
    const iconInput = screen.getByLabelText(/ícone/i) as HTMLInputElement;
    expect(iconInput.maxLength).toBe(16);
  });

  it("does not render the open-mode selector", async () => {
    await renderEditor();
    expect(screen.queryByText(/modo de abertura/i)).toBeNull();
  });
});
