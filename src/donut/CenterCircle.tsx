import React, { useState } from "react";
import { useTheme } from "./themeContext";

export interface CenterCircleProps {
  cx: number;
  cy: number;
  r: number;
  onGearClick?: () => void;
  onProfileSwitcherClick?: () => void;
}

type Half = "left" | "right" | null;

function leftHalfPath(cx: number, cy: number, r: number): string {
  // Semicírculo esquerdo: do topo, arc CCW (sweep=0) até base.
  return `M ${cx} ${cy - r} A ${r} ${r} 0 0 0 ${cx} ${cy + r} Z`;
}

function rightHalfPath(cx: number, cy: number, r: number): string {
  // Semicírculo direito: do topo, arc CW (sweep=1) até base.
  return `M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r} Z`;
}

export const CenterCircle: React.FC<CenterCircleProps> = ({
  cx,
  cy,
  r,
  onGearClick,
  onProfileSwitcherClick,
}) => {
  const tokens = useTheme();
  const [hovered, setHovered] = useState<Half>(null);
  const leftHover = hovered === "left" && !!onGearClick;
  const rightHover = hovered === "right" && !!onProfileSwitcherClick;
  return (
  <g>
    <path
      data-testid="center-half-left"
      d={leftHalfPath(cx, cy, r)}
      fill={leftHover ? tokens.colors.sliceHighlight : tokens.colors.centerFill}
      fillOpacity={tokens.alpha.overlay}
      stroke={tokens.colors.sliceStroke}
      strokeWidth={1}
    />
    <path
      data-testid="center-half-right"
      d={rightHalfPath(cx, cy, r)}
      fill={rightHover ? tokens.colors.sliceHighlight : tokens.colors.centerFill}
      fillOpacity={tokens.alpha.overlay}
      stroke={tokens.colors.sliceStroke}
      strokeWidth={1}
    />
    <line
      x1={cx}
      y1={cy - r}
      x2={cx}
      y2={cy + r}
      stroke={tokens.colors.sliceStroke}
      strokeWidth={1}
    />
    <text
      x={cx - r / 2}
      y={cy}
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize={28}
      fill="#777"
      style={{ userSelect: "none", pointerEvents: "none" }}
    >
      ⚙
    </text>
    <g
      transform={`translate(${cx + r / 2}, ${cy - 3})`}
      stroke="#777"
      strokeWidth={1.8}
      fill="none"
      strokeLinecap="round"
      pointerEvents="none"
    >
      <circle cx={0} cy={-6} r={5} />
      <path d="M -9 12 A 10 10 0 0 1 9 12" />
    </g>
    {onGearClick && (
      <rect
        data-testid="gear-hit"
        x={cx - r}
        y={cy - r}
        width={r}
        height={r * 2}
        fill="transparent"
        style={{ cursor: "pointer" }}
        onMouseEnter={() => setHovered("left")}
        onMouseLeave={() => setHovered((h) => (h === "left" ? null : h))}
        onClick={(e) => {
          e.stopPropagation();
          onGearClick();
        }}
      />
    )}
    {onProfileSwitcherClick && (
      <rect
        data-testid="profile-switcher-hit"
        x={cx}
        y={cy - r}
        width={r}
        height={r * 2}
        fill="transparent"
        style={{ cursor: "pointer" }}
        onMouseEnter={() => setHovered("right")}
        onMouseLeave={() => setHovered((h) => (h === "right" ? null : h))}
        onClick={(e) => {
          e.stopPropagation();
          onProfileSwitcherClick();
        }}
      />
    )}
  </g>
  );
};
