import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { IconRenderer } from "./IconRenderer";
import { useFavicon } from "./useFavicon";
import { SliceContextMenu } from "./SliceContextMenu";
import { TabSearchOverlay } from "./TabSearchOverlay";
import { matchesCombo } from "./matchesCombo";
import { tabInitial } from "./tabUtils";
import { ThemeContext } from "./themeContext";
import { resolvePresetTokens, type ThemeTokens } from "../core/themeTokens";
import { useDonutNavigation } from "./useDonutNavigation";
import { Breadcrumb } from "./Breadcrumb";

function firstTabUrl(tab: Tab): string | null {
  for (const item of tab.items) {
    if (item.kind === "url") return item.value;
  }
  return null;
}

/** Conta total de descendentes (children + grandchildren ...). */
export function countDescendants(tab: Tab): number {
  // Backend serializa `children` com `skip_serializing_if = "Vec::is_empty"`,
  // então leaves chegam aqui com `children === undefined` mesmo sendo `Tab[]`
  // no tipo ts-rs. `?? []` protege a iteração.
  const kids = tab.children ?? [];
  let n = 0;
  for (const c of kids) {
    n += 1 + countDescendants(c);
  }
  return n;
}

const isGroup = (tab: Tab): boolean => tab.kind === "group";

interface TabSliceProps {
  tab: Tab;
  cx: number; cy: number;
  innerR: number; outerR: number;
  startAngle: number; endAngle: number;
  highlighted: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent<SVGGElement>) => void;
}

const TabSlice: React.FC<TabSliceProps> = ({ tab, ...rest }) => {
  const fallback = tabInitial(tab.name);
  const useFav = !tab.icon && !isGroup(tab);
  const fav = useFavicon(useFav ? firstTabUrl(tab) : null);
  const iconString = tab.icon ?? fav.src ?? null;
  // Plano 16 — group ganha badge ▶ no canto inferior do slice. Posição
  // próxima à borda externa pra não competir com o ícone/label central.
  const groupBadge = isGroup(tab);
  const mid = (rest.startAngle + rest.endAngle) / 2;
  const badgeR = (rest.innerR + rest.outerR) / 2 + (rest.outerR - rest.innerR) * 0.30;
  const bx = rest.cx + badgeR * Math.cos(mid);
  const by = rest.cy + badgeR * Math.sin(mid);
  return (
    <>
      <Slice
        {...rest}
        label={tab.name ?? undefined}
        iconNode={<IconRenderer icon={iconString} fallback={fallback} />}
      />
      {groupBadge && (
        <text
          data-testid="group-badge"
          x={bx}
          y={by}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={10}
          fill="var(--donut-text, #eaeaea)"
          opacity={0.65}
          pointerEvents="none"
        >
          ▶
        </text>
      )}
    </>
  );
};

export interface DonutProps {
  tabs: Tab[];
  size: number;
  itemsPerPage: number;
  wheelDirection: "standard" | "inverted";
  hoverHoldMs?: number;
  /** Combo Tauri-style (`CommandOrControl+F`) que abre o overlay de busca
   *  rápida das abas do perfil ativo. Quando ausente, o overlay fica
   *  desabilitado. */
  searchShortcut?: string;
  /** Plano 15 — tokens visuais resolvidos (preset + overrides do perfil
   *  ativo). Quando ausente, default = preset dark. Os ratios internos
   *  controlam o raio interno/externo do donut. */
  tokens?: ThemeTokens;
  onSelect: (tabId: string) => void;
  onOpenSettings?: (intent?: SettingsIntent) => void;
  onEditTab?: (tabId: string) => void;
  /** Plano 16 — `parentPath` é o caminho de grupos pra chegar até a aba.
   *  Vazio = root. Cascading delete é responsabilidade do backend. */
  onDeleteTab?: (tabId: string, parentPath: string[]) => void;
  /** Lista de perfis (necessária para o switcher). Se ausente, switcher é
   *  desativado. */
  profiles?: Profile[];
  activeProfileId?: string;
  onSelectProfile?: (profileId: string) => void;
  onCreateProfile?: () => void;
}

const PLUS_KEY = "__plus__";

const DEFAULT_TOKENS: ThemeTokens = resolvePresetTokens("dark");

export const Donut: React.FC<DonutProps> = ({
  tabs,
  size,
  itemsPerPage,
  wheelDirection,
  hoverHoldMs = 1200,
  searchShortcut,
  tokens,
  onSelect,
  onOpenSettings,
  onEditTab,
  onDeleteTab,
  profiles,
  activeProfileId,
  onSelectProfile,
  onCreateProfile,
}) => {
  const effectiveTokens = tokens ?? DEFAULT_TOKENS;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * effectiveTokens.dimensions.outerRatio;
  const innerR = size * effectiveTokens.dimensions.innerRatio;

  const { t } = useTranslation();
  const [mode, setMode] = useState<"tabs" | "profiles">("tabs");
  const switcherEnabled = !!(profiles && activeProfileId && onSelectProfile);
  const [contextMenu, setContextMenu] = useState<
    | { x: number; y: number; tabId: string; tabLabel: string }
    | null
  >(null);
  const [searchOpen, setSearchOpen] = useState(false);

  // Atalho window-level pra abrir o overlay de busca. Suprimido quando
  // donut está em modo perfil ou com context menu aberto.
  useEffect(() => {
    if (!searchShortcut) return;
    const onKey = (e: KeyboardEvent) => {
      if (mode !== "tabs" || contextMenu || searchOpen) return;
      if (matchesCombo(e, searchShortcut)) {
        e.preventDefault();
        e.stopPropagation();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [mode, contextMenu, searchOpen, searchShortcut]);

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

  const navigation = useDonutNavigation(tabs);
  const ordered = useMemo(
    () => [...navigation.currentTabs].sort((a, b) => a.order - b.order),
    [navigation.currentTabs],
  );
  const pages = useMemo(() => paginate(ordered, itemsPerPage), [ordered, itemsPerPage]);
  const [page, setPage] = useState(0);

  // Mudou de nível: reseta paginação para começar na primeira página.
  useEffect(() => {
    setPage(0);
  }, [navigation.path.length]);

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
    // While a context menu is open, lock the hover-hold gesture so the
    // overlay doesn't fight the menu for the same slice.
    hoveredSlice: contextMenu || searchOpen ? null : highlighted,
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

  // Plano 16 — ESC dentro de sub-donut volta um nível em vez de fechar o
  // donut. Suprimido se overlay/menu já lidou com Esc, ou se hover-hold está
  // em fase de ação (handler acima cuida).
  useEffect(() => {
    if (mode !== "tabs" || navigation.path.length === 0) return;
    const phase = hoverHold.state.phase;
    if (phase === "actionable" || phase === "confirming") return;
    const onKey = (e: KeyboardEvent) => {
      if (contextMenu || searchOpen) return;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        navigation.back();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [mode, navigation, contextMenu, searchOpen, hoverHold.state.phase]);

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
    if (searchOpen) return;
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
      <ThemeContext.Provider value={effectiveTokens}>
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
      </ThemeContext.Provider>
    );
  }

  return (
    <ThemeContext.Provider value={effectiveTokens}>
    <>
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
          <TabSlice
            key={tab.id}
            tab={tab}
            cx={cx}
            cy={cy}
            innerR={innerR}
            outerR={outerR}
            startAngle={start}
            endAngle={end}
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
              if (isGroup(tab)) {
                navigation.enter(tab.id);
              } else {
                onSelect(tab.id);
              }
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              hoverHold.reset();
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                tabId: tab.id,
                tabLabel: tab.name ?? tab.icon ?? tab.id,
              });
            }}
          />
        );
      })}
      {current.hasPlus &&
        (() => {
          const { start, end } = sliceAngleRange(plusIndex, sliceCount);
          // Em sub-donut, intent leva o caminho até o group atual; root mantém
          // o intent simples "new-tab".
          const intent: SettingsIntent =
            navigation.path.length === 0
              ? "new-tab"
              : (`new-tab-in-group:${navigation.path.join(",")}` as SettingsIntent);
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
              onClick={() => onOpenSettings?.(intent)}
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
              onRequestDelete={() => {
                // Plano 16 — group: jump direto pra confirm com count via
                // window.confirm; salta a fase ✓✕ inline (que é genérica e
                // não comunica cascading).
                if (isGroup(activeTab)) {
                  hoverHold.cancel();
                  const count = countDescendants(activeTab);
                  const ok = window.confirm(
                    t("donut.confirmCascadeDelete", {
                      label: activeTab.name ?? activeTab.icon ?? activeTab.id,
                      count,
                    }),
                  );
                  if (ok) onDeleteTab?.(activeTab.id, navigation.path);
                  return;
                }
                hoverHold.requestDelete();
              }}
              onConfirmDelete={() => {
                const id = activeTab.id;
                hoverHold.confirmDelete();
                onDeleteTab?.(id, navigation.path);
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
          // Em sub-donut, a metade direita do centro vira "voltar"; switcher
          // de perfis fica disponível só no root.
          navigation.path.length > 0
            ? () => navigation.back()
            : switcherEnabled
              ? () => setMode("profiles")
              : undefined
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
    {contextMenu && (
      <SliceContextMenu
        position={{ x: contextMenu.x, y: contextMenu.y }}
        onClose={() => setContextMenu(null)}
        items={[
          {
            id: "open-all",
            label: t("donut.contextMenu.openAll"),
            onSelect: () => onSelect(contextMenu.tabId),
          },
          {
            id: "edit",
            label: t("donut.contextMenu.edit"),
            onSelect: () => onEditTab?.(contextMenu.tabId),
          },
          {
            id: "delete",
            label: t("donut.contextMenu.delete"),
            variant: "danger",
            onSelect: () => {
              // Plano 16 — delete em group via context menu mostra
              // cascade-confirm com count, igual ao hover-hold; assim
              // os dois caminhos avisam sobre a remoção dos descendentes.
              const tab = current.tabs.find((tt) => tt.id === contextMenu.tabId);
              const tabIsGroup = tab ? isGroup(tab) : false;
              const promptKey = tabIsGroup
                ? "donut.confirmCascadeDelete"
                : "donut.contextMenu.confirmDelete";
              const promptVars = tabIsGroup
                ? {
                    label: contextMenu.tabLabel,
                    count: tab ? countDescendants(tab) : 0,
                  }
                : { label: contextMenu.tabLabel };
              const ok = window.confirm(t(promptKey, promptVars));
              if (ok) onDeleteTab?.(contextMenu.tabId, navigation.path);
            },
          },
        ]}
      />
    )}
    {searchOpen && (
      <TabSearchOverlay
        tabs={ordered}
        onClose={() => setSearchOpen(false)}
        onSelect={(tabId) => {
          setSearchOpen(false);
          onSelect(tabId);
        }}
      />
    )}
    <Breadcrumb
      segments={navigation.path.map((id) => labelForPathSegment(tabs, navigation.path, id))}
      onJumpTo={(idx) => navigation.jumpTo(idx)}
    />
    </>
    </ThemeContext.Provider>
  );
};

/**
 * Resolve o label de exibição de cada segmento do path. Caminha em `tabs`
 * seguindo a ordem do path completo até bater no `targetId`.
 */
function labelForPathSegment(
  rootTabs: Tab[],
  fullPath: string[],
  targetId: string,
): string {
  let current = rootTabs;
  for (const id of fullPath) {
    const found = current.find((t) => t.id === id);
    if (!found) return targetId;
    if (id === targetId) return found.name ?? found.icon ?? targetId;
    current = found.children ?? [];
  }
  return targetId;
}
