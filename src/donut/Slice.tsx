import React from "react";
import { arcPath } from "./geometry";

export interface SliceProps {
  cx: number; cy: number;
  innerR: number; outerR: number;
  startAngle: number; endAngle: number;
  label?: string;
  icon?: string;
  /** Optional rich icon node (e.g. <IconRenderer/>). When set, replaces the
   *  string-based icon rendering. */
  iconNode?: React.ReactNode;
  highlighted: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent<SVGGElement>) => void;
}

export const Slice: React.FC<SliceProps> = (p) => {
  const d = arcPath(p);
  const mid = (p.startAngle + p.endAngle) / 2;
  const labelR = (p.innerR + p.outerR) / 2;
  const lx = p.cx + labelR * Math.cos(mid);
  const ly = p.cy + labelR * Math.sin(mid);
  const hasIcon = p.iconNode !== undefined || !!p.icon;

  return (
    <g onClick={p.onClick} onContextMenu={p.onContextMenu} style={{ cursor: "pointer" }}>
      <path
        data-testid="donut-slice"
        d={d}
        fill={p.highlighted ? "#2a3b5a" : "#1b2436"}
        fillRule="evenodd"
        stroke="#3a4968"
        strokeWidth={1}
      />
      <g transform={`translate(${lx} ${ly})`} textAnchor="middle" fill="#eaeaea">
        {p.iconNode !== undefined ? (
          <g transform={`translate(0 ${p.label ? -8 : 0})`}>{p.iconNode}</g>
        ) : (
          p.icon && <text y={p.label ? -8 : 4} fontSize={22}>{p.icon}</text>
        )}
        {p.label && (
          <text y={hasIcon ? 18 : 4} fontSize={12}>{p.label}</text>
        )}
      </g>
    </g>
  );
};
