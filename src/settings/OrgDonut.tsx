import React from "react";
import type { Tab } from "../core/types/Tab";
import type { ThemeTokens } from "../core/themeTokens";
import { ThemeContext } from "../donut/themeContext";
import { Slice } from "../donut/Slice";
import { IconRenderer } from "../donut/IconRenderer";
import { slicePaintAngles, OUTER_SLICE_GAP_PX } from "../donut/geometry";

export interface OrgDonutProps {
  /** Abas desta página (já na ordem). */
  tabs: Tab[];
  /** Mostra a fatia "+" (alvo de "inserir no fim" desta página). */
  hasPlus: boolean;
  tokens: ThemeTokens;
  /** Tamanho total do SVG em px. Default 170. */
  size?: number;
  /** Aba sendo arrastada — esmaecida pra dar feedback. */
  draggingTabId?: string | null;
  /** Índice da fatia destacada como alvo de drop, ou `null`. */
  highlightSlot?: number | null;
  /** Iniciado ao pressionar uma fatia de aba (não dispara no "+"). */
  onSlicePointerDown?: (tabId: string, slot: number, e: React.PointerEvent) => void;
  /** Registra o elemento SVG no pai pra hit-test do drop. */
  svgRef?: (el: SVGSVGElement | null) => void;
  "data-testid"?: string;
}

const tabInitial = (tab: Tab): string =>
  (tab.name ?? tab.icon ?? "•").trim().slice(0, 1) || "•";

/**
 * Issue #102 — renderiza UMA página de um ring como um mini-donut, reusando
 * `<Slice>`/`<IconRenderer>` pra ficar visualmente fiel ao donut real. Cada
 * fatia de aba é arrastável (pointer-based); a fatia "+" é só um alvo de
 * drop "no fim". Consome o tema via `ThemeContext` (tokens do perfil).
 */
export const OrgDonut: React.FC<OrgDonutProps> = ({
  tabs,
  hasPlus,
  tokens,
  size = 170,
  draggingTabId,
  highlightSlot,
  onSlicePointerDown,
  svgRef,
  "data-testid": testId,
}) => {
  const cx = size / 2;
  const cy = size / 2;
  const innerR = size * tokens.dimensions.innerRatio;
  const outerR = size * tokens.dimensions.outerRatio;
  const total = tabs.length + (hasPlus ? 1 : 0);
  const iconSize = Math.round(size * 0.11);

  return (
    <ThemeContext.Provider value={tokens}>
      <svg
        ref={svgRef}
        data-testid={testId}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ touchAction: "none" }}
      >
        {Array.from({ length: total }, (_, i) => {
          const angles = slicePaintAngles(i, total, OUTER_SLICE_GAP_PX, innerR, outerR);
          const isPlus = i >= tabs.length;
          const tab = isPlus ? null : tabs[i];
          const highlighted = highlightSlot === i;
          const dim = tab != null && tab.id === draggingTabId;
          return (
            <g
              key={isPlus ? "plus" : tab!.id}
              data-testid={
                isPlus
                  ? `${testId ?? "org-donut"}-plus`
                  : `${testId ?? "org-donut"}-slice-${tab!.id}`
              }
              opacity={dim ? 0.35 : 1}
              style={{ cursor: isPlus ? "default" : "grab" }}
              onPointerDown={(e) => {
                if (isPlus || !tab) return;
                onSlicePointerDown?.(tab.id, i, e);
              }}
            >
              <Slice
                cx={cx}
                cy={cy}
                innerR={innerR}
                outerR={outerR}
                startAngle={angles.outerStart}
                endAngle={angles.outerEnd}
                innerStartAngle={angles.innerStart}
                innerEndAngle={angles.innerEnd}
                outerStartAngle={angles.outerStart}
                outerEndAngle={angles.outerEnd}
                highlighted={highlighted}
                label={isPlus ? "+" : tab!.name ?? undefined}
                iconNode={
                  isPlus ? undefined : (
                    <IconRenderer
                      icon={tab!.icon}
                      fallback={tabInitial(tab!)}
                      size={iconSize}
                    />
                  )
                }
                onClick={() => {}}
              />
            </g>
          );
        })}
        <circle
          cx={cx}
          cy={cy}
          r={innerR * 0.85}
          fill={tokens.colors.centerFill}
          fillOpacity={tokens.alpha.overlay}
          stroke={tokens.colors.sliceStroke}
          strokeWidth={1}
          pointerEvents="none"
        />
      </svg>
    </ThemeContext.Provider>
  );
};
