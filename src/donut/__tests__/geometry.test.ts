import { describe, it, expect } from "vitest";
import { sliceAngleRange, pointToSliceIndex, arcPath } from "../geometry";

describe("sliceAngleRange", () => {
  it("divides full circle equally among N slices", () => {
    const r = sliceAngleRange(0, 4);
    expect(r.start).toBeCloseTo(-Math.PI / 2);
    expect(r.end).toBeCloseTo(0);
  });

  it("second slice starts where first ends", () => {
    const a = sliceAngleRange(0, 4);
    const b = sliceAngleRange(1, 4);
    expect(b.start).toBeCloseTo(a.end);
  });
});

describe("pointToSliceIndex", () => {
  it("returns 0 for a point straight up from center", () => {
    const idx = pointToSliceIndex({ x: 0, y: -100 }, 4);
    expect(idx).toBe(0);
  });

  it("returns 1 for a point to the right", () => {
    const idx = pointToSliceIndex({ x: 100, y: 0 }, 4);
    expect(idx).toBe(1);
  });

  it("returns null if within inner radius (center dead zone)", () => {
    const idx = pointToSliceIndex({ x: 5, y: 5 }, 4, { innerRadius: 50 });
    expect(idx).toBeNull();
  });

  it("returns null if beyond outer radius", () => {
    const idx = pointToSliceIndex({ x: 1000, y: 0 }, 4, { outerRadius: 200 });
    expect(idx).toBeNull();
  });
});

describe("arcPath", () => {
  it("produces a valid SVG path starting with M", () => {
    const d = arcPath({ cx: 200, cy: 200, innerR: 80, outerR: 180, startAngle: 0, endAngle: Math.PI / 2 });
    expect(d.startsWith("M")).toBe(true);
    expect(d).toMatch(/A /);
  });
});
