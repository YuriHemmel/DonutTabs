import React from "react";
import { useTranslation } from "react-i18next";
import { arcPath } from "./geometry";
import type { HoverHoldPhase } from "./useHoverHold";

export interface HoverHoldOverlayProps {
  cx: number;
  cy: number;
  innerR: number;
  outerR: number;
  startAngle: number;
  endAngle: number;
  state: HoverHoldPhase;
  onEdit: () => void;
  onRequestDelete: () => void;
  onConfirmDelete: () => void;
  onCancelConfirm: () => void;
}

export const HoverHoldOverlay: React.FC<HoverHoldOverlayProps> = ({
  cx,
  cy,
  innerR,
  outerR,
  startAngle,
  endAngle,
  state,
  onEdit,
  onRequestDelete,
  onConfirmDelete,
  onCancelConfirm,
}) => {
  const { t } = useTranslation();
  if (state.phase === "idle") return null;

  const mid = (startAngle + endAngle) / 2;
  const labelR = (innerR + outerR) / 2;

  if (state.phase === "holding") {
    // Preenchimento radial: arco com mesmo ângulo, raio externo cresce até outerR.
    const filledOuter = innerR + (outerR - innerR) * state.progress;
    const d = arcPath({
      cx,
      cy,
      innerR,
      outerR: filledOuter,
      startAngle,
      endAngle,
    });
    return (
      <g data-testid="hover-hold-fill" pointerEvents="none">
        <path d={d} fill="rgba(80, 130, 220, 0.45)" />
      </g>
    );
  }

  // actionable / confirming → divisão metade-metade, esquerda ✏️ direita 🗑️.
  const editPath = arcPath({
    cx,
    cy,
    innerR,
    outerR,
    startAngle,
    endAngle: mid,
  });
  const deletePath = arcPath({
    cx,
    cy,
    innerR,
    outerR,
    startAngle: mid,
    endAngle,
  });

  // Posição dos labels: ângulo em 1/4 e 3/4 da fatia.
  const editAngle = (startAngle + mid) / 2;
  const deleteAngle = (mid + endAngle) / 2;
  const editX = cx + labelR * Math.cos(editAngle);
  const editY = cy + labelR * Math.sin(editAngle);
  const deleteX = cx + labelR * Math.cos(deleteAngle);
  const deleteY = cy + labelR * Math.sin(deleteAngle);

  if (state.phase === "actionable") {
    return (
      <g data-testid="hover-hold-action">
        <path
          d={editPath}
          data-testid="hover-hold-edit"
          fill="rgba(80, 130, 220, 0.55)"
          style={{ cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        />
        <path
          d={deletePath}
          data-testid="hover-hold-delete"
          fill="rgba(200, 60, 60, 0.55)"
          style={{ cursor: "pointer" }}
          onClick={(e) => {
            e.stopPropagation();
            onRequestDelete();
          }}
        />
        <text
          x={editX}
          y={editY}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={20}
          fill="#fff"
          pointerEvents="none"
        >
          ✏️
        </text>
        <text
          x={deleteX}
          y={deleteY}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={20}
          fill="#fff"
          pointerEvents="none"
        >
          🗑️
        </text>
      </g>
    );
  }

  // confirming: ✓ verde (esquerda, confirmar) / ✕ vermelho (direita, cancelar)
  const yesAngle = startAngle + (endAngle - startAngle) * 0.3;
  const noAngle = startAngle + (endAngle - startAngle) * 0.7;
  const yesX = cx + labelR * Math.cos(yesAngle);
  const yesY = cy + labelR * Math.sin(yesAngle);
  const noX = cx + labelR * Math.cos(noAngle);
  const noY = cy + labelR * Math.sin(noAngle);
  const slicePath = arcPath({ cx, cy, innerR, outerR, startAngle, endAngle });

  return (
    <g data-testid="hover-hold-confirm">
      <path d={slicePath} fill="rgba(20, 25, 40, 0.55)" pointerEvents="none" />
      <g
        data-testid="hover-hold-confirm-yes"
        aria-label={t("donut.hoverHold.yes")}
        role="button"
        style={{ cursor: "pointer" }}
        onClick={(e) => {
          e.stopPropagation();
          onConfirmDelete();
        }}
      >
        <circle cx={yesX} cy={yesY} r={20} fill="#c8382b" />
        <text
          x={yesX}
          y={yesY + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={20}
          pointerEvents="none"
        >
          🗑️
        </text>
      </g>
      <g
        data-testid="hover-hold-confirm-no"
        aria-label={t("donut.hoverHold.no")}
        role="button"
        style={{ cursor: "pointer" }}
        onClick={(e) => {
          e.stopPropagation();
          onCancelConfirm();
        }}
      >
        <circle cx={noX} cy={noY} r={18} fill="#5a5f6e" />
        <text
          x={noX}
          y={noY}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={18}
          fontWeight={700}
          fill="#fff"
          pointerEvents="none"
        >
          ✕
        </text>
      </g>
    </g>
  );
};
