import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../core/i18n";
import { Breadcrumb } from "../Breadcrumb";

async function renderBreadcrumb(
  props: { segments: string[]; onJumpTo?: (i: number) => void },
) {
  const i18n = await createI18n("pt-BR");
  const onJumpTo = props.onJumpTo ?? vi.fn();
  return {
    ...render(
      <I18nextProvider i18n={i18n}>
        <Breadcrumb segments={props.segments} onJumpTo={onJumpTo} />
      </I18nextProvider>,
    ),
    onJumpTo,
  };
}

describe("Breadcrumb", () => {
  it("renders nothing when segments is empty", async () => {
    const { container } = await renderBreadcrumb({ segments: [] });
    expect(container.querySelector("[data-testid='donut-breadcrumb']")).toBeNull();
  });

  it("renders root + all segments", async () => {
    await renderBreadcrumb({ segments: ["Trabalho", "Comunicação"] });
    expect(screen.getByTestId("donut-breadcrumb")).toBeTruthy();
    expect(screen.getByTestId("breadcrumb-root")).toBeTruthy();
    expect(screen.getByTestId("breadcrumb-current")).toBeTruthy();
  });

  it("clicking root calls onJumpTo(-1)", async () => {
    const { onJumpTo } = await renderBreadcrumb({ segments: ["A"] });
    fireEvent.click(screen.getByTestId("breadcrumb-root"));
    expect(onJumpTo).toHaveBeenCalledWith(-1);
  });

  it("clicking intermediate segment calls onJumpTo(index)", async () => {
    const { onJumpTo } = await renderBreadcrumb({
      segments: ["G1", "G2", "G3"],
    });
    fireEvent.click(screen.getByTestId("breadcrumb-segment-0"));
    expect(onJumpTo).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByTestId("breadcrumb-segment-1"));
    expect(onJumpTo).toHaveBeenCalledWith(1);
  });

  it("last segment is not a button", async () => {
    await renderBreadcrumb({ segments: ["A", "B"] });
    // Apenas índice 0 é botão; índice 1 (último) é o "current".
    expect(screen.queryByTestId("breadcrumb-segment-1")).toBeNull();
    expect(screen.getByTestId("breadcrumb-current")).toBeTruthy();
  });
});
