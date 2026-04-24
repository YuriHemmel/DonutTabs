import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { PaginationDots } from "../PaginationDots";

function renderInSvg(ui: React.ReactElement) {
  return render(<svg width={400} height={400}>{ui}</svg>);
}

describe("PaginationDots", () => {
  it("renders nothing when total is 1", () => {
    const { container } = renderInSvg(
      <PaginationDots total={1} active={0} cx={200} cy={380} onChange={() => {}} />,
    );
    expect(container.querySelector('[data-testid="pagination-dots"]')).toBeNull();
  });

  it("renders N dots and marks the active one", () => {
    const { container } = renderInSvg(
      <PaginationDots total={3} active={1} cx={200} cy={380} onChange={() => {}} />,
    );
    const dots = container.querySelectorAll('[data-testid^="pagination-dot-"]');
    expect(dots).toHaveLength(3);
    expect(dots[0].getAttribute("data-active")).toBe("false");
    expect(dots[1].getAttribute("data-active")).toBe("true");
    expect(dots[2].getAttribute("data-active")).toBe("false");
  });

  it("calls onChange with the clicked dot's index", () => {
    const onChange = vi.fn();
    const { container } = renderInSvg(
      <PaginationDots total={3} active={0} cx={200} cy={380} onChange={onChange} />,
    );
    const dot2 = container.querySelector(
      '[data-testid="pagination-dot-2"]',
    ) as SVGCircleElement;
    fireEvent.click(dot2);
    expect(onChange).toHaveBeenCalledWith(2);
  });
});
