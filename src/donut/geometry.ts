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
 *  ring root pra "abas subsequentes ocuparem menos espaço".
 *  Issue #91 — bumped 60→72 pra dar mais folga radial de hover sem deixar
 *  as fatias grossas demais (90 foi exagero). */
export const OUTER_RING_BAND_WIDTH = 72;
/** Plano 23 — gap radial entre anéis vizinhos. Cria separador visual e
 *  região de "no-hit" no `pointToRingIndex` (cursor entre anéis não casa
 *  nenhum). */
export const RING_GAP = 4;
/** Plano 23 — gap angular (radianos) entre slices vizinhos em anéis
 *  externos (ring 1+). Encolhe a pintura de cada slice em metade desse
 *  valor de cada lado. Hit-test mantém range completo (sem deadzone),
 *  só a pintura tem o respiro. ~2.3° (0.04 rad). */
export const OUTER_SLICE_ANGULAR_GAP_RAD = 0.04;

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
