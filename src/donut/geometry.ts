export interface Point { x: number; y: number; }
export interface AngleRange { start: number; end: number; }

// Slice 0 fica CENTRADO no topo (12h). Garante split horizontal natural pra
// n=2 (slice 0 = metade superior, slice 1 = inferior) e mantém cardeais
// alinhados ao centro de cada slice em qualquer n.
const TOP_CENTER = -Math.PI / 2;

export function sliceAngleRange(index: number, n: number): AngleRange {
  const step = (Math.PI * 2) / n;
  const start = TOP_CENTER - step / 2 + step * index;
  return { start, end: start + step };
}

export interface SliceLookupOpts {
  innerRadius?: number;
  outerRadius?: number;
}

export function pointToSliceIndex(
  p: Point, n: number, opts: SliceLookupOpts = {}
): number | null {
  const r = Math.hypot(p.x, p.y);
  if (opts.innerRadius !== undefined && r < opts.innerRadius) return null;
  if (opts.outerRadius !== undefined && r > opts.outerRadius) return null;
  const step = (Math.PI * 2) / n;
  let angle = Math.atan2(p.y, p.x) - TOP_CENTER + step / 2;
  angle = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  return Math.floor(angle / step);
}

export interface ArcPathOpts {
  cx: number; cy: number;
  innerR: number; outerR: number;
  startAngle: number; endAngle: number;
}

export function arcPath(o: ArcPathOpts): string {
  const { cx, cy, innerR, outerR, startAngle, endAngle } = o;
  const delta = endAngle - startAngle;

  // Caso degenerado: arco cobre o círculo inteiro. SVG não desenha um arco
  // com start == end (vira um ponto/linha), então emitimos um anel fechado
  // com dois sub-paths e `fill-rule="evenodd"` para recortar o miolo.
  if (delta >= Math.PI * 2 - 1e-6) {
    return [
      `M ${cx + outerR} ${cy}`,
      `A ${outerR} ${outerR} 0 1 1 ${cx - outerR} ${cy}`,
      `A ${outerR} ${outerR} 0 1 1 ${cx + outerR} ${cy}`,
      "Z",
      `M ${cx + innerR} ${cy}`,
      `A ${innerR} ${innerR} 0 1 0 ${cx - innerR} ${cy}`,
      `A ${innerR} ${innerR} 0 1 0 ${cx + innerR} ${cy}`,
      "Z",
    ].join(" ");
  }

  const largeArc = delta > Math.PI ? 1 : 0;
  const x1 = cx + outerR * Math.cos(startAngle);
  const y1 = cy + outerR * Math.sin(startAngle);
  const x2 = cx + outerR * Math.cos(endAngle);
  const y2 = cy + outerR * Math.sin(endAngle);
  const x3 = cx + innerR * Math.cos(endAngle);
  const y3 = cy + innerR * Math.sin(endAngle);
  const x4 = cx + innerR * Math.cos(startAngle);
  const y4 = cy + innerR * Math.sin(startAngle);
  return [
    `M ${x1} ${y1}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}
