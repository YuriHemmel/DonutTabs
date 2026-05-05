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

export interface RingDims {
  innerR: number;
  outerR: number;
}

/** Plano 23 — bandWidth fixa para anéis externos (ring 1+). Menor que o
 *  ring root pra "abas subsequentes ocuparem menos espaço". */
export const OUTER_RING_BAND_WIDTH = 60;
/** Plano 23 — gap radial entre anéis vizinhos. Cria separador visual e
 *  região de "no-hit" no `pointToRingIndex` (cursor entre anéis não casa
 *  nenhum). */
export const RING_GAP = 4;

/**
 * Plano 23 — calcula os raios de cada anel concêntrico (`ring 0` =
 * innermost = root; `ring N-1` = outermost). Ring 0 usa a banda derivada
 * do tema (`innerRRoot..outerRRoot`); rings 1+ usam banda menor
 * (`OUTER_RING_BAND_WIDTH`) com `RING_GAP` separando vizinhos.
 *
 * Pure pra teste; reusado pelo `<Donut>` e pelo highlight global pra mapear
 * `radius → ringIndex`.
 */
export function ringDims(
  ringIndex: number,
  innerRRoot: number,
  outerRRoot: number,
): RingDims {
  if (ringIndex <= 0) {
    return { innerR: innerRRoot, outerR: outerRRoot };
  }
  const innerR =
    outerRRoot + (ringIndex - 1) * (OUTER_RING_BAND_WIDTH + RING_GAP) + RING_GAP;
  return { innerR, outerR: innerR + OUTER_RING_BAND_WIDTH };
}

/**
 * Plano 23 — descobre qual anel concêntrico contém o ponto, usando a
 * distância radial. Pure pra teste. Retorna `null` se o ponto está
 * dentro do círculo central (raio < `innerRRoot`), na região de gap
 * entre anéis, ou fora do anel mais externo. `ringCount` define quantos
 * anéis estão renderizados.
 */
export function pointToRingIndex(
  p: Point,
  ringCount: number,
  innerRRoot: number,
  outerRRoot: number,
): number | null {
  if (ringCount <= 0) return null;
  const r = Math.hypot(p.x, p.y);
  if (r < innerRRoot) return null;
  for (let i = 0; i < ringCount; i++) {
    const dims = ringDims(i, innerRRoot, outerRRoot);
    if (r >= dims.innerR && r <= dims.outerR) return i;
  }
  return null;
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
