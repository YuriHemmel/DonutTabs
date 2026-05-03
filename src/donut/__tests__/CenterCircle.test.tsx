import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { CenterCircle } from "../CenterCircle";
import { ThemeContext } from "../themeContext";
import { resolvePresetTokens } from "../../core/themeTokens";

const TOKENS = resolvePresetTokens("dark");

function renderInSvg(node: React.ReactNode) {
  return render(
    <ThemeContext.Provider value={TOKENS}>
      <svg width={400} height={400}>{node}</svg>
    </ThemeContext.Provider>
  );
}

describe("CenterCircle hover", () => {
  it("highlights the left half when the gear hit is hovered", () => {
    const { getByTestId } = renderInSvg(
      <CenterCircle cx={200} cy={200} r={60} onGearClick={() => {}} />
    );
    const left = getByTestId("center-half-left");
    const baseFill = left.getAttribute("fill");
    fireEvent.mouseEnter(getByTestId("gear-hit"));
    expect(left.getAttribute("fill")).toBe(TOKENS.colors.sliceHighlight);
    fireEvent.mouseLeave(getByTestId("gear-hit"));
    expect(left.getAttribute("fill")).toBe(baseFill);
  });

  it("highlights the right half when the profile-switcher hit is hovered", () => {
    const { getByTestId } = renderInSvg(
      <CenterCircle cx={200} cy={200} r={60} onProfileSwitcherClick={() => {}} />
    );
    const right = getByTestId("center-half-right");
    const baseFill = right.getAttribute("fill");
    fireEvent.mouseEnter(getByTestId("profile-switcher-hit"));
    expect(right.getAttribute("fill")).toBe(TOKENS.colors.sliceHighlight);
    fireEvent.mouseLeave(getByTestId("profile-switcher-hit"));
    expect(right.getAttribute("fill")).toBe(baseFill);
  });

  it("does not highlight a half when its handler is missing", () => {
    // Sem onProfileSwitcherClick: a metade direita não ganha hit rect.
    const { getByTestId, queryByTestId } = renderInSvg(
      <CenterCircle cx={200} cy={200} r={60} onGearClick={() => {}} />
    );
    expect(queryByTestId("profile-switcher-hit")).toBeNull();
    const right = getByTestId("center-half-right");
    expect(right.getAttribute("fill")).toBe(TOKENS.colors.centerFill);
  });

  it("calls the registered handler on click", () => {
    const onGear = vi.fn();
    const onSwitch = vi.fn();
    const { getByTestId } = renderInSvg(
      <CenterCircle
        cx={200}
        cy={200}
        r={60}
        onGearClick={onGear}
        onProfileSwitcherClick={onSwitch}
      />
    );
    fireEvent.click(getByTestId("gear-hit"));
    expect(onGear).toHaveBeenCalledTimes(1);
    fireEvent.click(getByTestId("profile-switcher-hit"));
    expect(onSwitch).toHaveBeenCalledTimes(1);
  });
});
