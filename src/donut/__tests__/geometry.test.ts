import { describe, it, expect } from "vitest";
import {
  sliceAngleRange,
  pointToSliceIndex,
  arcPath,
  ringDims,
  pointToRingIndex,
} from "../geometry";

describe("sliceAngleRange", () => {
  it("centers slice 0 on the top (12 o'clock) for n=4", () => {
    const r = sliceAngleRange(0, 4);
    // step = π/2; slice 0 = [-3π/4, -π/4] centrado em -π/2 (topo).
    expect(r.start).toBeCloseTo(-Math.PI * 3 / 4);
    expect(r.end).toBeCloseTo(-Math.PI / 4);
  });

  it("second slice starts where first ends", () => {
    const a = sliceAngleRange(0, 4);
    const b = sliceAngleRange(1, 4);
    expect(b.start).toBeCloseTo(a.end);
  });

  // Regressão da issue #7: com n=2, abas devem ficar no sentido `-`
  // (split horizontal: metade superior + metade inferior), não `|`.
  it("splits the donut horizontally when n=2", () => {
    const top = sliceAngleRange(0, 2);
    const bottom = sliceAngleRange(1, 2);
    expect(top.start).toBeCloseTo(-Math.PI);
    expect(top.end).toBeCloseTo(0);
    expect(bottom.start).toBeCloseTo(0);
    expect(bottom.end).toBeCloseTo(Math.PI);
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

  it("renders a full ring (two sub-paths) when the arc covers 2π", () => {
    const d = arcPath({
      cx: 200,
      cy: 200,
      innerR: 80,
      outerR: 180,
      startAngle: -Math.PI / 2,
      endAngle: -Math.PI / 2 + Math.PI * 2,
    });
    // Dois sub-paths (outer + inner) significa dois "M" e dois "Z".
    expect((d.match(/M /g) ?? []).length).toBe(2);
    expect((d.match(/Z/g) ?? []).length).toBe(2);
  });
});

// ---------- Plano 23: multi-ring helpers ----------

describe("ringDims", () => {
  it("ring 0 espelha innerR..outerR root", () => {
    const d = ringDims(0, 80, 160);
    expect(d.innerR).toBe(80);
    expect(d.outerR).toBe(160);
  });

  it("ring 1 começa após gap, com banda externa fixa", () => {
    // gap=4, outerBand=60. inner = 160 + 4 = 164; outer = 164 + 60 = 224.
    const d = ringDims(1, 80, 160);
    expect(d.innerR).toBe(164);
    expect(d.outerR).toBe(224);
  });

  it("ring 2 mantém banda externa fixa + gap entre anéis", () => {
    // ring 1 outer = 224; gap=4; ring 2 inner = 228; outer = 288.
    const d = ringDims(2, 80, 160);
    expect(d.innerR).toBe(228);
    expect(d.outerR).toBe(288);
  });
});

describe("pointToRingIndex", () => {
  it("retorna null pra ponto dentro do círculo central", () => {
    expect(pointToRingIndex({ x: 0, y: 0 }, 3, 80, 160)).toBeNull();
    expect(pointToRingIndex({ x: 50, y: 0 }, 3, 80, 160)).toBeNull();
  });

  it("identifica ring 0 (bandWidth do tema)", () => {
    expect(pointToRingIndex({ x: 100, y: 0 }, 3, 80, 160)).toBe(0);
    expect(pointToRingIndex({ x: 159, y: 0 }, 3, 80, 160)).toBe(0);
  });

  it("retorna null pra ponto no gap entre rings", () => {
    // Gap entre ring 0 (160) e ring 1 (164) = 161..163.
    expect(pointToRingIndex({ x: 162, y: 0 }, 3, 80, 160)).toBeNull();
  });

  it("identifica ring 1 (banda externa)", () => {
    expect(pointToRingIndex({ x: 170, y: 0 }, 3, 80, 160)).toBe(1);
    expect(pointToRingIndex({ x: 220, y: 0 }, 3, 80, 160)).toBe(1);
  });

  it("retorna null pra ponto no gap entre ring 1 e ring 2", () => {
    // ring 1 outer = 224; ring 2 inner = 228. Gap = 225..227.
    expect(pointToRingIndex({ x: 226, y: 0 }, 3, 80, 160)).toBeNull();
  });

  it("identifica ring 2 (outermost)", () => {
    expect(pointToRingIndex({ x: 230, y: 0 }, 3, 80, 160)).toBe(2);
    expect(pointToRingIndex({ x: 285, y: 0 }, 3, 80, 160)).toBe(2);
  });

  it("retorna null pra ponto fora do ring outermost", () => {
    expect(pointToRingIndex({ x: 500, y: 0 }, 3, 80, 160)).toBeNull();
  });

  it("respeita ringCount: pedindo só 1 ring, ring 1+ vira null", () => {
    expect(pointToRingIndex({ x: 170, y: 0 }, 1, 80, 160)).toBeNull();
    expect(pointToRingIndex({ x: 100, y: 0 }, 1, 80, 160)).toBe(0);
  });

  it("ringCount 0 = sempre null", () => {
    expect(pointToRingIndex({ x: 100, y: 0 }, 0, 80, 160)).toBeNull();
  });
});
