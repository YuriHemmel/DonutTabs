import React from "react";

export interface PaginationDotsProps {
  total: number;
  active: number;
  cx: number;
  cy: number;
  onChange: (page: number) => void;
}

/**
 * Linha horizontal de pontos clicáveis. Não renderiza nada quando há só uma
 * página. Posicionada via `cx`/`cy` para encaixar entre o anel externo e a
 * borda do SVG do donut.
 */
export const PaginationDots: React.FC<PaginationDotsProps> = ({
  total,
  active,
  cx,
  cy,
  onChange,
}) => {
  if (total <= 1) return null;
  const gap = 14;
  const r = 4;
  const totalWidth = (total - 1) * gap;
  const startX = cx - totalWidth / 2;

  return (
    <g aria-label="pagination" data-testid="pagination-dots" role="tablist">
      {Array.from({ length: total }, (_, i) => {
        const isActive = i === active;
        const activate = () => onChange(i);
        return (
          <g
            key={i}
            data-testid={`pagination-dot-${i}`}
            data-active={isActive ? "true" : "false"}
            role="tab"
            tabIndex={0}
            aria-label={`Página ${i + 1}`}
            aria-selected={isActive}
            style={{ cursor: "pointer", outline: "none" }}
            onClick={(e) => {
              e.stopPropagation();
              activate();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                activate();
              }
            }}
          >
            <circle
              cx={startX + i * gap}
              cy={cy}
              r={r}
              fill={isActive ? "#dde" : "#445"}
            />
          </g>
        );
      })}
    </g>
  );
};
