import React from "react";
import { useTranslation } from "react-i18next";
import type { Tab } from "../core/types/Tab";

export interface TabListProps {
  tabs: Tab[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
}

export const TabList: React.FC<TabListProps> = ({ tabs, selectedId, onSelect, onAdd }) => {
  const { t } = useTranslation();
  const ordered = [...tabs].sort((a, b) => a.order - b.order);

  return (
    <aside
      style={{
        width: 260,
        borderRight: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 12,
        background: "var(--panel)",
      }}
    >
      <header
        style={{
          fontSize: 13,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {t("settings.tabs.sectionTitle")}
      </header>
      <button
        type="button"
        onClick={onAdd}
        style={{
          background: "var(--hover-bg)",
          color: "var(--fg)",
          border: "1px solid var(--ghost-border)",
          borderRadius: 6,
          padding: "8px 10px",
          cursor: "pointer",
          font: "inherit",
          textAlign: "left",
        }}
      >
        + {t("settings.tabs.addTab")}
      </button>

      {ordered.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.4 }}>
          {t("settings.tabs.empty")}
        </p>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {ordered.map((tab) => {
            const selected = tab.id === selectedId;
            const label = tab.name ?? tab.icon ?? tab.id.slice(0, 6);
            return (
              <li key={tab.id}>
                <button
                  type="button"
                  data-testid="tab-row"
                  data-selected={selected ? "true" : "false"}
                  onClick={() => onSelect(tab.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    background: selected ? "var(--selected-bg)" : "transparent",
                    color: "var(--fg)",
                    border:
                      "1px solid " +
                      (selected ? "var(--selected-border)" : "transparent"),
                    borderRadius: 6,
                    padding: "8px 10px",
                    cursor: "pointer",
                    font: "inherit",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ width: 20, textAlign: "center" }}>{tab.icon ?? "•"}</span>
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
};
