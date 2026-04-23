import React from "react";
import { arcPath } from "./geometry";

export interface SliceProps {
  cx: number; cy: number;
  innerR: number; outerR: number;
  startAngle: number; endAngle: number;
  label?: string;
  icon?: string;
  highlighted: boolean;
  onClick: () => void;
}

export const Slice: React.FC<SliceProps> = (p) => {
  const d = arcPath(p);
  const mid = (p.startAngle + p.endAngle) / 2;
  const labelR = (p.innerR + p.outerR) / 2;
  const lx = p.cx + labelR * Math.cos(mid);
  const ly = p.cy + labelR * Math.sin(mid);

  return (
    <g onClick={p.onClick} style={{ cursor: "pointer" }}>
      <path
        d={d}
        fill={p.highlighted ? "#2a3b5a" : "#1b2436"}
        stroke="#3a4968"
        strokeWidth={1}
      />
      <g transform={`translate(${lx} ${ly})`} textAnchor="middle" fill="#eaeaea">
        {p.icon && (
          <text y={p.label ? -8 : 4} fontSize={22}>{p.icon}</text>
        )}
        {p.label && (
          <text y={p.icon ? 18 : 4} fontSize={12}>{p.label}</text>
        )}
      </g>
    </g>
  );
};
