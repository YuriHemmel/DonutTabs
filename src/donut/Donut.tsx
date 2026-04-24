import React from "react";
import type { Tab } from "../core/types/Tab";
import { Slice } from "./Slice";
import { CenterCircle } from "./CenterCircle";
import { sliceAngleRange } from "./geometry";
import { useSliceHighlight } from "./useSliceHighlight";

export interface DonutProps {
  tabs: Tab[];
  size: number;
  onSelect: (tabId: string) => void;
  onOpenSettings?: () => void;
}

export const Donut: React.FC<DonutProps> = ({ tabs, size, onSelect, onOpenSettings }) => {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.46;
  const innerR = size * 0.22;

  const ordered = [...tabs].sort((a, b) => a.order - b.order);

  const { highlighted, onMouseMove, onMouseLeave } = useSliceHighlight({
    center: { x: cx, y: cy },
    slices: ordered.length,
    innerRadius: innerR,
    outerRadius: outerR,
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {ordered.map((tab, i) => {
        const { start, end } = sliceAngleRange(i, ordered.length);
        return (
          <Slice
            key={tab.id}
            cx={cx}
            cy={cy}
            innerR={innerR}
            outerR={outerR}
            startAngle={start}
            endAngle={end}
            label={tab.name ?? undefined}
            icon={tab.icon ?? undefined}
            highlighted={highlighted === i}
            onClick={() => onSelect(tab.id)}
          />
        );
      })}
      <CenterCircle cx={cx} cy={cy} r={innerR * 0.85} onGearClick={onOpenSettings} />
    </svg>
  );
};
