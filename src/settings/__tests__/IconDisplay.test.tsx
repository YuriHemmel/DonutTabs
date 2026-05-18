import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { IconDisplay } from "../IconDisplay";

describe("IconDisplay", () => {
  it("renders Lucide component when icon = lucide:Name (registered)", () => {
    const { container } = render(<IconDisplay icon="lucide:Coffee" />);
    // Lucide React renderiza um <svg>; presença do svg = match.
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("falls back to text when lucide:Name is not in the registry", () => {
    const { container } = render(
      <IconDisplay icon="lucide:DefinitelyNotAnIcon" fallback="X" />,
    );
    expect(container.querySelector("svg")).toBeNull();
    expect(container.textContent).toBe("X");
  });

  it("renders an <img> for image-like icon refs", () => {
    const { container } = render(<IconDisplay icon="data:image/png;base64,abc" />);
    const img = container.querySelector("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toBe("data:image/png;base64,abc");
  });

  it("renders the literal string for emoji-style icons", () => {
    const { container } = render(<IconDisplay icon="🚀" />);
    expect(container.textContent).toBe("🚀");
    expect(container.querySelector("svg")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders fallback when icon is null/undefined/empty", () => {
    const { container, rerender } = render(<IconDisplay icon={null} fallback="•" />);
    expect(container.textContent).toBe("•");
    rerender(<IconDisplay icon={undefined} fallback="•" />);
    expect(container.textContent).toBe("•");
    rerender(<IconDisplay icon="" fallback="•" />);
    expect(container.textContent).toBe("•");
  });
});
