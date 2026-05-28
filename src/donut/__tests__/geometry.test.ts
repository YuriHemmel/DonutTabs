import { describe, it, expect } from "vitest";
import {
  sliceAngleRange,
  pointToSliceIndex,
  arcPath,
  ringDims,
  ringHitBounds,
  pointToRingIndex,
  slicePaintRange,
  slicePaintAngles,
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
    // gap=4, outerBand=72 (Issue #91). inner = 160 + 4 = 164; outer = 164 + 72 = 236.
    const d = ringDims(1, 80, 160);
    expect(d.innerR).toBe(164);
    expect(d.outerR).toBe(236);
  });

  it("ring 2 mantém banda externa fixa + gap entre anéis", () => {
    // ring 1 outer = 236; gap=4; ring 2 inner = 240; outer = 312.
    const d = ringDims(2, 80, 160);
    expect(d.innerR).toBe(240);
    expect(d.outerR).toBe(312);
  });
});

describe("ringHitBounds (Issue #71 — gapless hit-test)", () => {
  it("ring 0 é idêntico a ringDims (sem absorver — não há gap antes)", () => {
    const d = ringHitBounds(0, 80, 160);
    expect(d.innerR).toBe(80);
    expect(d.outerR).toBe(160);
  });

  it("ring 1 absorve o gap radial que o precede (inner = outer paint do ring 0)", () => {
    // ringDims(1) = {164, 236}; ringHitBounds(1) = {160, 236}.
    // Os 4px do gap (160..164) ficam englobados no hit zone do ring 1.
    const d = ringHitBounds(1, 80, 160);
    expect(d.innerR).toBe(160);
    expect(d.outerR).toBe(236);
  });

  it("ring 2 absorve seu gap antecedente (inner = outer paint do ring 1)", () => {
    // ringDims(2) = {240, 312}; ringHitBounds(2) = {236, 312}.
    const d = ringHitBounds(2, 80, 160);
    expect(d.innerR).toBe(236);
    expect(d.outerR).toBe(312);
  });

  it("hit bounds são contíguos (ring N.outerR == ring N+1.innerR) — sem buracos", () => {
    const r0 = ringHitBounds(0, 80, 160);
    const r1 = ringHitBounds(1, 80, 160);
    const r2 = ringHitBounds(2, 80, 160);
    expect(r0.outerR).toBe(r1.innerR);
    expect(r1.outerR).toBe(r2.innerR);
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

  it("Issue #71 — gap entre ring 0 e ring 1 absorve no ring 1 (sem mais buraco que disparava collapse)", () => {
    // Pintura: ring 0 (até 160), gap (161..163), ring 1 (164..224).
    // Hit-test: ring 1 começa em 160, absorvendo o gap.
    expect(pointToRingIndex({ x: 162, y: 0 }, 3, 80, 160)).toBe(1);
  });

  it("identifica ring 1 (banda externa, incluindo o gap radial absorvido)", () => {
    expect(pointToRingIndex({ x: 170, y: 0 }, 3, 80, 160)).toBe(1);
    expect(pointToRingIndex({ x: 230, y: 0 }, 3, 80, 160)).toBe(1);
  });

  it("Issue #71 — gap entre ring 1 e ring 2 absorve no ring 2", () => {
    // Pintura: ring 1 outer paint = 236; ring 2 inner paint = 240.
    // Gap pintado em 237..239; hit-test mapeia tudo isso pra ring 2.
    expect(pointToRingIndex({ x: 238, y: 0 }, 3, 80, 160)).toBe(2);
  });

  it("identifica ring 2 (outermost)", () => {
    expect(pointToRingIndex({ x: 240, y: 0 }, 3, 80, 160)).toBe(2);
    expect(pointToRingIndex({ x: 310, y: 0 }, 3, 80, 160)).toBe(2);
  });

  it("Issue #71 — gap radial sem ring externo disponível continua null (não há onde absorver)", () => {
    // ringCount=1: só ring 0 existe. Ponto em (162, 0) está fora da
    // banda do ring 0 (que termina em 160) e não tem ring 1 pra
    // absorver. Retorna null como esperado.
    expect(pointToRingIndex({ x: 162, y: 0 }, 1, 80, 160)).toBeNull();
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

describe("slicePaintRange", () => {
  it("encolhe gap/2 de cada lado, preservando midpoint", () => {
    const raw = sliceAngleRange(0, 4);
    const painted = slicePaintRange(0, 4, 0.04);
    expect(painted.start).toBeCloseTo(raw.start + 0.02);
    expect(painted.end).toBeCloseTo(raw.end - 0.02);
    // Midpoint inalterado (slice continua centrado no mesmo lugar).
    expect((painted.start + painted.end) / 2).toBeCloseTo(
      (raw.start + raw.end) / 2,
    );
  });

  it("gap = 0 resulta em range igual ao raw", () => {
    const raw = sliceAngleRange(2, 6);
    const painted = slicePaintRange(2, 6, 0);
    expect(painted.start).toBeCloseTo(raw.start);
    expect(painted.end).toBeCloseTo(raw.end);
  });

  it("gap excessivo (>= step) degenera pro midpoint sem virar negativo", () => {
    // step = 2π/4 = π/2. gap maior que step → range inválido. Helper
    // colapsa pro midpoint pra não pintar arco invertido.
    const painted = slicePaintRange(1, 4, Math.PI);
    expect(painted.start).toBeCloseTo(painted.end);
  });

  it("n=1 retorna range completo (2π) ignorando gap pra evitar fenda", () => {
    // Slice única numa página deve virar anel fechado, não uma fatia com
    // pequeno corte no topo.
    const raw = sliceAngleRange(0, 1);
    const painted = slicePaintRange(0, 1, 0.04);
    expect(painted.start).toBeCloseTo(raw.start);
    expect(painted.end).toBeCloseTo(raw.end);
    expect(painted.end - painted.start).toBeCloseTo(Math.PI * 2);
  });
});

describe("slicePaintAngles", () => {
  it("gap=0 → todos os 4 ângulos casam com sliceAngleRange", () => {
    const raw = sliceAngleRange(1, 4);
    const a = slicePaintAngles(1, 4, 0, 80, 140);
    expect(a.innerStart).toBeCloseTo(raw.start);
    expect(a.innerEnd).toBeCloseTo(raw.end);
    expect(a.outerStart).toBeCloseTo(raw.start);
    expect(a.outerEnd).toBeCloseTo(raw.end);
  });

  it("n=1 retorna range completo nos 4 ângulos (anel fechado, sem fenda)", () => {
    const raw = sliceAngleRange(0, 1);
    const a = slicePaintAngles(0, 1, 6, 80, 140);
    expect(a.innerStart).toBeCloseTo(raw.start);
    expect(a.innerEnd).toBeCloseTo(raw.end);
    expect(a.outerStart).toBeCloseTo(raw.start);
    expect(a.outerEnd).toBeCloseTo(raw.end);
    expect(a.outerEnd - a.outerStart).toBeCloseTo(Math.PI * 2);
  });

  it("gap perpendicular constante: arc-length do trim é ~g/2 em qualquer raio", () => {
    const gap = 6;
    const innerR = 80;
    const outerR = 140;
    const raw = sliceAngleRange(0, 4);
    const a = slicePaintAngles(0, 4, gap, innerR, outerR);
    // Cada lado é trimado de forma que a *distância perpendicular* equivalente
    // ao trim no raio dado seja `gap/2`. `(α * r)` em um arco pequeno = `gap/2`,
    // mas a regra exata é `r * sin(α) = gap/2` (asin invertido).
    expect(innerR * Math.sin(a.innerStart - raw.start)).toBeCloseTo(gap / 2);
    expect(outerR * Math.sin(a.outerStart - raw.start)).toBeCloseTo(gap / 2);
    expect(innerR * Math.sin(raw.end - a.innerEnd)).toBeCloseTo(gap / 2);
    expect(outerR * Math.sin(raw.end - a.outerEnd)).toBeCloseTo(gap / 2);
  });

  it("inner ganha mais trim angular que outer (mesma distância px)", () => {
    const raw = sliceAngleRange(0, 4);
    const a = slicePaintAngles(0, 4, 6, 80, 140);
    const innerTrim = a.innerStart - raw.start;
    const outerTrim = a.outerStart - raw.start;
    expect(innerTrim).toBeGreaterThan(outerTrim);
  });

  it("midpoint preservado nos dois pares (slice continua centrada)", () => {
    const raw = sliceAngleRange(2, 6);
    const a = slicePaintAngles(2, 6, 6, 90, 150);
    const rawMid = (raw.start + raw.end) / 2;
    expect((a.innerStart + a.innerEnd) / 2).toBeCloseTo(rawMid);
    expect((a.outerStart + a.outerEnd) / 2).toBeCloseTo(rawMid);
  });

  it("gap excessivo colapsa todos os 4 ângulos pro midpoint", () => {
    // step = π/2 (n=4). Pra colapsar o inner (r pequeno) com gap absurdo:
    const a = slicePaintAngles(1, 4, 1000, 10, 1000);
    const raw = sliceAngleRange(1, 4);
    const mid = (raw.start + raw.end) / 2;
    expect(a.innerStart).toBeCloseTo(mid);
    expect(a.innerEnd).toBeCloseTo(mid);
    expect(a.outerStart).toBeCloseTo(mid);
    expect(a.outerEnd).toBeCloseTo(mid);
  });
});

describe("arcPath com 4 ângulos distintos", () => {
  it("produz path SVG válido (M ... A ... L ... A ... Z) sem NaN", () => {
    const raw = sliceAngleRange(0, 4);
    const a = slicePaintAngles(0, 4, 6, 80, 140);
    const d = arcPath({
      cx: 100,
      cy: 100,
      innerR: 80,
      outerR: 140,
      startAngle: raw.start,
      endAngle: raw.end,
      innerStartAngle: a.innerStart,
      innerEndAngle: a.innerEnd,
      outerStartAngle: a.outerStart,
      outerEndAngle: a.outerEnd,
    });
    expect(d).toMatch(/^M [\d.-]+ [\d.-]+ A .* A .* Z$/);
    expect(d).not.toMatch(/NaN/);
  });

  it("sem overrides, cai no comportamento legado (corners iguais)", () => {
    const legacy = arcPath({
      cx: 0,
      cy: 0,
      innerR: 50,
      outerR: 100,
      startAngle: 0,
      endAngle: Math.PI / 2,
    });
    const explicit = arcPath({
      cx: 0,
      cy: 0,
      innerR: 50,
      outerR: 100,
      startAngle: 0,
      endAngle: Math.PI / 2,
      innerStartAngle: 0,
      innerEndAngle: Math.PI / 2,
      outerStartAngle: 0,
      outerEndAngle: Math.PI / 2,
    });
    expect(explicit).toBe(legacy);
  });
});
