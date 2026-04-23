import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
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
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBe(3);
  });

  it("renders empty donut when no tabs", () => {
    const { container } = render(<Donut tabs={[]} size={400} onSelect={() => {}} />);
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBe(0);
  });
});
