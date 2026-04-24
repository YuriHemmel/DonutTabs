import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Donut } from "../Donut";
import type { Tab } from "../../core/types/Tab";

function makeTab(id: string, name: string): Tab {
  return {
    id,
    name,
    icon: null,
    order: 0,
    openMode: "reuseOrNewWindow",
    items: [{ kind: "url", value: "https://example.com" }],
  } as unknown as Tab;
}

describe("Donut", () => {
  it("renders one slice per tab", () => {
    const tabs = [makeTab("1", "A"), makeTab("2", "B"), makeTab("3", "C")];
    const { container } = render(<Donut tabs={tabs} size={400} onSelect={() => {}} />);
    const paths = container.querySelectorAll('[data-testid="donut-slice"]');
    expect(paths.length).toBe(3);
  });

  it("renders empty donut when no tabs", () => {
    const { container } = render(<Donut tabs={[]} size={400} onSelect={() => {}} />);
    const paths = container.querySelectorAll('[data-testid="donut-slice"]');
    expect(paths.length).toBe(0);
  });

  it("does not render a gear hit area when onOpenSettings is not provided", () => {
    const { container } = render(<Donut tabs={[]} size={400} onSelect={() => {}} />);
    expect(container.querySelector('[data-testid="gear-hit"]')).toBeNull();
  });

  it("calls onOpenSettings when clicking the gear hit area", () => {
    const onOpenSettings = vi.fn();
    const { container } = render(
      <Donut tabs={[]} size={400} onSelect={() => {}} onOpenSettings={onOpenSettings} />,
    );
    const hit = container.querySelector('[data-testid="gear-hit"]') as SVGRectElement;
    expect(hit).not.toBeNull();
    fireEvent.click(hit);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
