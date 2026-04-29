import React from "react";
import { useTranslation } from "react-i18next";
import type { Tab } from "../core/types/Tab";
import { useDragReorder } from "./useDragReorder";

export interface TabListProps {
  tabs: Tab[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onReorder: (orderedIds: string[]) => void;
}

export const TabList: React.FC<TabListProps> = ({
  tabs,
  selectedId,
  onSelect,
  onAdd,
  onReorder,
}) => {
  const { t } = useTranslation();
  const ordered = [...tabs].sort((a, b) => a.order - b.order);
  const { getItemProps } = useDragReorder({ items: ordered, onReorder });

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
        data-testid="tab-add"
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
            const dnd = getItemProps(tab.id);
            const dropAbove = dnd["data-drop-target"] === "above";
            const dropBelow = dnd["data-drop-target"] === "below";
            return (
              <li
                key={tab.id}
                data-testid="tab-row-li"
                data-dragging={dnd["data-dragging"] ? "true" : undefined}
                data-drop-target={dnd["data-drop-target"] ?? undefined}
                draggable={dnd.draggable}
                onDragStart={dnd.onDragStart}
                onDragOver={dnd.onDragOver}
                onDrop={dnd.onDrop}
                onDragEnd={dnd.onDragEnd}
                style={{
                  opacity: dnd["data-dragging"] ? 0.5 : 1,
                  boxShadow: dropAbove
                    ? "inset 0 2px 0 var(--accent-bg)"
                    : dropBelow
                      ? "inset 0 -2px 0 var(--accent-bg)"
                      : "none",
                  borderRadius: 6,
                }}
              >
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
                  <span style={{ width: 20, textAlign: "center" }}>
                    {tab.icon ?? "•"}
                  </span>
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
                  {tab.kind === "group" && (
                    <span
                      data-testid="tab-row-group-badge"
                      title={t("settings.tree.groupBadge")}
                      style={{ color: "var(--muted)", fontSize: 11 }}
                    >
                      ▶ {t("settings.tree.childCount", {
                        count: tab.children?.length ?? 0,
                      })}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
};
