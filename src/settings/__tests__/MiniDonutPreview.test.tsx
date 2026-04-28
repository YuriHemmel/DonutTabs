import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MiniDonutPreview } from "../MiniDonutPreview";
import { resolvePresetTokens } from "../../core/themeTokens";

describe("MiniDonutPreview", () => {
  it("renders 4 slice paths + 1 center circle", () => {
    const tokens = resolvePresetTokens("dark");
    const { getByTestId } = render(<MiniDonutPreview tokens={tokens} />);
    const svg = getByTestId("mini-donut-preview");
    expect(svg.querySelectorAll("path").length).toBe(4);
    expect(svg.querySelectorAll("circle").length).toBe(1);
  });

  it("uses tokens colors for fill/stroke/text", () => {
    const tokens = resolvePresetTokens("dark");
    const { getByTestId } = render(<MiniDonutPreview tokens={tokens} />);
    const svg = getByTestId("mini-donut-preview");
    const paths = Array.from(svg.querySelectorAll("path"));
    // 1ª fatia destacada usa sliceHighlight; outras sliceFill.
    expect(paths[0].getAttribute("fill")).toBe(tokens.colors.sliceHighlight);
    expect(paths[1].getAttribute("fill")).toBe(tokens.colors.sliceFill);
    // Cores de texto + stroke do center
    const text = svg.querySelector("text");
    expect(text?.getAttribute("fill")).toBe(tokens.colors.text);
    const center = svg.querySelector("circle");
    expect(center?.getAttribute("fill")).toBe(tokens.colors.centerFill);
    expect(center?.getAttribute("stroke")).toBe(tokens.colors.sliceStroke);
  });

  it("scales radii from tokens.dimensions ratios", () => {
    const tokens = resolvePresetTokens("dark");
    const customTokens = {
      ...tokens,
      dimensions: { innerRatio: 0.10, outerRatio: 0.40 },
    };
    const { getByTestId } = render(
      <MiniDonutPreview tokens={customTokens} size={200} />,
    );
    const center = getByTestId("mini-donut-preview").querySelector("circle")!;
    // r = innerR * 0.85 = 0.10 * 200 * 0.85 = 17
    expect(Number(center.getAttribute("r"))).toBeCloseTo(17, 5);
  });
});
