import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import type { ComponentProps } from "react";
import { createI18n } from "../../core/i18n";
import { TabEditor, hasFirefoxUrlItem } from "../TabEditor";
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
  items: [{ kind: "url", value: "https://example.com", openWith: null, monitor: null , incognito: false}],
  kind: "leaf",
  children: [],
  focusIfOpen: false,
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

  it("requires at least one item", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor();
    await user.type(screen.getByLabelText(/nome/i), "A");
    await user.click(screen.getByRole("button", { name: /remover item/i }));
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    expect(screen.getByText(/adicione ao menos um item/i)).toBeTruthy();
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
    // Empty state mostra input; depois do change, IconField alterna pra chip.
    fireEvent.change(screen.getByTestId("tab-icon"), {
      target: { value: "📝" },
    });
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
    // Icon prefilled → chip mode (input não renderiza).
    expect(screen.queryByTestId("tab-icon")).toBeNull();
    const chip = screen.getByTestId("tab-icon-chip");
    expect(chip.textContent).toContain("💼");
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
    // dois emojis passam pelo filtro de letras mas falham na contagem de grafemas
    fireEvent.change(screen.getByLabelText(/ícone/i), {
      target: { value: "💼📝" },
    });
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

  it("icon input caps UTF-16 length at 64 to fit lucide: tokens", async () => {
    await renderEditor();
    const iconInput = screen.getByLabelText(/ícone/i) as HTMLInputElement;
    expect(iconInput.maxLength).toBe(64);
  });

  it("does not render the open-mode selector", async () => {
    await renderEditor();
    expect(screen.queryByText(/modo de abertura/i)).toBeNull();
  });

  it("does not let letters appear in the icon input as they are typed", async () => {
    const user = userEvent.setup();
    await renderEditor();
    const iconInput = screen.getByLabelText(/ícone/i) as HTMLInputElement;
    await user.type(iconInput, "abc");
    expect(iconInput.value).toBe("");
  });

  it("strips letters but keeps emoji when the value is set from a paste", async () => {
    await renderEditor();
    const iconInput = screen.getByTestId("tab-icon") as HTMLInputElement;
    fireEvent.change(iconInput, { target: { value: "💼Work" } });
    // stripLetters preserva o emoji; resultante non-empty → IconField vira chip.
    expect(screen.queryByTestId("tab-icon")).toBeNull();
    const chip = screen.getByTestId("tab-icon-chip");
    expect(chip.textContent).toContain("💼");
    expect(chip.textContent).not.toContain("Work");
  });

  it("keeps non-letter symbols like '★' and '→'", async () => {
    await renderEditor();
    const iconInput = screen.getByLabelText(/ícone/i) as HTMLInputElement;
    fireEvent.change(iconInput, { target: { value: "★" } });
    expect(iconInput.value).toBe("★");
    fireEvent.change(iconInput, { target: { value: "→" } });
    expect(iconInput.value).toBe("→");
  });

  it("saves a tab with mixed url + file + folder items", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor();
    await user.type(screen.getByLabelText(/nome/i), "Mix");
    // first row already URL — fill it
    fireEvent.change(screen.getByTestId("item-value-0"), {
      target: { value: "https://a.test" },
    });
    // add file row
    await user.click(screen.getByTestId("add-item-file"));
    fireEvent.change(screen.getByTestId("item-value-1"), {
      target: { value: "C:/x.txt" },
    });
    // add folder row
    await user.click(screen.getByTestId("add-item-folder"));
    fireEvent.change(screen.getByTestId("item-value-2"), {
      target: { value: "/tmp" },
    });
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    expect(props.onSave).toHaveBeenCalledTimes(1);
    const payload = (props.onSave as ReturnType<typeof vi.fn>).mock.calls[0][0] as Tab;
    expect(payload.items).toEqual([
      { kind: "url", value: "https://a.test", openWith: null, monitor: null , incognito: false},
      { kind: "file", path: "C:/x.txt", openWith: null, monitor: null },
      { kind: "folder", path: "/tmp", openWith: null, monitor: null },
    ]);
  });

  it("saves a file-only tab with no URL items", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor();
    await user.type(screen.getByLabelText(/nome/i), "OnlyFile");
    // remove default url row
    await user.click(screen.getByTestId("item-remove-0"));
    // add file row
    await user.click(screen.getByTestId("add-item-file"));
    fireEvent.change(screen.getByTestId("item-value-0"), {
      target: { value: "/home/me/doc.pdf" },
    });
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    expect(props.onSave).toHaveBeenCalledTimes(1);
    const payload = (props.onSave as ReturnType<typeof vi.fn>).mock.calls[0][0] as Tab;
    expect(payload.items).toEqual([
      { kind: "file", path: "/home/me/doc.pdf", openWith: null, monitor: null },
    ]);
  });

  it("file/folder items with empty paths are filtered out at submit", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor();
    await user.type(screen.getByLabelText(/nome/i), "Filter");
    fireEvent.change(screen.getByTestId("item-value-0"), {
      target: { value: "https://kept.test" },
    });
    await user.click(screen.getByTestId("add-item-file"));
    // leave file row empty
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    expect(props.onSave).toHaveBeenCalledTimes(1);
    const payload = (props.onSave as ReturnType<typeof vi.fn>).mock.calls[0][0] as Tab;
    expect(payload.items).toEqual([
      { kind: "url", value: "https://kept.test", openWith: null, monitor: null , incognito: false},
    ]);
  });

  it("Issue #45 — round-trips a pre-filled openWith via the dropdown's synthetic option", async () => {
    // Synthetic "Personalizado" option mantém o valor existente selecionável
    // mesmo sem o fetch dos installed apps (não roda sem mock no jsdom).
    const tabWithOpenWith: Tab = {
      ...existing,
      items: [
        { kind: "url", value: "https://work.test", openWith: "firefox", monitor: null , incognito: false},
      ],
    };
    const user = userEvent.setup();
    const { props } = await renderEditor({ mode: "edit", initial: tabWithOpenWith });
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    const payload = (props.onSave as ReturnType<typeof vi.fn>).mock.calls[0][0] as Tab;
    expect(payload.items).toEqual([
      { kind: "url", value: "https://work.test", openWith: "firefox", monitor: null , incognito: false},
    ]);
  });

  it("preserves incognito flag through save round-trip", async () => {
    // Regressão: handleSubmit rebuilds drafts antes de draftToItem; campo
    // `incognito` precisa ser carregado nessa rebuild senão o flag some.
    const tab: Tab = {
      ...existing,
      items: [
        {
          kind: "url",
          value: "https://x.test",
          openWith: "Firefox",
          monitor: null,
          incognito: false,
        },
      ],
    };
    const user = userEvent.setup();
    const { props } = await renderEditor({ mode: "edit", initial: tab });
    fireEvent.click(screen.getByTestId("item-incognito-0"));
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    const payload = (props.onSave as ReturnType<typeof vi.fn>).mock.calls[0][0] as Tab;
    const first = payload.items[0];
    if (first.kind !== "url") throw new Error("expected url item");
    expect(first.incognito).toBe(true);
  });

  it("preserves incognito flag when openWith is empty (default browser path)", async () => {
    const tab: Tab = {
      ...existing,
      items: [
        {
          kind: "url",
          value: "https://x.test",
          openWith: null,
          monitor: null,
          incognito: false,
        },
      ],
    };
    const user = userEvent.setup();
    const { props } = await renderEditor({ mode: "edit", initial: tab });
    fireEvent.click(screen.getByTestId("item-incognito-0"));
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    const payload = (props.onSave as ReturnType<typeof vi.fn>).mock.calls[0][0] as Tab;
    const first = payload.items[0];
    if (first.kind !== "url") throw new Error("expected url item");
    expect(first.incognito).toBe(true);
    expect(first.openWith).toBeNull();
  });

  it("saves openWith as null when set back to default", async () => {
    const tabWithOpenWith: Tab = {
      ...existing,
      items: [
        { kind: "url", value: "https://x.test", openWith: "firefox", monitor: null , incognito: false},
      ],
    };
    const user = userEvent.setup();
    const { props } = await renderEditor({ mode: "edit", initial: tabWithOpenWith });
    fireEvent.change(screen.getByTestId("item-open-with-0"), {
      target: { value: "" },
    });
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    const payload = (props.onSave as ReturnType<typeof vi.fn>).mock.calls[0][0] as Tab;
    const first = payload.items[0];
    if (first.kind !== "url") throw new Error("expected url item");
    expect(first.openWith).toBeNull();
  });

  it("prefills openWith from an existing tab item", async () => {
    const tabWithOpenWith: Tab = {
      ...existing,
      items: [
        { kind: "url", value: "https://a.test", openWith: "edge", monitor: null , incognito: false},
      ],
    };
    await renderEditor({ mode: "edit", initial: tabWithOpenWith });
    expect(
      (screen.getByTestId("item-open-with-0") as HTMLInputElement).value,
    ).toBe("edge");
  });

  it("saves an app item with the right kind and name", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor();
    await user.type(screen.getByLabelText(/nome/i), "Browser");
    // Default row is URL; remove and add app
    await user.click(screen.getByTestId("item-remove-0"));
    await user.click(screen.getByTestId("add-item-app"));
    fireEvent.change(screen.getByTestId("item-value-0"), {
      target: { value: "firefox" },
    });
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    const payload = (props.onSave as ReturnType<typeof vi.fn>).mock.calls[0][0] as Tab;
    expect(payload.items).toEqual([{ kind: "app", name: "firefox", monitor: null }]);
  });

  it("saves a script item with trusted=false by default", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor();
    await user.type(screen.getByLabelText(/nome/i), "Build");
    await user.click(screen.getByTestId("item-remove-0"));
    await user.click(screen.getByTestId("add-item-script"));
    fireEvent.change(screen.getByTestId("item-value-0"), {
      target: { value: "cargo build" },
    });
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    const payload = (props.onSave as ReturnType<typeof vi.fn>).mock.calls[0][0] as Tab;
    expect(payload.items).toEqual([
      {
        kind: "script",
        command: "cargo build",
        trusted: false,
        monitor: null,
        shell: null,
      },
    ]);
  });

  it("saves an empty group with kind=group preserved (regression: empty group → leaf round-trip bug)", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor({ mode: "new" });
    await user.type(screen.getByLabelText(/nome/i), "Trabalho");
    // Select kind=group radio.
    await user.click(screen.getByTestId("tab-kind-group"));
    // No buttons to add children in mode=new — hint shown instead.
    expect(screen.getByTestId("group-new-hint")).toBeTruthy();
    expect(screen.queryByTestId("add-child-leaf")).toBeNull();
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    const payload = (props.onSave as ReturnType<typeof vi.fn>).mock.calls[0][0] as Tab;
    expect(payload.kind).toBe("group");
    expect(payload.items).toEqual([]);
    expect(payload.children).toEqual([]);
  });

  it("shows the kind radio at root level (currentDepth=1)", async () => {
    // Issue #103 — no root o usuário ainda escolhe Aba vs Grupo.
    await renderEditor({ mode: "new", currentDepth: 1 });
    expect(screen.queryByTestId("tab-kind-leaf")).toBeTruthy();
    expect(screen.queryByTestId("tab-kind-group")).toBeTruthy();
  });

  it("hides the kind radio inside a group (currentDepth>1) and renders the leaf item editor", async () => {
    // Issue #103 — dentro de um grupo só é possível criar aba (leaf); o tipo
    // "Grupo" some e o ItemListEditor (leaf) é renderizado direto.
    await renderEditor({ mode: "new", currentDepth: 2 });
    expect(screen.queryByTestId("tab-kind-leaf")).toBeNull();
    expect(screen.queryByTestId("tab-kind-group")).toBeNull();
    expect(screen.getByLabelText(/url 1/i)).toBeTruthy();
    expect(screen.queryByTestId("group-new-hint")).toBeNull();
  });

  it("shows a subtitle naming the parent group when creating inside it", async () => {
    // Issue #103 — indicação visual de qual grupo está recebendo a aba.
    await renderEditor({ mode: "new", currentDepth: 2, parentGroupName: "Trabalho" });
    const subtitle = screen.getByTestId("new-tab-in-group-subtitle");
    expect(subtitle.textContent).toContain("Trabalho");
  });

  it("does not show the group subtitle at root level", async () => {
    await renderEditor({ mode: "new", currentDepth: 1 });
    expect(screen.queryByTestId("new-tab-in-group-subtitle")).toBeNull();
  });

  it("preserves kind=group when re-editing an empty group (regression)", async () => {
    const emptyGroup: Tab = {
      id: "22222222-2222-2222-2222-222222222222",
      name: "Vazio",
      icon: null,
      order: 0,
      openMode: "reuseOrNewWindow",
      items: [],
      kind: "group",
      children: [],
      focusIfOpen: false,
    };
    const user = userEvent.setup();
    const { props } = await renderEditor({ mode: "edit", initial: emptyGroup });
    // GroupChildrenEditor must be visible — not the leaf ItemListEditor.
    expect(screen.getByTestId("group-children-editor")).toBeTruthy();
    expect(screen.queryByText(/url 1/i)).toBeNull();
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    const payload = (props.onSave as ReturnType<typeof vi.fn>).mock.calls[0][0] as Tab;
    expect(payload.kind).toBe("group");
  });

  it("preserves trusted=true when editing a script item", async () => {
    const tabWithTrustedScript: Tab = {
      ...existing,
      items: [
        {
          kind: "script",
          command: "git pull",
          trusted: true,
          monitor: null,
          shell: null,
        },
      ],
    };
    const user = userEvent.setup();
    const { props } = await renderEditor({
      mode: "edit",
      initial: tabWithTrustedScript,
    });
    expect(
      screen.getByTestId("item-script-trusted-0").getAttribute("aria-checked"),
    ).toBe("true");
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    const payload = (props.onSave as ReturnType<typeof vi.fn>).mock.calls[0][0] as Tab;
    expect(payload.items).toEqual([
      {
        kind: "script",
        command: "git pull",
        trusted: true,
        monitor: null,
        shell: null,
      },
    ]);
  });

  // ---------- Issue #64: script shell selector ----------

  it("submits script item with selected shell", async () => {
    const tab: Tab = {
      ...existing,
      items: [
        {
          kind: "script",
          command: "ls",
          trusted: false,
          monitor: null,
          shell: null,
        },
      ],
    };
    const user = userEvent.setup();
    const { props } = await renderEditor({ mode: "edit", initial: tab });
    fireEvent.change(screen.getByTestId("item-script-shell-0"), {
      target: { value: "powershell" },
    });
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    const payload = (props.onSave as ReturnType<typeof vi.fn>).mock.calls[0][0] as Tab;
    const first = payload.items[0];
    if (first.kind !== "script") throw new Error("expected script item");
    expect(first.shell).toBe("powershell");
  });

  it("submits script item with shell=null when default selected", async () => {
    const tab: Tab = {
      ...existing,
      items: [
        {
          kind: "script",
          command: "ls",
          trusted: false,
          monitor: null,
          shell: "bash",
        },
      ],
    };
    const user = userEvent.setup();
    const { props } = await renderEditor({ mode: "edit", initial: tab });
    fireEvent.change(screen.getByTestId("item-script-shell-0"), {
      target: { value: "" },
    });
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    const payload = (props.onSave as ReturnType<typeof vi.fn>).mock.calls[0][0] as Tab;
    const first = payload.items[0];
    if (first.kind !== "script") throw new Error("expected script item");
    expect(first.shell).toBeNull();
  });

  // ---------- Plano 24: focus_if_open toggle ----------

  it("defaults focus_if_open to false in new tab and submits it", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor();
    const checkbox = screen.getByTestId("tab-focus-if-open");
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
    await user.type(screen.getByLabelText(/nome/i), "Foo");
    await user.type(screen.getByLabelText(/url 1/i), "https://ok.test");
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    const payload = (props.onSave as ReturnType<typeof vi.fn>).mock.calls[0][0] as Tab;
    expect(payload.focusIfOpen).toBe(false);
  });

  it("toggling focus_if_open propagates to the save payload", async () => {
    const user = userEvent.setup();
    const { props } = await renderEditor({ mode: "edit", initial: existing });
    const checkbox = screen.getByTestId("tab-focus-if-open");
    expect(checkbox.getAttribute("aria-checked")).toBe("false");
    await user.click(checkbox);
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    const payload = (props.onSave as ReturnType<typeof vi.fn>).mock.calls[0][0] as Tab;
    expect(payload.focusIfOpen).toBe(true);
  });

  it("hydrates focus_if_open from initial tab when editing", async () => {
    const focused: Tab = { ...existing, focusIfOpen: true };
    await renderEditor({ mode: "edit", initial: focused });
    const checkbox = screen.getByTestId("tab-focus-if-open");
    expect(checkbox.getAttribute("aria-checked")).toBe("true");
  });

  it("shows Firefox warning when focus_if_open=true and a URL uses openWith=Firefox", async () => {
    const firefoxTab: Tab = {
      ...existing,
      focusIfOpen: true,
      items: [
        {
          kind: "url",
          value: "https://x.test",
          openWith: "Firefox",
          monitor: null,
          incognito: false,
        },
      ],
    };
    await renderEditor({ mode: "edit", initial: firefoxTab });
    expect(screen.getByTestId("tab-focus-firefox-warning")).toBeTruthy();
  });

  it("hides Firefox warning when focus_if_open is off (even with Firefox openWith)", async () => {
    const firefoxTab: Tab = {
      ...existing,
      focusIfOpen: false,
      items: [
        {
          kind: "url",
          value: "https://x.test",
          openWith: "Firefox",
          monitor: null,
          incognito: false,
        },
      ],
    };
    await renderEditor({ mode: "edit", initial: firefoxTab });
    expect(screen.queryByTestId("tab-focus-firefox-warning")).toBeNull();
  });

  it("hides Firefox warning when no URL uses Firefox (even with focus_if_open on)", async () => {
    const chromeTab: Tab = {
      ...existing,
      focusIfOpen: true,
      items: [
        {
          kind: "url",
          value: "https://x.test",
          openWith: "Google Chrome",
          monitor: null,
          incognito: false,
        },
      ],
    };
    await renderEditor({ mode: "edit", initial: chromeTab });
    expect(screen.queryByTestId("tab-focus-firefox-warning")).toBeNull();
  });
});

describe("hasFirefoxUrlItem", () => {
  it("matches exact 'Firefox' case-insensitively", () => {
    expect(
      hasFirefoxUrlItem([{ kind: "url", openWith: "Firefox" }]),
    ).toBe(true);
    expect(
      hasFirefoxUrlItem([{ kind: "url", openWith: "firefox" }]),
    ).toBe(true);
    expect(
      hasFirefoxUrlItem([{ kind: "url", openWith: "FIREFOX" }]),
    ).toBe(true);
  });

  it("matches Firefox variants (paths, suffixes)", () => {
    expect(
      hasFirefoxUrlItem([{ kind: "url", openWith: "/Applications/Firefox.app" }]),
    ).toBe(true);
    expect(
      hasFirefoxUrlItem([{ kind: "url", openWith: "Firefox Developer Edition" }]),
    ).toBe(true);
  });

  it("ignores Firefox openWith on non-URL items", () => {
    expect(
      hasFirefoxUrlItem([{ kind: "file", openWith: "Firefox" }]),
    ).toBe(false);
    expect(
      hasFirefoxUrlItem([{ kind: "folder", openWith: "firefox" }]),
    ).toBe(false);
  });

  it("returns false for Chrome/Safari/empty", () => {
    expect(
      hasFirefoxUrlItem([{ kind: "url", openWith: "Google Chrome" }]),
    ).toBe(false);
    expect(hasFirefoxUrlItem([{ kind: "url", openWith: "" }])).toBe(false);
    expect(hasFirefoxUrlItem([{ kind: "url", openWith: "   " }])).toBe(false);
    expect(hasFirefoxUrlItem([])).toBe(false);
  });

  it("returns true if at least one item matches in a mixed list", () => {
    expect(
      hasFirefoxUrlItem([
        { kind: "url", openWith: "Chrome" },
        { kind: "url", openWith: "Firefox" },
        { kind: "url", openWith: "" },
      ]),
    ).toBe(true);
  });
});
