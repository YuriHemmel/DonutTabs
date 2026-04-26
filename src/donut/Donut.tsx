import React, { useEffect, useMemo, useState } from "react";
import type { Tab } from "../core/types/Tab";
import type { Profile } from "../core/types/Profile";
import type { SettingsIntent } from "../core/ipc";
import { Slice } from "./Slice";
import { CenterCircle } from "./CenterCircle";
import { PaginationDots } from "./PaginationDots";
import { HoverHoldOverlay } from "./HoverHoldOverlay";
import { ProfileSwitcher } from "./ProfileSwitcher";
import { sliceAngleRange } from "./geometry";
import { paginate } from "./pagination";
import { useSliceHighlight } from "./useSliceHighlight";
import { useHoverHold } from "./useHoverHold";

export interface DonutProps {
  tabs: Tab[];
  size: number;
  itemsPerPage: number;
  wheelDirection: "standard" | "inverted";
  hoverHoldMs?: number;
  onSelect: (tabId: string) => void;
  onOpenSettings?: (intent?: SettingsIntent) => void;
  onEditTab?: (tabId: string) => void;
  onDeleteTab?: (tabId: string) => void;
  /** Lista de perfis (necessária para o switcher). Se ausente, switcher é
   *  desativado. */
  profiles?: Profile[];
  activeProfileId?: string;
  onSelectProfile?: (profileId: string) => void;
  onCreateProfile?: () => void;
}

const PLUS_KEY = "__plus__";

export const Donut: React.FC<DonutProps> = ({
  tabs,
  size,
  itemsPerPage,
  wheelDirection,
  hoverHoldMs = 800,
  onSelect,
  onOpenSettings,
  onEditTab,
  onDeleteTab,
  profiles,
  activeProfileId,
  onSelectProfile,
  onCreateProfile,
}) => {
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.46;
  const innerR = size * 0.22;

  const [mode, setMode] = useState<"tabs" | "profiles">("tabs");
  const switcherEnabled = !!(profiles && activeProfileId && onSelectProfile);

  // ESC sai do modo perfil quando estiver lá.
  useEffect(() => {
    if (mode !== "profiles") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setMode("tabs");
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [mode]);

  const ordered = useMemo(() => [...tabs].sort((a, b) => a.order - b.order), [tabs]);
  const pages = useMemo(() => paginate(ordered, itemsPerPage), [ordered, itemsPerPage]);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (page >= pages.length) setPage(Math.max(0, pages.length - 1));
  }, [pages.length, page]);

  const safePage = Math.min(page, pages.length - 1);
  const current = pages[safePage] ?? { tabs: [], hasPlus: true };
  const sliceCount = current.tabs.length + (current.hasPlus ? 1 : 0);
  const plusIndex = current.hasPlus ? current.tabs.length : -1;

  const { highlighted, onMouseMove, onMouseLeave } = useSliceHighlight({
    center: { x: cx, y: cy },
    slices: sliceCount,
    innerRadius: innerR,
    outerRadius: outerR,
  });

  const isTabSlice = (i: number) => i >= 0 && i < current.tabs.length;

  const hoverHold = useHoverHold({
    hoveredSlice: highlighted,
    isTabSlice,
    holdMs: hoverHoldMs,
    onComplete: () => {
      // visual feedback only — actions são disparadas via overlay
    },
  });

  // ESC durante actionable/confirming → cancela o gesto
  useEffect(() => {
    const phase = hoverHold.state.phase;
    if (phase !== "actionable" && phase !== "confirming") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        hoverHold.cancel();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [hoverHold.state.phase, hoverHold]);

  const changePage = (next: number) => {
    setPage((p) => {
      const clamped = Math.max(0, Math.min(pages.length - 1, next));
      // Mudou de página: o sliceIndex do hover-hold passa a referenciar outra
      // aba. Resetar evita disparar edit/delete no alvo errado.
      if (clamped !== p && hoverHold.state.phase !== "idle") {
        hoverHold.reset();
      }
      return clamped;
    });
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    if (pages.length <= 1) return;
    const direction = wheelDirection === "inverted" ? -1 : 1;
    const delta = e.deltaY > 0 ? 1 : -1;
    changePage(safePage + delta * direction);
  };

  const activeSliceIndex =
    hoverHold.state.phase === "idle" ? -1 : hoverHold.state.sliceIndex;
  const activeTab =
    activeSliceIndex >= 0 ? current.tabs[activeSliceIndex] : null;

  if (mode === "profiles" && profiles && activeProfileId && onSelectProfile) {
    return (
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        <ProfileSwitcher
          cx={cx}
          cy={cy}
          innerR={innerR}
          outerR={outerR}
          profiles={profiles}
          activeProfileId={activeProfileId}
          onSelect={(id) => {
            setMode("tabs");
            onSelectProfile(id);
          }}
          onCreate={() => {
            setMode("tabs");
            onCreateProfile?.();
          }}
        />
        <CenterCircle
          cx={cx}
          cy={cy}
          r={innerR * 0.85}
          onGearClick={onOpenSettings}
          onProfileSwitcherClick={() => setMode("tabs")}
        />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      onWheel={handleWheel}
    >
      {current.tabs.map((tab, i) => {
        const { start, end } = sliceAngleRange(i, sliceCount);
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
            onClick={() => {
              // Se está em modo ação para esta fatia, clique não dispara select
              // (o overlay tem seus próprios click handlers).
              const phase = hoverHold.state.phase;
              if (
                (phase === "actionable" || phase === "confirming") &&
                hoverHold.state.sliceIndex === i
              ) {
                return;
              }
              onSelect(tab.id);
            }}
          />
        );
      })}
      {current.hasPlus &&
        (() => {
          const { start, end } = sliceAngleRange(plusIndex, sliceCount);
          return (
            <Slice
              key={PLUS_KEY}
              cx={cx}
              cy={cy}
              innerR={innerR}
              outerR={outerR}
              startAngle={start}
              endAngle={end}
              icon="+"
              highlighted={highlighted === plusIndex}
              onClick={() => onOpenSettings?.("new-tab")}
            />
          );
        })()}
      {activeTab &&
        (() => {
          const { start, end } = sliceAngleRange(activeSliceIndex, sliceCount);
          return (
            <HoverHoldOverlay
              cx={cx}
              cy={cy}
              innerR={innerR}
              outerR={outerR}
              startAngle={start}
              endAngle={end}
              state={hoverHold.state}
              onEdit={() => {
                hoverHold.cancel();
                onEditTab?.(activeTab.id);
              }}
              onRequestDelete={hoverHold.requestDelete}
              onConfirmDelete={() => {
                const id = activeTab.id;
                hoverHold.confirmDelete();
                onDeleteTab?.(id);
              }}
              onCancelConfirm={hoverHold.cancel}
            />
          );
        })()}
      <CenterCircle
        cx={cx}
        cy={cy}
        r={innerR * 0.85}
        onGearClick={onOpenSettings}
        onProfileSwitcherClick={
          switcherEnabled ? () => setMode("profiles") : undefined
        }
      />
      <PaginationDots
        total={pages.length}
        active={safePage}
        cx={cx}
        cy={size * 0.94}
        onChange={changePage}
      />
    </svg>
  );
};
