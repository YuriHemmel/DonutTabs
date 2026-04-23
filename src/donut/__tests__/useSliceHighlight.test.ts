import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSliceHighlight } from "../useSliceHighlight";

describe("useSliceHighlight", () => {
  it("starts with null", () => {
    const { result } = renderHook(() => useSliceHighlight({
      center: { x: 200, y: 200 },
      slices: 4,
      innerRadius: 80,
      outerRadius: 200,
    }));
    expect(result.current.highlighted).toBeNull();
  });

  it("updates when mouse moves inside a slice", () => {
    const { result } = renderHook(() => useSliceHighlight({
      center: { x: 200, y: 200 },
      slices: 4,
      innerRadius: 80,
      outerRadius: 200,
    }));
    act(() => {
      result.current.onMouseMove({ clientX: 200, clientY: 50 } as any);
    });
    expect(result.current.highlighted).toBe(0);
  });

  it("returns null inside inner radius", () => {
    const { result } = renderHook(() => useSliceHighlight({
      center: { x: 200, y: 200 },
      slices: 4,
      innerRadius: 80,
      outerRadius: 200,
    }));
    act(() => {
      result.current.onMouseMove({ clientX: 200, clientY: 200 } as any);
    });
    expect(result.current.highlighted).toBeNull();
  });
});
