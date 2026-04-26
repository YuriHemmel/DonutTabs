import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { IconRenderer } from "../IconRenderer";

function renderInSvg(ui: React.ReactElement) {
  return render(
    <svg width={50} height={50}>
      <g transform="translate(25 25)">{ui}</g>
    </svg>,
  );
}

describe("IconRenderer", () => {
  it("renders a Lucide component when icon starts with lucide:", () => {
    const { container } = renderInSvg(<IconRenderer icon="lucide:Coffee" />);
    expect(container.querySelector("foreignObject")).not.toBeNull();
    expect(container.querySelector("foreignObject svg")).not.toBeNull();
  });

  it("falls back to text when the Lucide name is unknown", () => {
    const { container } = renderInSvg(
      <IconRenderer icon="lucide:DefinitelyNotARealIcon" fallback="A" />,
    );
    expect(container.querySelector("foreignObject")).toBeNull();
    expect(container.querySelector("text")?.textContent).toBe("A");
  });

  it("renders an SVG <image> for an http URL", () => {
    const { container } = renderInSvg(
      <IconRenderer icon="https://example.com/fav.png" />,
    );
    const img = container.querySelector("image");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("href")).toBe("https://example.com/fav.png");
  });

  it("renders an SVG <image> for a data URL", () => {
    const { container } = renderInSvg(
      <IconRenderer icon="data:image/png;base64,xxx" />,
    );
    expect(container.querySelector("image")).not.toBeNull();
  });

  it("renders an emoji literal as <text>", () => {
    const { container } = renderInSvg(<IconRenderer icon="☕" />);
    expect(container.querySelector("text")?.textContent).toBe("☕");
    expect(container.querySelector("image")).toBeNull();
  });

  it("renders the fallback when icon is null", () => {
    const { container } = renderInSvg(
      <IconRenderer icon={null} fallback="X" />,
    );
    expect(container.querySelector("text")?.textContent).toBe("X");
  });
});
