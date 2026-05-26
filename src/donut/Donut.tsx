import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Tab } from "../core/types/Tab";
import type { Profile } from "../core/types/Profile";
import type { SettingsIntent } from "../core/ipc";
import { Slice } from "./Slice";
import { CenterCircle } from "./CenterCircle";
import { PaginationDots } from "./PaginationDots";
import { HoverHoldOverlay } from "./HoverHoldOverlay";
import { ProfileSwitcher } from "./ProfileSwitcher";
import {
  OUTER_SLICE_ANGULAR_GAP_RAD,
  pointToRingIndex,
  pointToSliceIndex,
  ringDims,
  slicePaintRange,
  type RingDims,
} from "./geometry";
import { paginate } from "./pagination";
import { useHoverHold } from "./useHoverHold";
import { IconRenderer } from "./IconRenderer";
import { useFavicon } from "./useFavicon";
import { SliceContextMenu } from "./SliceContextMenu";
import { TabSearchOverlay } from "./TabSearchOverlay";
import { matchesCombo } from "./matchesCombo";
import { tabInitial } from "./tabUtils";
import { ThemeContext } from "./themeContext";
import { resolvePresetTokens, type ThemeTokens } from "../core/themeTokens";
import { useRingStack, MAX_RINGS } from "./useRingStack";
import { useHoverToExpand } from "./useHoverToExpand";
import { useHoverToCollapse } from "./useHoverToCollapse";

/** Stack de fontes sans-serif do sistema. SVG `<text>` default cai em Times
 *  serif em vários navegadores — feio dentro do donut. Aplicado na raiz
 *  `<svg>` pra todos os textos descendentes herdarem. */
const DONUT_FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif';

function firstTabUrl(tab: Tab): string | null {
  for (const item of tab.items) {
    if (item.kind === "url") return item.value;
  }
  return null;
}

/** Conta total de descendentes (children + grandchildren ...). */
export function countDescendants(tab: Tab): number {
  // Backend serializa `children` com `skip_serializing_if = "Vec::is_empty"`,
  // então leaves chegam aqui com `children === undefined` mesmo sendo `Tab[]`
  // no tipo ts-rs. `?? []` protege a iteração.
  const kids = tab.children ?? [];
  let n = 0;
  for (const c of kids) {
    n += 1 + countDescendants(c);
  }
  return n;
}

const isGroup = (tab: Tab): boolean => tab.kind === "group";

/** Plano 23 — codifica (ring, slice) em índice composto pra reusar
 *  `useHoverHold` que aceita um único `number`. Limite de 10000 slices/ring
 *  é folgado (paginação corta bem antes). */
const HOVER_RING_STRIDE = 10000;
const encodeHoverIndex = (ring: number, slice: number) =>
  ring * HOVER_RING_STRIDE + slice;
const decodeHoverIndex = (idx: number) => ({
  ring: Math.floor(idx / HOVER_RING_STRIDE),
  slice: idx % HOVER_RING_STRIDE,
});

interface TabSliceProps {
  tab: Tab;
  cx: number;
  cy: number;
  innerR: number;
  outerR: number;
  startAngle: number;
  endAngle: number;
  highlighted: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent<SVGGElement>) => void;
}

const TabSlice: React.FC<TabSliceProps> = ({ tab, ...rest }) => {
  const fallback = tabInitial(tab.name);
  const useFav = !tab.icon && !isGroup(tab);
  const fav = useFavicon(useFav ? firstTabUrl(tab) : null);
  const iconString = tab.icon ?? fav.src ?? null;
  // Plano 16 — group ganha badge ▶ no canto inferior do slice. Posição
  // próxima à borda externa pra não competir com o ícone/label central.
  const groupBadge = isGroup(tab);
  const mid = (rest.startAngle + rest.endAngle) / 2;
  const badgeR = (rest.innerR + rest.outerR) / 2 + (rest.outerR - rest.innerR) * 0.3;
  const bx = rest.cx + badgeR * Math.cos(mid);
  const by = rest.cy + badgeR * Math.sin(mid);
  return (
    <>
      <Slice
        {...rest}
        label={tab.name ?? undefined}
        iconNode={<IconRenderer icon={iconString} fallback={fallback} />}
      />
      {groupBadge && (
        <text
          data-testid="group-badge"
          x={bx}
          y={by}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={10}
          fill="var(--donut-text, #eaeaea)"
          opacity={0.65}
          pointerEvents="none"
        >
          ▶
        </text>
      )}
    </>
  );
};

export interface DonutProps {
  tabs: Tab[];
  /** Tamanho da janela. Backend escolhe baseado em `max_group_depth`
   *  (Plano 23): 420 / 560 / 700 pra 1/2/3 anéis. */
  size: number;
  itemsPerPage: number;
  wheelDirection: "standard" | "inverted";
  hoverHoldMs?: number;
  /** Combo Tauri-style (`CommandOrControl+F`) que abre o overlay de busca
   *  rápida das abas do perfil ativo. Quando ausente, o overlay fica
   *  desabilitado. */
  searchShortcut?: string;
  /** Plano 23 — quando `true` (default), pinta gap angular entre slices
   *  vizinhos. Quando `false`, slices ficam coladas (look Plano 16).
   *  Toggle vive em `interaction.sliceGapEnabled` no config. */
  sliceGapEnabled?: boolean;
  /** Plano 15 — tokens visuais resolvidos (preset + overrides do perfil
   *  ativo). Quando ausente, default = preset dark. Os ratios internos
   *  controlam o raio interno/externo do donut. */
  tokens?: ThemeTokens;
  onSelect: (tabId: string) => void;
  onOpenSettings?: (intent?: SettingsIntent) => void;
  onEditTab?: (tabId: string) => void;
  /** Plano 16 — `parentPath` é o caminho de grupos pra chegar até a aba.
   *  Vazio = root. Cascading delete é responsabilidade do backend. */
  onDeleteTab?: (tabId: string, parentPath: string[]) => void;
  /** Lista de perfis (necessária para o switcher). Se ausente, switcher é
   *  desativado. */
  profiles?: Profile[];
  activeProfileId?: string;
  onSelectProfile?: (profileId: string) => void;
  onCreateProfile?: () => void;
  /** Issue #71 — sobe pra o entry o alvo atualmente sob o cursor. Usado
   *  pelo modo modo rápido: ao soltar o atalho global, o entry decide ação
   *  baseado no kind (leaf → openTab, group → só esconde, gear →
   *  openSettings, null → esconde). */
  onHoverChange?: (target: DonutHoverTarget) => void;
}

export type DonutHoverTarget =
  | { kind: "leaf"; id: string }
  | { kind: "group"; id: string }
  | { kind: "gear" }
  | null;

const PLUS_KEY = "__plus__";
const DEFAULT_TOKENS: ThemeTokens = resolvePresetTokens("dark");
/** Plano 23 / Issue #39 — raios do ring root derivam de uma base fixa
 *  (não do `size` da janela), pra que sub-anéis caibam dentro do viewBox.
 *  Janela cresce: 420 → 560 conforme `MAX_TAB_DEPTH = 2`. Com base 420 e
 *  ratios default (0.20/0.40), bandWidth=84; ring 1 (outermost permitido)
 *  termina a 252 do centro — dentro de 560/2 = 280. */
const RING_BASE_SIZE = 420;

interface RingPage {
  tabs: Tab[];
  hasPlus: boolean;
}

export const Donut: React.FC<DonutProps> = ({
  tabs,
  size,
  itemsPerPage,
  wheelDirection,
  hoverHoldMs = 1200,
  searchShortcut,
  sliceGapEnabled = true,
  tokens,
  onSelect,
  onOpenSettings,
  onEditTab,
  onDeleteTab,
  profiles,
  activeProfileId,
  onSelectProfile,
  onCreateProfile,
  onHoverChange,
}) => {
  const effectiveTokens = tokens ?? DEFAULT_TOKENS;
  const cx = size / 2;
  const cy = size / 2;
  // Plano 23 — raios são absolutos (relativos a `RING_BASE_SIZE` fixo) e
  // NÃO escalam com `size`. Janela cresce pra acomodar mais anéis sem
  // distorcê-los. Theme ratios continuam controlando proporção visual do
  // ring root via base fixa.
  const innerRRoot = RING_BASE_SIZE * effectiveTokens.dimensions.innerRatio;
  const outerRRoot = RING_BASE_SIZE * effectiveTokens.dimensions.outerRatio;

  const { t } = useTranslation();
  const [mode, setMode] = useState<"tabs" | "profiles">("tabs");
  const switcherEnabled = !!(profiles && activeProfileId && onSelectProfile);
  const [contextMenu, setContextMenu] = useState<
    | {
        x: number;
        y: number;
        tabId: string;
        tabLabel: string;
        ringDepth: number;
      }
    | null
  >(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const ringStack = useRingStack(tabs);
  // Plano 23 / Issue #39 — outermost ring é o último em `rings`. Limita
  // anéis a `MAX_RINGS` (2); useRingStack já garante isso, este `slice`
  // é defesa adicional contra states inconsistentes.
  const visibleRings = useMemo(
    () => ringStack.rings.slice(0, MAX_RINGS),
    [ringStack.rings],
  );

  // Atalho window-level pra abrir o overlay de busca. Suprimido quando
  // donut está em modo perfil ou com context menu aberto.
  useEffect(() => {
    if (!searchShortcut) return;
    const onKey = (e: KeyboardEvent) => {
      if (mode !== "tabs" || contextMenu || searchOpen) return;
      if (matchesCombo(e, searchShortcut)) {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [mode, contextMenu, searchOpen, searchShortcut]);

  // ESC sai do modo perfil quando estiver lá.
  useEffect(() => {
    if (mode !== "profiles") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setMode("tabs");
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [mode]);

  // Plano 23 — paginação por ring. Chave = `${depth}:${parentId}` para
  // que mudança de parent (toggle de grupo diferente no mesmo depth)
  // resete pra página 0 sem precisar limpeza manual.
  const ringKey = (depth: number, parentId: string | null) =>
    `${depth}:${parentId ?? "root"}`;
  const [pageByKey, setPageByKey] = useState<Record<string, number>>({});

  const ringPages: RingPage[][] = useMemo(
    () =>
      visibleRings.map((ring) => {
        const ordered = [...ring.tabs].sort((a, b) => a.order - b.order);
        return paginate(ordered, itemsPerPage);
      }),
    [visibleRings, itemsPerPage],
  );

  // Para cada ring, página atual (clamped ao número de páginas).
  const safePages = useMemo(
    () =>
      visibleRings.map((ring, i) => {
        const key = ringKey(ring.depth, ring.parentId);
        const requested = pageByKey[key] ?? 0;
        const len = ringPages[i].length;
        return Math.min(Math.max(0, requested), Math.max(0, len - 1));
      }),
    [visibleRings, pageByKey, ringPages],
  );

  // Plano 23 — slices renderizados em cada ring nesta página.
  const currentPerRing = useMemo(
    () =>
      visibleRings.map((_, i) => {
        const page = ringPages[i][safePages[i]];
        return page ?? { tabs: [], hasPlus: true };
      }),
    [visibleRings, ringPages, safePages],
  );

  // Hover-hold global: rastreia (ring, slice) via composto.
  const [hovered, setHovered] = useState<number | null>(null);

  const onMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (visibleRings.length === 0) {
      setHovered(null);
      return;
    }
    // Coordenadas relativas ao centro do SVG. clientX/Y → svg-local subtraindo
    // o bounding rect (cx/cy do svg viewport == size/2 logical).
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - cx;
    const py = e.clientY - rect.top - cy;
    const ring = pointToRingIndex(
      { x: px, y: py },
      visibleRings.length,
      innerRRoot,
      outerRRoot,
    );
    if (ring === null) {
      setHovered(null);
      return;
    }
    const dims = ringDims(ring, innerRRoot, outerRRoot);
    const current = currentPerRing[ring];
    const sliceCount = current.tabs.length + (current.hasPlus ? 1 : 0);
    if (sliceCount <= 0) {
      setHovered(null);
      return;
    }
    const slice = pointToSliceIndex({ x: px, y: py }, sliceCount, {
      innerRadius: dims.innerR,
      outerRadius: dims.outerR,
    });
    if (slice === null) {
      setHovered(null);
      return;
    }
    setHovered(encodeHoverIndex(ring, slice));
  };
  const onMouseLeave = () => setHovered(null);

  // Issue #71 — resolve o tab atualmente sob o cursor (não dispara em
  // hover do "+" ou fora de slice). Em modo profile-switcher o hover não
  // representa uma tab abrível, então mantemos `null`.
  const hoveredInfo = useMemo<{
    tab: Tab;
    ringDepth: number;
  } | null>(() => {
    if (mode !== "tabs" || hovered === null) return null;
    const { ring, slice } = decodeHoverIndex(hovered);
    if (ring < 0 || ring >= currentPerRing.length) return null;
    const tab = currentPerRing[ring].tabs[slice];
    if (!tab) return null;
    return { tab, ringDepth: visibleRings[ring]?.depth ?? ring };
  }, [hovered, currentPerRing, visibleRings, mode]);

  // Issue #71 — tracking do hover sobre o CenterCircle. Permite que o entry
  // saiba quando o cursor está sobre o gear (left) — release-over-gear no
  // modo modo rápido abre Settings.
  const [centerHover, setCenterHover] = useState<"left" | "right" | null>(null);

  const hoverTarget = useMemo<DonutHoverTarget>(() => {
    if (mode !== "tabs") return null;
    if (centerHover === "left") return { kind: "gear" };
    if (hoveredInfo) {
      return isGroup(hoveredInfo.tab)
        ? { kind: "group", id: hoveredInfo.tab.id }
        : { kind: "leaf", id: hoveredInfo.tab.id };
    }
    return null;
  }, [mode, centerHover, hoveredInfo]);

  useEffect(() => {
    onHoverChange?.(hoverTarget);
  }, [hoverTarget, onHoverChange]);

  // Hover-to-expand: passar o cursor sobre um group abre o sub-anel
  // instantaneamente. Comportamento universal — não depende do modo
  // rápido. `useHoverToExpand` guarda a expansão pela string `id`,
  // evitando re-disparo quando outra atualização (ex.: o próprio `toggle`
  // de fechamento por click) regenera as refs upstream sem mudar de fato
  // o group sob o cursor. Click no group continua chamando `toggle`, que
  // permanece como o gesto de fechar.
  const hoveredGroup = useMemo(
    () =>
      hoveredInfo && isGroup(hoveredInfo.tab)
        ? { id: hoveredInfo.tab.id, depth: hoveredInfo.ringDepth }
        : null,
    [hoveredInfo],
  );
  useHoverToExpand(hoveredGroup, ringStack.expand);

  // Hover-to-collapse: complementa o hover-to-expand. Quando o cursor sai
  // da fatia do group E do anel externo correspondente, o group volta
  // (sem precisar de click). Pausa enquanto context-menu/search overlay
  // estão abertos pra não colapsar a estrutura por baixo do user.
  const hoveredForCollapse = useMemo(() => {
    if (mode !== "tabs" || hovered === null) return null;
    const { ring, slice } = decodeHoverIndex(hovered);
    if (ring < 0 || ring >= currentPerRing.length) return null;
    const tab = currentPerRing[ring].tabs[slice];
    return { ring, tabId: tab?.id ?? null };
  }, [mode, hovered, currentPerRing]);
  useHoverToCollapse({
    hovered: hoveredForCollapse,
    expandedGroupIds: ringStack.expandedGroupIds,
    trim: ringStack.trimToLength,
    enabled: !contextMenu && !searchOpen,
  });

  const isTabSlice = (idx: number) => {
    const { ring, slice } = decodeHoverIndex(idx);
    if (ring < 0 || ring >= currentPerRing.length) return false;
    const current = currentPerRing[ring];
    return slice >= 0 && slice < current.tabs.length;
  };

  const hoverHold = useHoverHold({
    hoveredSlice: contextMenu || searchOpen ? null : hovered,
    isTabSlice,
    holdMs: hoverHoldMs,
    onComplete: () => {
      // visual feedback only — actions são disparadas via overlay
    },
  });

  // ESC durante actionable/confirming → cancela o gesto.
  useEffect(() => {
    const phase = hoverHold.state.phase;
    if (phase !== "actionable" && phase !== "confirming") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        hoverHold.cancel();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [hoverHold.state.phase, hoverHold]);

  // Plano 23 — sem level-back: ESC NÃO tira anel. Donut entry trata ESC e
  // fecha tudo. Mantemos só os ESC handlers acima (modo perfil + hover-hold).

  const setRingPage = (ring: number, next: number) => {
    if (ring < 0 || ring >= visibleRings.length) return;
    const key = ringKey(visibleRings[ring].depth, visibleRings[ring].parentId);
    setPageByKey((prev) => {
      const total = ringPages[ring].length;
      const clamped = Math.max(0, Math.min(total - 1, next));
      if (clamped === (prev[key] ?? 0)) return prev;
      // Página mudou: hover-hold pode estar apontando pra slice agora
      // sumida; reseta defensivamente.
      if (hoverHold.state.phase !== "idle") hoverHold.reset();
      return { ...prev, [key]: clamped };
    });
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    if (searchOpen) return;
    // Plano 23 — wheel rotaciona páginas do ring sob o cursor; fallback =
    // outermost. Permite paginar root mesmo com sub-anel aberto.
    const targetRing =
      hovered !== null
        ? decodeHoverIndex(hovered).ring
        : visibleRings.length - 1;
    if (targetRing < 0) return;
    const total = ringPages[targetRing]?.length ?? 0;
    if (total <= 1) return;
    const direction = wheelDirection === "inverted" ? -1 : 1;
    const delta = e.deltaY > 0 ? 1 : -1;
    setRingPage(targetRing, safePages[targetRing] + delta * direction);
  };

  // Decode active hover-hold target.
  const activeIdx =
    hoverHold.state.phase === "idle" ? null : hoverHold.state.sliceIndex;
  const active = activeIdx !== null ? decodeHoverIndex(activeIdx) : null;
  const activeTab =
    active && active.ring >= 0 && active.ring < currentPerRing.length
      ? currentPerRing[active.ring].tabs[active.slice] ?? null
      : null;
  const activeRingDims =
    active && active.ring < visibleRings.length
      ? ringDims(active.ring, innerRRoot, outerRRoot)
      : null;
  const activeRingSliceCount =
    active && active.ring < currentPerRing.length
      ? currentPerRing[active.ring].tabs.length +
        (currentPerRing[active.ring].hasPlus ? 1 : 0)
      : 0;

  // Caminho de parent até o ring N. Pra `onDeleteTab(id, parentPath)`,
  // parentPath é os ids dos rings expandidos antes desse ring.
  const parentPathForRing = (ringDepth: number): string[] =>
    ringStack.expandedGroupIds.slice(0, ringDepth);

  // Profile mode unchanged.
  if (mode === "profiles" && profiles && activeProfileId && onSelectProfile) {
    return (
      <ThemeContext.Provider value={effectiveTokens}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ fontFamily: DONUT_FONT_FAMILY }}
        >
          <ProfileSwitcher
            cx={cx}
            cy={cy}
            innerR={innerRRoot}
            outerR={outerRRoot}
            profiles={profiles}
            activeProfileId={activeProfileId}
            onSelect={(id) => {
              setMode("tabs");
              onSelectProfile(id);
            }}
            onCreate={() => {
              setMode("tabs");
              onCreateProfile?.();
            }}
            sliceGapEnabled={sliceGapEnabled}
          />
          <CenterCircle
            cx={cx}
            cy={cy}
            r={innerRRoot * 0.85}
            onGearClick={onOpenSettings}
            onProfileSwitcherClick={() => setMode("tabs")}
            onHoverChange={setCenterHover}
          />
        </svg>
      </ThemeContext.Provider>
    );
  }

  // Pagination dots: outermost ring com mais de 1 página.
  const outermostIdx = visibleRings.length - 1;
  const outermostPagesCount = ringPages[outermostIdx]?.length ?? 0;
  const outermostSafePage = safePages[outermostIdx] ?? 0;

  return (
    <ThemeContext.Provider value={effectiveTokens}>
      <>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ fontFamily: DONUT_FONT_FAMILY }}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          onWheel={handleWheel}
        >
          {visibleRings.map((ring, ringIdx) => {
            const dims: RingDims = ringDims(ringIdx, innerRRoot, outerRRoot);
            const current = currentPerRing[ringIdx];
            const sliceCount = current.tabs.length + (current.hasPlus ? 1 : 0);
            const plusIdx = current.hasPlus ? current.tabs.length : -1;
            const ringKeyStr = ringKey(ring.depth, ring.parentId);
            // Plus intent: root = "new-tab"; sub-rings = path até o group
            // pai (cujos children são renderizados no ring). Como
            // `parentPathForRing(N)` já retorna `expandedGroupIds.slice(0,N)`
            // — i.e., o caminho completo do root até esse parent group —
            // basta `join(",")`. Concatenar `ring.parentId` aqui duplicaria
            // o último id do path (ring.parentId === expandedGroupIds[depth-1]),
            // resultando em CSV inválido tipo "g1,g1".
            const plusIntent: SettingsIntent =
              ring.depth === 0
                ? "new-tab"
                : (`new-tab-in-group:${parentPathForRing(ring.depth).join(",")}` as SettingsIntent);
            return (
              <g key={ringKeyStr}>
                {current.tabs.map((tab, sliceIdx) => {
                  // Plano 23 — todos os rings (incluindo root) ganham
                  // respiro angular entre vizinhos.
                  const { start, end } = slicePaintRange(
                    sliceIdx,
                    sliceCount,
                    sliceGapEnabled ? OUTER_SLICE_ANGULAR_GAP_RAD : 0,
                  );
                  const isHighlighted =
                    hovered !== null &&
                    decodeHoverIndex(hovered).ring === ringIdx &&
                    decodeHoverIndex(hovered).slice === sliceIdx;
                  return (
                    <TabSlice
                      key={tab.id}
                      tab={tab}
                      cx={cx}
                      cy={cy}
                      innerR={dims.innerR}
                      outerR={dims.outerR}
                      startAngle={start}
                      endAngle={end}
                      highlighted={isHighlighted}
                      onClick={() => {
                        const phase = hoverHold.state.phase;
                        if (
                          (phase === "actionable" || phase === "confirming") &&
                          active &&
                          active.ring === ringIdx &&
                          active.slice === sliceIdx
                        ) {
                          return;
                        }
                        if (isGroup(tab)) {
                          // Plano 23 — toggle abre/fecha o ring no `depth+1`.
                          // Ring 2 (outermost permitido) → groups dentro são
                          // no-op pois não há onde expandir.
                          ringStack.toggle(tab.id, ring.depth);
                        } else {
                          onSelect(tab.id);
                        }
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        hoverHold.reset();
                        setContextMenu({
                          x: e.clientX,
                          y: e.clientY,
                          tabId: tab.id,
                          tabLabel: tab.name ?? tab.icon ?? tab.id,
                          ringDepth: ring.depth,
                        });
                      }}
                    />
                  );
                })}
                {current.hasPlus &&
                  (() => {
                    const { start, end } = slicePaintRange(
                      plusIdx,
                      sliceCount,
                      sliceGapEnabled ? OUTER_SLICE_ANGULAR_GAP_RAD : 0,
                    );
                    return (
                      <Slice
                        key={PLUS_KEY}
                        cx={cx}
                        cy={cy}
                        innerR={dims.innerR}
                        outerR={dims.outerR}
                        startAngle={start}
                        endAngle={end}
                        icon="+"
                        highlighted={
                          hovered !== null &&
                          decodeHoverIndex(hovered).ring === ringIdx &&
                          decodeHoverIndex(hovered).slice === plusIdx
                        }
                        onClick={() => onOpenSettings?.(plusIntent)}
                      />
                    );
                  })()}
              </g>
            );
          })}
          {activeTab &&
            active &&
            activeRingDims &&
            (() => {
              // Plano 23 — overlay casa a pintura do slice. Todos os rings
              // usam o mesmo gap angular.
              const { start, end } = slicePaintRange(
                active.slice,
                activeRingSliceCount,
                sliceGapEnabled ? OUTER_SLICE_ANGULAR_GAP_RAD : 0,
              );
              const parentPath = parentPathForRing(
                visibleRings[active.ring]?.depth ?? 0,
              );
              return (
                <HoverHoldOverlay
                  cx={cx}
                  cy={cy}
                  innerR={activeRingDims.innerR}
                  outerR={activeRingDims.outerR}
                  startAngle={start}
                  endAngle={end}
                  state={hoverHold.state}
                  onEdit={() => {
                    hoverHold.cancel();
                    onEditTab?.(activeTab.id);
                  }}
                  onRequestDelete={() => {
                    if (isGroup(activeTab)) {
                      hoverHold.cancel();
                      const count = countDescendants(activeTab);
                      const ok = window.confirm(
                        t("donut.confirmCascadeDelete", {
                          label: activeTab.name ?? activeTab.icon ?? activeTab.id,
                          count,
                        }),
                      );
                      if (ok) onDeleteTab?.(activeTab.id, parentPath);
                      return;
                    }
                    hoverHold.requestDelete();
                  }}
                  onConfirmDelete={() => {
                    const id = activeTab.id;
                    hoverHold.confirmDelete();
                    onDeleteTab?.(id, parentPath);
                  }}
                  onCancelConfirm={hoverHold.cancel}
                />
              );
            })()}
          <CenterCircle
            cx={cx}
            cy={cy}
            r={innerRRoot * 0.85}
            onGearClick={onOpenSettings}
            onProfileSwitcherClick={
              switcherEnabled ? () => setMode("profiles") : undefined
            }
            onHoverChange={setCenterHover}
          />
          {outermostPagesCount > 1 && (
            <PaginationDots
              total={outermostPagesCount}
              active={outermostSafePage}
              cx={cx}
              cy={size * 0.94}
              onChange={(p) => setRingPage(outermostIdx, p)}
            />
          )}
        </svg>
        {contextMenu && (
          <SliceContextMenu
            position={{ x: contextMenu.x, y: contextMenu.y }}
            onClose={() => setContextMenu(null)}
            items={[
              {
                id: "open-all",
                label: t("donut.contextMenu.openAll"),
                onSelect: () => onSelect(contextMenu.tabId),
              },
              {
                id: "edit",
                label: t("donut.contextMenu.edit"),
                onSelect: () => onEditTab?.(contextMenu.tabId),
              },
              {
                id: "delete",
                label: t("donut.contextMenu.delete"),
                variant: "danger",
                onSelect: () => {
                  // Encontra o tab no ring certo via depth do contexto.
                  const ringTabs = currentPerRing[
                    visibleRings.findIndex((r) => r.depth === contextMenu.ringDepth)
                  ]?.tabs ?? [];
                  const tab = ringTabs.find((tt) => tt.id === contextMenu.tabId);
                  const tabIsGroup = tab ? isGroup(tab) : false;
                  const promptKey = tabIsGroup
                    ? "donut.confirmCascadeDelete"
                    : "donut.contextMenu.confirmDelete";
                  const promptVars = tabIsGroup
                    ? {
                        label: contextMenu.tabLabel,
                        count: tab ? countDescendants(tab) : 0,
                      }
                    : { label: contextMenu.tabLabel };
                  const ok = window.confirm(t(promptKey, promptVars));
                  if (ok) {
                    onDeleteTab?.(
                      contextMenu.tabId,
                      parentPathForRing(contextMenu.ringDepth),
                    );
                  }
                },
              },
            ]}
          />
        )}
        {searchOpen && (
          <TabSearchOverlay
            tabs={tabs}
            onClose={() => setSearchOpen(false)}
            onSelect={(tabId) => {
              setSearchOpen(false);
              onSelect(tabId);
            }}
          />
        )}
      </>
    </ThemeContext.Provider>
  );
};
