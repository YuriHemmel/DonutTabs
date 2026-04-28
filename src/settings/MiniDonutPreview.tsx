import React from "react";
import { arcPath, sliceAngleRange } from "../donut/geometry";
import type { ThemeTokens } from "../core/themeTokens";

export interface MiniDonutPreviewProps {
  tokens: ThemeTokens;
  /** Tamanho total do SVG em px. Default 140. */
  size?: number;
}

const DUMMY_LABELS = ["A", "B", "C", "D"];

/**
 * Mini donut estático para o `<ThemeCustomizer>`. Renderiza 4 fatias dummy +
 * círculo central pra dar uma noção das cores e ratios sem depender de
 * `<Slice>` (que reage a hover/click). Inputa diretamente do tokens passado;
 * não consome ThemeContext — a ideia é pré-visualizar mudanças que ainda
 * não foram persistidas.
 */
export const MiniDonutPreview: React.FC<MiniDonutPreviewProps> = ({
  tokens,
  size = 140,
}) => {
  const cx = size / 2;
  const cy = size / 2;
  const innerR = size * tokens.dimensions.innerRatio;
  const outerR = size * tokens.dimensions.outerRatio;
  const total = DUMMY_LABELS.length;

  return (
    <svg
      data-testid="mini-donut-preview"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
    >
      {DUMMY_LABELS.map((label, i) => {
        const { start, end } = sliceAngleRange(i, total);
        const d = arcPath({ cx, cy, innerR, outerR, startAngle: start, endAngle: end });
        const isHighlighted = i === 0;
        const mid = (start + end) / 2;
        const labelR = (innerR + outerR) / 2;
        const lx = cx + labelR * Math.cos(mid);
        const ly = cy + labelR * Math.sin(mid);
        return (
          <g key={label}>
            <path
              d={d}
              fill={
                isHighlighted ? tokens.colors.sliceHighlight : tokens.colors.sliceFill
              }
              fillOpacity={tokens.alpha.overlay}
              fillRule="evenodd"
              stroke={tokens.colors.sliceStroke}
              strokeWidth={1}
            />
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={11}
              fill={tokens.colors.text}
              pointerEvents="none"
            >
              {label}
            </text>
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
      />
    </svg>
  );
};
