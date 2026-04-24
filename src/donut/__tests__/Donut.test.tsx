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
  it("renders one slice per tab plus a trailing '+' slice", () => {
    const tabs = [makeTab("1", "A"), makeTab("2", "B"), makeTab("3", "C")];
    const { container } = render(<Donut tabs={tabs} size={400} onSelect={() => {}} />);
    const paths = container.querySelectorAll('[data-testid="donut-slice"]');
    expect(paths.length).toBe(4);
  });

  it("renders a single '+' slice when no tabs are registered", () => {
    const { container } = render(<Donut tabs={[]} size={400} onSelect={() => {}} />);
    const paths = container.querySelectorAll('[data-testid="donut-slice"]');
    expect(paths.length).toBe(1);
  });

  it("clicking the '+' slice calls onOpenSettings", () => {
    const onOpenSettings = vi.fn();
    const onSelect = vi.fn();
    const { container } = render(
      <Donut
        tabs={[]}
        size={400}
        onSelect={onSelect}
        onOpenSettings={onOpenSettings}
      />,
    );
    const plusSlice = container.querySelector(
      '[data-testid="donut-slice"]',
    ) as SVGPathElement;
    fireEvent.click(plusSlice);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("clicking a tab slice calls onSelect with the tab id", () => {
    const onOpenSettings = vi.fn();
    const onSelect = vi.fn();
    const { container } = render(
      <Donut
        tabs={[makeTab("abc", "A")]}
        size={400}
        onSelect={onSelect}
        onOpenSettings={onOpenSettings}
      />,
    );
    const slices = container.querySelectorAll('[data-testid="donut-slice"]');
    // slices[0] = tab "A", slices[1] = "+"
    fireEvent.click(slices[0]);
    expect(onSelect).toHaveBeenCalledWith("abc");
    expect(onOpenSettings).not.toHaveBeenCalled();
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
