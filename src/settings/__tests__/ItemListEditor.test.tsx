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
      { kind: "url", value: "https://a", openWith: "" },
      { kind: "file", value: "/tmp/x", openWith: "" },
      { kind: "folder", value: "/tmp", openWith: "" },
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
      { kind: "url", value: "", openWith: "" },
      { kind: "file", value: "", openWith: "" },
      { kind: "folder", value: "", openWith: "" },
    ]);
    expect(screen.queryByTestId("item-browse-0")).toBeNull();
    expect(screen.getByTestId("item-browse-1")).toBeTruthy();
    expect(screen.getByTestId("item-browse-2")).toBeTruthy();
  });

  it("preserves the input value when switching kind", async () => {
    const { onChange } = await renderEditor([
      { kind: "url", value: "https://keepme", openWith: "" },
    ]);
    fireEvent.change(screen.getByTestId("item-kind-0"), {
      target: { value: "file" },
    });
    expect(onChange).toHaveBeenCalledWith([
      { kind: "file", value: "https://keepme", openWith: "" },
    ]);
  });

  it("typing in the value input emits onChange with the new value", async () => {
    const user = userEvent.setup();
    const { onChange } = await renderEditor([
      { kind: "file", value: "", openWith: "" },
    ]);
    const input = screen.getByTestId("item-value-0");
    await user.type(input, "x");
    expect(onChange).toHaveBeenLastCalledWith([
      { kind: "file", value: "x", openWith: "" },
    ]);
  });

  it("remove drops the row from values", async () => {
    const { onChange } = await renderEditor([
      { kind: "url", value: "a", openWith: "" },
      { kind: "url", value: "b", openWith: "" },
    ]);
    fireEvent.click(screen.getByTestId("item-remove-0"));
    expect(onChange).toHaveBeenCalledWith([
      { kind: "url", value: "b", openWith: "" },
    ]);
  });

  it("'+ Adicionar arquivo' appends a file row with empty value and openWith", async () => {
    const { onChange } = await renderEditor([
      { kind: "url", value: "https://a", openWith: "" },
    ]);
    fireEvent.click(screen.getByTestId("add-item-file"));
    expect(onChange).toHaveBeenCalledWith([
      { kind: "url", value: "https://a", openWith: "" },
      { kind: "file", value: "", openWith: "" },
    ]);
  });

  it("Browse on file row calls dialog.pickFile and writes the returned path", async () => {
    (dialog.pickFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      "C:/picked.pdf",
    );
    const { onChange } = await renderEditor([
      { kind: "file", value: "", openWith: "" },
    ]);
    fireEvent.click(screen.getByTestId("item-browse-0"));
    await Promise.resolve();
    await Promise.resolve();
    expect(dialog.pickFile).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith([
      { kind: "file", value: "C:/picked.pdf", openWith: "" },
    ]);
  });

  it("Browse on folder row calls dialog.pickFolder", async () => {
    (
      dialog.pickFolder as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue("/picked/dir");
    const { onChange } = await renderEditor([
      { kind: "folder", value: "", openWith: "" },
    ]);
    fireEvent.click(screen.getByTestId("item-browse-0"));
    await Promise.resolve();
    await Promise.resolve();
    expect(dialog.pickFolder).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith([
      { kind: "folder", value: "/picked/dir", openWith: "" },
    ]);
  });

  it("Browse cancel (null) does not change the value", async () => {
    (dialog.pickFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    const { onChange } = await renderEditor([
      { kind: "file", value: "old", openWith: "" },
    ]);
    fireEvent.click(screen.getByTestId("item-browse-0"));
    await Promise.resolve();
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders an openWith input on every row regardless of kind", async () => {
    await renderEditor([
      { kind: "url", value: "https://a", openWith: "" },
      { kind: "file", value: "/tmp/x", openWith: "" },
      { kind: "folder", value: "/tmp", openWith: "" },
    ]);
    expect(screen.getByTestId("item-open-with-0")).toBeTruthy();
    expect(screen.getByTestId("item-open-with-1")).toBeTruthy();
    expect(screen.getByTestId("item-open-with-2")).toBeTruthy();
  });

  it("typing in openWith emits onChange with the new openWith value", async () => {
    const user = userEvent.setup();
    const { onChange } = await renderEditor([
      { kind: "url", value: "https://a", openWith: "" },
    ]);
    const input = screen.getByTestId("item-open-with-0");
    await user.type(input, "f");
    expect(onChange).toHaveBeenLastCalledWith([
      { kind: "url", value: "https://a", openWith: "f" },
    ]);
  });

  it("renders the existing openWith value", async () => {
    await renderEditor([
      { kind: "url", value: "https://w", openWith: "edge" },
    ]);
    expect(
      (screen.getByTestId("item-open-with-0") as HTMLInputElement).value,
    ).toBe("edge");
  });
});
