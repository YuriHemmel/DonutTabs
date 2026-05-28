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

/**
 * Plano 23 — range angular para *pintura* do slice em anéis externos
 * (ring 1+). Encolhe `gapRad/2` de cada lado pra criar respiro visual
 * entre vizinhos. Pure pra teste.
 *
 * Não usar em hit-test — o `pointToSliceIndex` deve continuar enxergando
 * o range completo via `sliceAngleRange`, senão cursor entre slices vira
 * deadzone irritante.
 *
 * Quando `gapRad` >= step, retorna range degenerado (start == end) — slice
 * fica sumido. Caller deveria evitar configurar gap maior que step,
 * mas é defensivo.
 */
export function slicePaintRange(
  index: number,
  n: number,
  gapRad: number,
): AngleRange {
  // Plano 23 — slice única (n=1): retorna o range completo sem gap pra
  // pintar um anel fechado. Caso contrário, gap de top deixaria um corte
  // visível no slice "único" (visualmente feio).
  if (n <= 1) return sliceAngleRange(index, n);
  const raw = sliceAngleRange(index, n);
  const half = gapRad / 2;
  const newStart = raw.start + half;
  const newEnd = raw.end - half;
  if (newEnd <= newStart) {
    const mid = (raw.start + raw.end) / 2;
    return { start: mid, end: mid };
  }
  return { start: newStart, end: newEnd };
}

/**
 * Issue #89 — versão "pixel-perpendicular" de `slicePaintRange`.
 * Retorna 4 ângulos (corners inner/outer) calculados de forma que o
 * gap *perpendicular* entre slices vizinhos seja constante em px do
 * raio interno ao externo. No raio `r` o offset angular necessário
 * pra conseguir um deslocamento perpendicular `g/2` é `asin(g/(2r))`
 * — maior no inner, menor no outer.
 *
 * Casos especiais:
 *  - `n <= 1` → retorna o range completo nos 4 campos (anel fechado,
 *    sem fenda — mesma regra que `slicePaintRange`).
 *  - `gapPx <= 0` → todos os 4 ângulos casam com `sliceAngleRange`.
 *  - Gap excessivo (resultaria em range invertido em qualquer raio) →
 *    colapsa os 4 ângulos no midpoint da slice (defensivo).
 *
 * Hit-test deve continuar usando `pointToSliceIndex` (range completo) —
 * o respiro é só visual.
 *
 * Pure pra teste.
 */
export interface SlicePaintAngles {
  innerStart: number;
  innerEnd: number;
  outerStart: number;
  outerEnd: number;
}

export function slicePaintAngles(
  index: number,
  n: number,
  gapPx: number,
  innerR: number,
  outerR: number,
): SlicePaintAngles {
  const raw = sliceAngleRange(index, n);
  if (n <= 1 || gapPx <= 0) {
    return {
      innerStart: raw.start,
      innerEnd: raw.end,
      outerStart: raw.start,
      outerEnd: raw.end,
    };
  }
  const halfGap = gapPx / 2;
  const angleAt = (r: number): number => {
    if (r <= 0) return Math.PI / 2;
    const ratio = halfGap / r;
    if (ratio >= 1) return Math.PI / 2;
    return Math.asin(ratio);
  };
  const innerAlpha = angleAt(innerR);
  const outerAlpha = angleAt(outerR);
  const innerStart = raw.start + innerAlpha;
  const innerEnd = raw.end - innerAlpha;
  const outerStart = raw.start + outerAlpha;
  const outerEnd = raw.end - outerAlpha;
  if (innerEnd <= innerStart || outerEnd <= outerStart) {
    const mid = (raw.start + raw.end) / 2;
    return { innerStart: mid, innerEnd: mid, outerStart: mid, outerEnd: mid };
  }
  return { innerStart, innerEnd, outerStart, outerEnd };
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
  /** Issue #89 — quando definidos, os 4 ângulos abaixo sobrescrevem
   *  `startAngle`/`endAngle` para os corners correspondentes. Permite
   *  que a borda inner e outer da slice tenham trims angulares diferentes
   *  pra um gap perpendicular constante. Ausência cai no comportamento
   *  legado (mesma start/end nos dois arcos). */
  innerStartAngle?: number; innerEndAngle?: number;
  outerStartAngle?: number; outerEndAngle?: number;
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
/** Plano 23 — gap angular (radianos) entre slices vizinhos. Helper
 *  legado `slicePaintRange` ainda usa essa unidade. A pintura nova
 *  (`slicePaintAngles`) usa gap em pixels perpendicular constante
 *  (`OUTER_SLICE_GAP_PX`). Mantido pra back-compat de callers e testes. */
export const OUTER_SLICE_ANGULAR_GAP_RAD = 0.04;

/** Issue #89 — gap perpendicular (px) entre slices vizinhos, constante do
 *  raio interno ao externo. Substitui o gap angular (que crescia em arc
 *  length conforme o raio). Resolvido em ângulo via `asin(g/(2r))` —
 *  ângulo maior no inner, menor no outer, resultando em borda visualmente
 *  reta de largura uniforme. */
export const OUTER_SLICE_GAP_PX = 6;

/**
 * Plano 23 — calcula os raios de cada anel concêntrico para **pintura**
 * (`ring 0` = innermost = root; `ring N-1` = outermost). Ring 0 usa a
 * banda derivada do tema (`innerRRoot..outerRRoot`); rings 1+ usam
 * banda menor (`OUTER_RING_BAND_WIDTH`) com `RING_GAP` separando
 * vizinhos.
 *
 * **Não usar em hit-test** — o gap entre anéis aparece como região
 * vazia aqui, e cursor passando por ele faria `pointToRingIndex` virar
 * `null`, derrubando o `hovered` e colapsando rings abertos. Para
 * hit-test use `ringHitBounds`, que absorve o gap no ring externo.
 *
 * Pure pra teste; reusado pelo `<Donut>` na renderização SVG e no
 * posicionamento do `HoverHoldOverlay`.
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
 * Issue #71 — versão sem-gap dos raios concêntricos para uso em
 * hit-test (`pointToRingIndex` + `pointToSliceIndex` no `<Donut>`).
 * Cada ring externo absorve o `RING_GAP` que o precede, eliminando a
 * "região morta" radial onde o cursor virava `null` e disparava
 * collapse indevido enquanto o usuário transitava do slice do group
 * para o anel externo.
 *
 * Pintura visual (`ringDims`) preserva o gap; só a detecção de
 * cursor enxerga os anéis contíguos.
 */
export function ringHitBounds(
  ringIndex: number,
  innerRRoot: number,
  outerRRoot: number,
): RingDims {
  if (ringIndex <= 0) {
    return { innerR: innerRRoot, outerR: outerRRoot };
  }
  // Ring i (>= 1) cobre desde o outer paint do ring anterior até o
  // outer paint deste ring. O gap radial antes deste ring fica
  // englobado neste hit zone.
  const innerR =
    ringIndex === 1
      ? outerRRoot
      : outerRRoot + (ringIndex - 1) * (OUTER_RING_BAND_WIDTH + RING_GAP);
  const outerR =
    outerRRoot + ringIndex * (OUTER_RING_BAND_WIDTH + RING_GAP);
  return { innerR, outerR };
}

/**
 * Plano 23 / Issue #71 — descobre qual anel concêntrico contém o ponto,
 * usando a distância radial. Pure pra teste. Retorna `null` se o ponto
 * está dentro do círculo central (raio < `innerRRoot`) ou fora do anel
 * mais externo. **Não retorna `null` para o gap entre anéis** — usa
 * `ringHitBounds` que absorve o gap no ring externo, evitando que o
 * cursor "caia no buraco" entre anéis e dispare collapse do sub-anel
 * que o usuário está prestes a alcançar.
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
    const dims = ringHitBounds(i, innerRRoot, outerRRoot);
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

  // Issue #89 — corners inner/outer podem ter ângulos diferentes para
  // realizar um gap perpendicular constante. `largeArc` é resolvido
  // por arc, já que o trim assimétrico pode flippar a flag no canto do
  // step entre as duas bandas.
  const oStart = o.outerStartAngle ?? startAngle;
  const oEnd = o.outerEndAngle ?? endAngle;
  const iStart = o.innerStartAngle ?? startAngle;
  const iEnd = o.innerEndAngle ?? endAngle;
  const outerLargeArc = oEnd - oStart > Math.PI ? 1 : 0;
  const innerLargeArc = iEnd - iStart > Math.PI ? 1 : 0;
  const x1 = cx + outerR * Math.cos(oStart);
  const y1 = cy + outerR * Math.sin(oStart);
  const x2 = cx + outerR * Math.cos(oEnd);
  const y2 = cy + outerR * Math.sin(oEnd);
  const x3 = cx + innerR * Math.cos(iEnd);
  const y3 = cy + innerR * Math.sin(iEnd);
  const x4 = cx + innerR * Math.cos(iStart);
  const y4 = cy + innerR * Math.sin(iStart);
  return [
    `M ${x1} ${y1}`,
    `A ${outerR} ${outerR} 0 ${outerLargeArc} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${innerR} ${innerR} 0 ${innerLargeArc} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}
