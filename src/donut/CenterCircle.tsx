import React from "react";

export interface CenterCircleProps {
  cx: number; cy: number;
  r: number;
}

export const CenterCircle: React.FC<CenterCircleProps> = ({ cx, cy, r }) => (
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
    >
      ⚙
    </text>
    <text
      x={cx + r / 2}
      y={cy}
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize={28}
      fill="#777"
    >
      👤
    </text>
  </g>
);
