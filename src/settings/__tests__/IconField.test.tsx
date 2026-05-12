import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../core/i18n";
import { IconField } from "../IconField";

async function renderField(
  props: Partial<React.ComponentProps<typeof IconField>> = {},
) {
  const i18n = await createI18n("pt-BR");
  const onChange = vi.fn();
  const onRequestPicker = vi.fn();
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <IconField
        testId="test-icon"
        value={props.value ?? ""}
        onChange={props.onChange ?? onChange}
        onRequestPicker={props.onRequestPicker ?? onRequestPicker}
        placeholder={props.placeholder}
      />
    </I18nextProvider>,
  );
  return { ...utils, onChange, onRequestPicker };
}

describe("IconField", () => {
  it("renders an <input> when value is empty", async () => {
    await renderField({ value: "" });
    expect(screen.getByTestId("test-icon")).toBeTruthy();
    expect(screen.queryByTestId("test-icon-chip")).toBeNull();
  });

  it("renders a chip (not input) when value is an emoji literal", async () => {
    await renderField({ value: "🚀" });
    expect(screen.queryByTestId("test-icon")).toBeNull();
    const chip = screen.getByTestId("test-icon-chip");
    expect(chip).toBeTruthy();
    // chip mostra o emoji direto, sem campo de texto editável.
    expect(chip.textContent).toContain("🚀");
  });

  it("emoji chip icon button opens picker on click", async () => {
    const { onRequestPicker } = await renderField({ value: "🚀" });
    fireEvent.click(screen.getByTestId("test-icon-chip-icon"));
    expect(onRequestPicker).toHaveBeenCalledTimes(1);
  });

  it("emoji chip clear button emits onChange('') and switches back to input on next render", async () => {
    const { onChange, rerender } = await renderField({ value: "🚀" });
    fireEvent.click(screen.getByTestId("test-icon-chip-clear"));
    expect(onChange).toHaveBeenCalledWith("");
    const i18n = await createI18n("pt-BR");
    rerender(
      <I18nextProvider i18n={i18n}>
        <IconField
          testId="test-icon"
          value=""
          onChange={onChange}
          onRequestPicker={vi.fn()}
        />
      </I18nextProvider>,
    );
    expect(screen.getByTestId("test-icon")).toBeTruthy();
    expect(screen.queryByTestId("test-icon-chip")).toBeNull();
  });

  it("renders a chip (not input) when value is a lucide token", async () => {
    await renderField({ value: "lucide:Coffee" });
    expect(screen.queryByTestId("test-icon")).toBeNull();
    expect(screen.getByTestId("test-icon-chip")).toBeTruthy();
    // chip renderiza ícone (svg), não texto literal "lucide:Coffee"
    expect(screen.getByTestId("test-icon-chip").textContent).not.toContain(
      "lucide:",
    );
  });

  it("chip icon button opens picker on click", async () => {
    const { onRequestPicker } = await renderField({ value: "lucide:Coffee" });
    fireEvent.click(screen.getByTestId("test-icon-chip-icon"));
    expect(onRequestPicker).toHaveBeenCalledTimes(1);
  });

  it("chip clear button emits onChange('')", async () => {
    const { onChange } = await renderField({ value: "lucide:Coffee" });
    fireEvent.click(screen.getByTestId("test-icon-chip-clear"));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("input typing emits onChange with stripLetters applied (emoji preserved)", async () => {
    const { onChange } = await renderField({ value: "" });
    fireEvent.change(screen.getByTestId("test-icon"), {
      target: { value: "🚀" },
    });
    expect(onChange).toHaveBeenLastCalledWith("🚀");
  });

  it("input typing strips letters from text-only values", async () => {
    const { onChange } = await renderField({ value: "" });
    fireEvent.change(screen.getByTestId("test-icon"), {
      target: { value: "abc" },
    });
    // stripLetters drops ASCII letters — value de saída fica vazio.
    expect(onChange).toHaveBeenLastCalledWith("");
  });

  it("any non-empty value switches to chip on next render (lucide / emoji unified)", async () => {
    const { onChange, rerender } = await renderField({ value: "" });
    fireEvent.change(screen.getByTestId("test-icon"), {
      target: { value: "lucide:Star" },
    });
    expect(onChange).toHaveBeenCalledWith("lucide:Star");
    const i18n = await createI18n("pt-BR");
    rerender(
      <I18nextProvider i18n={i18n}>
        <IconField
          testId="test-icon"
          value="lucide:Star"
          onChange={onChange}
          onRequestPicker={vi.fn()}
        />
      </I18nextProvider>,
    );
    expect(screen.queryByTestId("test-icon")).toBeNull();
    expect(screen.getByTestId("test-icon-chip")).toBeTruthy();
  });
});
