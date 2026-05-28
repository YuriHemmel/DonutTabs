import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Tab } from "../core/types/Tab";
import { searchTabs } from "./searchTabs";
import { findTabByPath } from "./findTab";
import { IconRenderer } from "./IconRenderer";
import { isGroup, tabInitial } from "./tabUtils";

export interface TabSearchOverlayProps {
  tabs: Tab[];
  onSelect: (tabId: string) => void;
  onClose: () => void;
}

export const TabSearchOverlay: React.FC<TabSearchOverlayProps> = ({
  tabs,
  onSelect,
  onClose,
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Ids dos grupos drillados (mais externo primeiro), NÃO snapshots de Tab.
  // Re-resolvemos a árvore em todo render via `findTabByPath` pra que uma
  // mudança em `tabs` (config-changed após edição em Settings) reflita na
  // hora: rename de grupo, child novo/removido e delete do grupo drillado.
  // Espelha o padrão de `useRingStack`.
  const [path, setPath] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const resolved = useMemo(() => findTabByPath(tabs, path), [tabs, path]);
  const currentTabs = resolved.tabs;

  // Se o path ficou órfão (grupo drillado foi deletado/virou leaf em outra
  // janela), reseta pra raiz silenciosamente — mesmo comportamento de
  // `useRingStack`.
  useEffect(() => {
    if (!resolved.valid && path.length > 0) {
      setPath([]);
      setQuery("");
      setSelectedIndex(0);
    }
  }, [resolved.valid, path.length]);

  // Labels do breadcrumb resolvidos contra a árvore atual (não snapshots),
  // pra que renames apareçam na hora. Trunca no primeiro id que sumir.
  const crumbs = useMemo<{ id: string; label: string }[]>(() => {
    const out: { id: string; label: string }[] = [];
    for (let i = 0; i < path.length; i++) {
      const parent = findTabByPath(tabs, path.slice(0, i));
      if (!parent.valid) break;
      const node = parent.tabs.find((tab) => tab.id === path[i]);
      if (!node) break;
      out.push({ id: node.id, label: node.name ?? node.icon ?? node.id });
    }
    return out;
  }, [tabs, path]);

  const filtered = useMemo(
    () => searchTabs(currentTabs, query),
    [currentTabs, query],
  );

  // Reset selection when results change.
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, path]);

  // Auto-focus the input on mount and on level change.
  useEffect(() => {
    inputRef.current?.focus();
  }, [path]);

  // Keep selected row visible inside the scroll container. JSDOM doesn't
  // implement `scrollIntoView`, so guard the call to avoid breaking tests.
  useEffect(() => {
    if (!listRef.current) return;
    const node = listRef.current.querySelector<HTMLElement>(
      `[data-testid="search-row-${selectedIndex}"]`,
    );
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, filtered.length]);

  const drillInto = (groupId: string) => {
    setPath((p) => [...p, groupId]);
    setQuery("");
    setSelectedIndex(0);
  };

  const handlePick = (tab: Tab) => {
    if (isGroup(tab)) {
      drillInto(tab.id);
    } else {
      onSelect(tab.id);
    }
  };

  const jumpTo = (index: number) => {
    setPath((p) => (index < 0 ? [] : p.slice(0, index + 1)));
    setQuery("");
    setSelectedIndex(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (path.length > 0) {
        setPath((p) => p.slice(0, -1));
        setQuery("");
        setSelectedIndex(0);
      } else {
        onClose();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (filtered.length === 0) return;
      setSelectedIndex((i) => (i + 1) % filtered.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (filtered.length === 0) return;
      setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const tab = filtered[selectedIndex];
      if (tab) handlePick(tab);
    }
  };

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1100,
  };
  const dialogStyle: React.CSSProperties = {
    background: "#1b2436",
    color: "#eaeaea",
    border: "1px solid #3a4968",
    borderRadius: 8,
    padding: 12,
    width: "min(440px, 90vw)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
    fontSize: 13,
  };
  const breadcrumbStyle: React.CSSProperties = {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 4,
    color: "#9aa6bf",
    fontSize: 12,
  };
  const crumbButtonStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: "#9aa6bf",
    cursor: "pointer",
    padding: "2px 4px",
    borderRadius: 3,
    font: "inherit",
  };
  const crumbCurrentStyle: React.CSSProperties = {
    color: "#eaeaea",
    padding: "2px 4px",
  };
  const crumbSepStyle: React.CSSProperties = {
    color: "#5a6582",
  };

  return (
    <div
      data-testid="search-overlay"
      style={overlayStyle}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
      aria-label={t("donut.search.placeholder")}
    >
      <div style={dialogStyle}>
        {crumbs.length > 0 && (
          <div data-testid="search-breadcrumb" style={breadcrumbStyle}>
            <button
              type="button"
              data-testid="search-breadcrumb-root"
              style={crumbButtonStyle}
              onClick={() => jumpTo(-1)}
            >
              {t("donut.search.breadcrumbRoot")}
            </button>
            {crumbs.map((crumb, i) => {
              const isLast = i === crumbs.length - 1;
              const label = crumb.label;
              return (
                <React.Fragment key={crumb.id}>
                  <span style={crumbSepStyle} aria-hidden>
                    /
                  </span>
                  {isLast ? (
                    <span
                      data-testid={`search-breadcrumb-${i}`}
                      style={crumbCurrentStyle}
                    >
                      {label}
                    </span>
                  ) : (
                    <button
                      type="button"
                      data-testid={`search-breadcrumb-${i}`}
                      style={crumbButtonStyle}
                      onClick={() => jumpTo(i)}
                    >
                      {label}
                    </button>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
        <input
          ref={inputRef}
          data-testid="search-input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("donut.search.placeholder")}
          aria-label={t("donut.search.placeholder")}
          style={{
            background: "#0e1422",
            color: "#eaeaea",
            border: "1px solid #3a4968",
            borderRadius: 4,
            padding: "8px 10px",
            font: "inherit",
            outline: "none",
          }}
        />
        <div
          ref={listRef}
          role="listbox"
          data-testid="search-list"
          style={{
            display: "flex",
            flexDirection: "column",
            maxHeight: 280,
            overflow: "auto",
          }}
        >
          {filtered.length === 0 ? (
            <div
              data-testid="search-empty"
              style={{ padding: "10px 8px", color: "#9aa6bf", fontStyle: "italic" }}
            >
              {t("donut.search.empty")}
            </div>
          ) : (
            filtered.map((tab, i) => {
              const isSelected = i === selectedIndex;
              const tabIsGroup = isGroup(tab);
              return (
                <div
                  key={tab.id}
                  role="option"
                  aria-selected={isSelected}
                  data-testid={`search-row-${i}`}
                  onMouseEnter={() => setSelectedIndex(i)}
                  onClick={() => handlePick(tab)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "6px 8px",
                    borderRadius: 4,
                    background: isSelected ? "#2a3b5a" : "transparent",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  <svg width={22} height={22} viewBox="-11 -11 22 22" aria-hidden>
                    <IconRenderer
                      icon={tab.icon}
                      fallback={tabInitial(tab.name)}
                      size={18}
                    />
                  </svg>
                  <span style={{ flex: 1 }}>{tab.name ?? tab.icon ?? tab.id}</span>
                  {tabIsGroup && (
                    <span
                      data-testid={`search-row-group-badge-${i}`}
                      title={t("donut.search.groupBadgeTitle")}
                      aria-label={t("donut.search.groupBadgeTitle")}
                      style={{ color: "#9aa6bf", fontSize: 14 }}
                    >
                      ▶
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
        <small style={{ color: "#9aa6bf", textAlign: "right" }}>
          {t("donut.search.shortcutHint")}
        </small>
      </div>
    </div>
  );
};
