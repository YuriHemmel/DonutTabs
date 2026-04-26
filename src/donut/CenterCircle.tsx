import React from "react";

export interface CenterCircleProps {
  cx: number;
  cy: number;
  r: number;
  onGearClick?: () => void;
  onProfileSwitcherClick?: () => void;
}

export const CenterCircle: React.FC<CenterCircleProps> = ({
  cx,
  cy,
  r,
  onGearClick,
  onProfileSwitcherClick,
}) => (
  <g>
    <circle cx={cx} cy={cy} r={r} fill="#141a28" stroke="#3a4968" strokeWidth={1} />
    <line x1={cx} y1={cy - r} x2={cx} y2={cy + r} stroke="#3a4968" strokeWidth={1} />
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
        onClick={(e) => {
          e.stopPropagation();
          onProfileSwitcherClick();
        }}
      />
    )}
  </g>
);
