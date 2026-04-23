import { useCallback, useState } from "react";
import { pointToSliceIndex } from "./geometry";

export interface UseSliceHighlightOpts {
  center: { x: number; y: number };
  slices: number;
  innerRadius: number;
  outerRadius: number;
}

export function useSliceHighlight(opts: UseSliceHighlightOpts) {
  const [highlighted, setHighlighted] = useState<number | null>(null);

  const onMouseMove = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (opts.slices <= 0) { setHighlighted(null); return; }
    const p = { x: e.clientX - opts.center.x, y: e.clientY - opts.center.y };
    const idx = pointToSliceIndex(p, opts.slices, {
      innerRadius: opts.innerRadius,
      outerRadius: opts.outerRadius,
    });
    setHighlighted(idx);
  }, [opts.center.x, opts.center.y, opts.slices, opts.innerRadius, opts.outerRadius]);

  const onMouseLeave = useCallback(() => setHighlighted(null), []);

  return { highlighted, onMouseMove, onMouseLeave };
}
