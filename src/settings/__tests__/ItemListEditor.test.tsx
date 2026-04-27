import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../core/i18n";
import { ItemListEditor, type ItemDraft } from "../ItemListEditor";

vi.mock("../../core/ipc", () => ({
  dialog: {
    pickFile: vi.fn(),
    pickFolder: vi.fn(),
  },
}));

import { dialog } from "../../core/ipc";

beforeEach(() => {
  vi.clearAllMocks();
});

async function renderEditor(values: ItemDraft[]) {
  const i18n = await createI18n("pt-BR");
  const onChange = vi.fn();
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <ItemListEditor values={values} onChange={onChange} />
    </I18nextProvider>,
  );
  return { ...utils, onChange };
}

describe("ItemListEditor", () => {
  it("renders one row per item with the right kind selected", async () => {
    await renderEditor([
      { kind: "url", value: "https://a" },
      { kind: "file", value: "/tmp/x" },
      { kind: "folder", value: "/tmp" },
    ]);
    expect(
      (screen.getByTestId("item-kind-0") as HTMLSelectElement).value,
    ).toBe("url");
    expect(
      (screen.getByTestId("item-kind-1") as HTMLSelectElement).value,
    ).toBe("file");
    expect(
      (screen.getByTestId("item-kind-2") as HTMLSelectElement).value,
    ).toBe("folder");
  });

  it("only shows the Browse button for file/folder rows", async () => {
    await renderEditor([
      { kind: "url", value: "" },
      { kind: "file", value: "" },
      { kind: "folder", value: "" },
    ]);
    expect(screen.queryByTestId("item-browse-0")).toBeNull();
    expect(screen.getByTestId("item-browse-1")).toBeTruthy();
    expect(screen.getByTestId("item-browse-2")).toBeTruthy();
  });

  it("preserves the input value when switching kind", async () => {
    const { onChange } = await renderEditor([
      { kind: "url", value: "https://keepme" },
    ]);
    fireEvent.change(screen.getByTestId("item-kind-0"), {
      target: { value: "file" },
    });
    expect(onChange).toHaveBeenCalledWith([
      { kind: "file", value: "https://keepme" },
    ]);
  });

  it("typing in the value input emits onChange with the new value", async () => {
    const user = userEvent.setup();
    const { onChange } = await renderEditor([{ kind: "file", value: "" }]);
    const input = screen.getByTestId("item-value-0");
    await user.type(input, "x");
    expect(onChange).toHaveBeenLastCalledWith([{ kind: "file", value: "x" }]);
  });

  it("remove drops the row from values", async () => {
    const { onChange } = await renderEditor([
      { kind: "url", value: "a" },
      { kind: "url", value: "b" },
    ]);
    fireEvent.click(screen.getByTestId("item-remove-0"));
    expect(onChange).toHaveBeenCalledWith([{ kind: "url", value: "b" }]);
  });

  it("'+ Adicionar arquivo' appends a file row with empty value", async () => {
    const { onChange } = await renderEditor([
      { kind: "url", value: "https://a" },
    ]);
    fireEvent.click(screen.getByTestId("add-item-file"));
    expect(onChange).toHaveBeenCalledWith([
      { kind: "url", value: "https://a" },
      { kind: "file", value: "" },
    ]);
  });

  it("Browse on file row calls dialog.pickFile and writes the returned path", async () => {
    (dialog.pickFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      "C:/picked.pdf",
    );
    const { onChange } = await renderEditor([{ kind: "file", value: "" }]);
    fireEvent.click(screen.getByTestId("item-browse-0"));
    // wait microtask
    await Promise.resolve();
    await Promise.resolve();
    expect(dialog.pickFile).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith([
      { kind: "file", value: "C:/picked.pdf" },
    ]);
  });

  it("Browse on folder row calls dialog.pickFolder", async () => {
    (
      dialog.pickFolder as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue("/picked/dir");
    const { onChange } = await renderEditor([{ kind: "folder", value: "" }]);
    fireEvent.click(screen.getByTestId("item-browse-0"));
    await Promise.resolve();
    await Promise.resolve();
    expect(dialog.pickFolder).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith([
      { kind: "folder", value: "/picked/dir" },
    ]);
  });

  it("Browse cancel (null) does not change the value", async () => {
    (dialog.pickFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    const { onChange } = await renderEditor([
      { kind: "file", value: "old" },
    ]);
    fireEvent.click(screen.getByTestId("item-browse-0"));
    await Promise.resolve();
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();
  });
});
