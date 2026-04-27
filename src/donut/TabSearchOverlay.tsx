import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Tab } from "../core/types/Tab";
import { searchTabs } from "./searchTabs";
import { IconRenderer } from "./IconRenderer";
import { tabInitial } from "./tabUtils";

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
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => searchTabs(tabs, query), [tabs, query]);

  // Reset selection when results change.
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Auto-focus the input on mount.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
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
      if (tab) onSelect(tab.id);
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
              return (
                <div
                  key={tab.id}
                  role="option"
                  aria-selected={isSelected}
                  data-testid={`search-row-${i}`}
                  onMouseEnter={() => setSelectedIndex(i)}
                  onClick={() => onSelect(tab.id)}
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
