import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Profile } from "../core/types/Profile";
import type { Tab } from "../core/types/Tab";
import { paginate, type Page } from "../donut/pagination";
import {
  moveInOrder,
  swapInOrder,
  pageStartIndices,
} from "../donut/pageBoundaries";
import { pointToSliceIndex } from "../donut/geometry";
import { resolveThemeTokens } from "../core/themeTokens";
import { IconDisplay } from "./IconDisplay";
import { OrgDonut } from "./OrgDonut";

export interface OrganizationSectionProps {
  profile: Profile;
  /** Global `pagination.itemsPerPage` (4–8). */
  itemsPerPage: number;
  onSetItemsPerPage: (itemsPerPage: number) => void;
  onReorderTabs: (
    profileId: string,
    orderedIds: string[],
    parentPath?: string[],
  ) => void;
  /** Issue #109 — move uma aba pra outro nível (drop na fatia "+" de outro
   *  ring → append no fim do nível de destino). */
  onMoveTab: (
    tabId: string,
    fromParentPath: string[],
    toParentPath: string[],
    destIndex?: number,
  ) => void;
  /** Issue #109 — troca duas abas de nível (drop SOBRE uma aba de outro ring →
   *  X e Y trocam de lugar/nível). */
  onSwapTabs: (
    aId: string,
    aParentPath: string[],
    bId: string,
    bParentPath: string[],
  ) => void;
}

interface RingModel {
  key: string;
  parentPath: string[];
  /** Cabeçalho (nome do grupo) — `null` no ring raiz. */
  groupTab: Tab | null;
  orderedTabs: Tab[];
  pages: Page[];
}

interface DonutMeta {
  ringKey: string;
  parentPath: string[];
  pageIndex: number;
  orderedTabs: Tab[];
  pageTabsLength: number;
  total: number;
  innerRatio: number;
  outerRatio: number;
}

const sortByOrder = (tabs: Tab[]): Tab[] =>
  [...tabs].sort((a, b) => a.order - b.order);

const donutKey = (ringKey: string, pageIndex: number): string =>
  `${ringKey}#${pageIndex}`;

const IPP_MIN = 4;
const IPP_MAX = 8;
/** Tamanho (px) de cada mini-donut nesta página — maior que o preview do
 *  ThemeCustomizer pra facilitar o drag preciso das fatias. */
const DONUT_SIZE = 240;

export const OrganizationSection: React.FC<OrganizationSectionProps> = ({
  profile,
  itemsPerPage,
  onSetItemsPerPage,
  onReorderTabs,
  onMoveTab,
  onSwapTabs,
}) => {
  const { t } = useTranslation();
  const tokens = useMemo(
    () => resolveThemeTokens(profile.theme, profile.themeOverrides),
    [profile.theme, profile.themeOverrides],
  );

  // Ring raiz + um ring por grupo (MAX_TAB_DEPTH = 2, então grupos só no topo).
  const rings = useMemo<RingModel[]>(() => {
    const rootOrdered = sortByOrder(profile.tabs);
    const list: RingModel[] = [
      {
        key: "root",
        parentPath: [],
        groupTab: null,
        orderedTabs: rootOrdered,
        pages: paginate(rootOrdered, itemsPerPage),
      },
    ];
    for (const tab of rootOrdered) {
      if (tab.kind !== "group") continue;
      const childrenOrdered = sortByOrder(tab.children ?? []);
      list.push({
        key: `group:${tab.id}`,
        parentPath: [tab.id],
        groupTab: tab,
        orderedTabs: childrenOrdered,
        pages: paginate(childrenOrdered, itemsPerPage),
      });
    }
    return list;
  }, [profile.tabs, itemsPerPage]);

  // Metadados de cada donut (por chave) pro hit-test do drop. Refs em vez de
  // estado: lidos dentro dos listeners de pointer sem re-subscrever.
  const metaByKey = useMemo(() => {
    const map = new Map<string, DonutMeta>();
    for (const ring of rings) {
      ring.pages.forEach((page, pageIndex) => {
        map.set(donutKey(ring.key, pageIndex), {
          ringKey: ring.key,
          parentPath: ring.parentPath,
          pageIndex,
          orderedTabs: ring.orderedTabs,
          pageTabsLength: page.tabs.length,
          total: page.tabs.length + (page.hasPlus ? 1 : 0),
          innerRatio: tokens.dimensions.innerRatio,
          outerRatio: tokens.dimensions.outerRatio,
        });
      });
    }
    return map;
  }, [rings, tokens]);
  const metaByKeyRef = useRef(metaByKey);
  metaByKeyRef.current = metaByKey;

  const elByKey = useRef(new Map<string, SVGSVGElement>());

  interface DragState {
    ringKey: string;
    parentPath: string[];
    tabId: string;
    orderedIds: string[];
    fromFlatIndex: number;
    label: string;
    icon: string | null;
    /** Issue #109 — grupos só podem ficar na raiz; usado pra bloquear drop
     *  de um grupo dentro de outro ring. */
    isGroup: boolean;
  }
  const [drag, setDrag] = useState<DragState | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<{ donutKey: string; slot: number } | null>(
    null,
  );

  const hitTest = useCallback(
    (
      clientX: number,
      clientY: number,
    ): { donutKey: string; slot: number } | null => {
      // Issue #109 — sem filtro de ring: qualquer donut (raiz ou grupo) é alvo
      // de drop, habilitando mover abas entre níveis. A distinção same-ring
      // (reordenar) vs cross-ring (mover) é feita no `onUp`.
      for (const [key, el] of elByKey.current) {
        const meta = metaByKeyRef.current.get(key);
        if (!meta) continue;
        const rect = el.getBoundingClientRect();
        if (
          clientX < rect.left ||
          clientX > rect.right ||
          clientY < rect.top ||
          clientY > rect.bottom ||
          rect.width === 0
        ) {
          continue;
        }
        const localX = clientX - rect.left - rect.width / 2;
        const localY = clientY - rect.top - rect.height / 2;
        const slot = pointToSliceIndex(
          { x: localX, y: localY },
          meta.total,
          {
            innerRadius: rect.width * meta.innerRatio,
            outerRadius: rect.width * meta.outerRatio,
          },
        );
        if (slot == null) return null;
        return { donutKey: key, slot };
      }
      return null;
    },
    [],
  );

  /** Página (offset achatado) onde o donut `meta` começa no anel. */
  const pageStartFor = useCallback(
    (meta: DonutMeta): number => {
      const starts = pageStartIndices(meta.orderedTabs, itemsPerPage);
      return starts[Math.min(Math.max(0, meta.pageIndex), starts.length - 1)];
    },
    [itemsPerPage],
  );

  // Listeners de pointer enquanto arrasta. `drag` nas deps re-subscreve no
  // início/fim do gesto; durante o arrasto os refs trazem o estado atual.
  useEffect(() => {
    if (!drag) return;
    const isBlockedCrossRing = (meta: DonutMeta): boolean =>
      // Grupo só pode ficar na raiz; ignora drop num sub-ring.
      drag.isGroup && meta.parentPath.length > 0;

    const onMove = (e: PointerEvent) => {
      setGhost({ x: e.clientX, y: e.clientY });
      const target = hitTest(e.clientX, e.clientY);
      // Não destaca um drop bloqueado (grupo num sub-ring).
      if (target) {
        const meta = metaByKeyRef.current.get(target.donutKey);
        if (meta && meta.ringKey !== drag.ringKey && isBlockedCrossRing(meta)) {
          setHover(null);
          return;
        }
      }
      setHover(target);
    };
    const onUp = (e: PointerEvent) => {
      const target = hitTest(e.clientX, e.clientY);
      if (target) {
        const meta = metaByKeyRef.current.get(target.donutKey);
        if (meta && meta.ringKey === drag.ringKey) {
          // Same ring → reordenar (comportamento existente).
          const pageStart = pageStartFor(meta);
          let newIds: string[];
          if (target.slot < meta.pageTabsLength) {
            // Soltou sobre outra aba → troca de lugar (X assume a posição de
            // Y e vice-versa). É o que o usuário espera de "trocar de lugar".
            const targetTabId = drag.orderedIds[pageStart + target.slot];
            newIds = swapInOrder(drag.orderedIds, drag.tabId, targetTabId);
          } else {
            // Soltou na fatia "+" → move pro fim do ring. O "+" só aparece na
            // última página, então o destino é sempre o fim da lista (inclusive
            // quando a contagem é múltipla exata de itemsPerPage e a última
            // página é "só +").
            newIds = moveInOrder(
              drag.orderedIds,
              drag.fromFlatIndex,
              meta.orderedTabs.length,
            );
          }
          // Só persiste se mudou de fato.
          if (newIds.join() !== drag.orderedIds.join()) {
            onReorderTabs(
              profile.id,
              newIds,
              drag.parentPath.length > 0 ? drag.parentPath : undefined,
            );
          }
        } else if (meta && !isBlockedCrossRing(meta)) {
          // Cross ring → entre níveis diferentes (Issue #109).
          if (target.slot < meta.pageTabsLength) {
            // Soltou SOBRE uma aba Y → troca X e Y de lugar/nível (swap).
            const pageStart = pageStartFor(meta);
            const targetTab = meta.orderedTabs[pageStart + target.slot];
            if (targetTab && targetTab.id !== drag.tabId) {
              onSwapTabs(
                drag.tabId,
                drag.parentPath,
                targetTab.id,
                meta.parentPath,
              );
            }
          } else {
            // Soltou na fatia "+" → adiciona X no fim do nível de destino.
            onMoveTab(
              drag.tabId,
              drag.parentPath,
              meta.parentPath,
              meta.orderedTabs.length,
            );
          }
        }
      }
      setDrag(null);
      setGhost(null);
      setHover(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [
    drag,
    hitTest,
    pageStartFor,
    itemsPerPage,
    onReorderTabs,
    onMoveTab,
    onSwapTabs,
    profile.id,
  ]);

  const startDrag = useCallback(
    (ring: RingModel, tabId: string, e: React.PointerEvent) => {
      e.preventDefault();
      const orderedIds = ring.orderedTabs.map((tt) => tt.id);
      const fromFlatIndex = orderedIds.indexOf(tabId);
      if (fromFlatIndex < 0) return;
      const tab = ring.orderedTabs[fromFlatIndex];
      setDrag({
        ringKey: ring.key,
        parentPath: ring.parentPath,
        tabId,
        orderedIds,
        fromFlatIndex,
        label: tab.name ?? tab.icon ?? tab.id.slice(0, 6),
        icon: tab.icon,
        isGroup: tab.kind === "group",
      });
      setGhost({ x: e.clientX, y: e.clientY });
    },
    [],
  );

  const isEmpty = profile.tabs.length === 0;

  return (
    <section
      data-testid="organization-section"
      style={{
        flex: 1,
        overflowY: "auto",
        padding: 20,
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <header style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>
          {t("settings.organization.title")}
        </h2>
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
          {t("settings.organization.crossRingHint")}
        </p>
      </header>

      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <label htmlFor="org-items-per-page" style={{ fontSize: 14 }}>
          {t("settings.organization.itemsPerPageLabel")}
        </label>
        <select
          id="org-items-per-page"
          data-testid="org-items-per-page"
          value={itemsPerPage}
          onChange={(e) => onSetItemsPerPage(Number(e.target.value))}
          style={{
            background: "var(--input-bg)",
            color: "var(--fg)",
            border: "1px solid var(--input-border)",
            borderRadius: 6,
            padding: "4px 8px",
            font: "inherit",
          }}
        >
          {Array.from({ length: IPP_MAX - IPP_MIN + 1 }, (_, i) => IPP_MIN + i).map(
            (n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ),
          )}
        </select>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>
          {t("settings.organization.itemsPerPageHint")}
        </span>
      </div>

      {isEmpty && (
        <p data-testid="org-empty" style={{ color: "var(--muted)", fontSize: 13 }}>
          {t("settings.organization.empty")}
        </p>
      )}

      {rings.map((ring) => (
        <div
          key={ring.key}
          data-testid={`org-ring-${ring.key}`}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          {ring.groupTab && (
            <div
              data-testid={`org-group-header-${ring.groupTab.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "var(--muted)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <IconDisplay icon={ring.groupTab.icon} fallback="▶" size={16} />
              {t("settings.organization.groupLabel", {
                name: ring.groupTab.name ?? ring.groupTab.id.slice(0, 6),
              })}
            </div>
          )}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 20,
            }}
          >
            {ring.pages.map((page, pageIndex) => {
              const key = donutKey(ring.key, pageIndex);
              const isHoverHere = hover?.donutKey === key;
              return (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <OrgDonut
                    data-testid={`org-donut-${ring.key}-${pageIndex}`}
                    tabs={page.tabs}
                    hasPlus={page.hasPlus}
                    tokens={tokens}
                    size={DONUT_SIZE}
                    draggingTabId={drag?.ringKey === ring.key ? drag.tabId : null}
                    highlightSlot={isHoverHere ? hover.slot : null}
                    onSlicePointerDown={(tabId, _slot, e) =>
                      startDrag(ring, tabId, e)
                    }
                    svgRef={(el) => {
                      if (el) elByKey.current.set(key, el);
                      else elByKey.current.delete(key);
                    }}
                  />
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>
                    {t("settings.organization.pageLabel", {
                      n: pageIndex + 1,
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {drag && ghost && (
        <div
          style={{
            position: "fixed",
            left: ghost.x + 12,
            top: ghost.y + 12,
            pointerEvents: "none",
            zIndex: 1000,
            background: "var(--panel)",
            border: "1px solid var(--selected-border)",
            borderRadius: 6,
            padding: "4px 8px",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          }}
        >
          <IconDisplay icon={drag.icon} fallback="•" size={16} />
          {drag.label}
        </div>
      )}
    </section>
  );
};
