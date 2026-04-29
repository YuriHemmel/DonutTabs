import React from "react";
import { useTranslation } from "react-i18next";

export interface BreadcrumbProps {
  /** Labels dos níveis (root primeiro). Vazio = não renderiza. */
  segments: string[];
  /** Index do segmento clicado: -1 = root, 0+ = índice em `segments`. */
  onJumpTo: (index: number) => void;
}

/**
 * Plano 16 — overlay HTML no topo do donut mostrando o caminho de
 * navegação. Cada segmento (exceto o último, que é a posição atual) é
 * clicável e dispara `onJumpTo(index)`. `index = -1` significa "voltar pro
 * root". Quando `segments` é vazio, não renderiza nada.
 *
 * Posicionamento `fixed top center` para ficar fora do SVG do donut sem
 * brigar com hover/click das fatias.
 */
export const Breadcrumb: React.FC<BreadcrumbProps> = ({ segments, onJumpTo }) => {
  const { t } = useTranslation();
  if (segments.length === 0) return null;

  const lastIndex = segments.length - 1;

  return (
    <div
      data-testid="donut-breadcrumb"
      style={{
        position: "fixed",
        top: 8,
        left: "50%",
        transform: "translateX(-50%)",
        padding: "4px 10px",
        borderRadius: 12,
        background: "rgba(0, 0, 0, 0.45)",
        color: "var(--donut-text, #eaeaea)",
        fontSize: 12,
        display: "flex",
        gap: 4,
        alignItems: "center",
        pointerEvents: "auto",
        userSelect: "none",
      }}
    >
      <button
        type="button"
        data-testid="breadcrumb-root"
        onClick={(e) => {
          e.stopPropagation();
          onJumpTo(-1);
        }}
        style={{
          background: "transparent",
          border: 0,
          color: "inherit",
          cursor: "pointer",
          padding: "2px 6px",
          font: "inherit",
        }}
      >
        {t("donut.breadcrumb.root")}
      </button>
      {segments.map((label, i) => {
        const isLast = i === lastIndex;
        return (
          <React.Fragment key={i}>
            <span style={{ opacity: 0.5 }}>/</span>
            {isLast ? (
              <span
                data-testid={`breadcrumb-current`}
                style={{ padding: "2px 6px", fontWeight: 600 }}
              >
                {label}
              </span>
            ) : (
              <button
                type="button"
                data-testid={`breadcrumb-segment-${i}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onJumpTo(i);
                }}
                style={{
                  background: "transparent",
                  border: 0,
                  color: "inherit",
                  cursor: "pointer",
                  padding: "2px 6px",
                  font: "inherit",
                }}
              >
                {label}
              </button>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};
