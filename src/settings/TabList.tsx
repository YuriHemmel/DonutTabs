import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Tab } from "../core/types/Tab";
import { useDragReorder } from "./useDragReorder";
import { IconDisplay } from "./IconDisplay";

export interface TabListProps {
  tabs: Tab[];
  selectedId: string | null;
  onSelect: (id: string, parentPath: string[]) => void;
  onAdd: (parentPath: string[], kind: "leaf" | "group") => void;
  onReorder: (parentPath: string[], orderedIds: string[]) => void;
  /** Issue #60 — limite vindo do schema (`MAX_TAB_DEPTH`). UI esconde
   *  "+ subgrupo" quando o próximo nível atingiria o limite. */
  maxDepth: number;
}

const isGroup = (t: Tab): boolean => t.kind === "group";

type DragProps = ReturnType<ReturnType<typeof useDragReorder>["getItemProps"]>;

interface NodeRowProps {
  tab: Tab;
  parentPath: string[];
  depth: number;
  maxDepth: number;
  selectedId: string | null;
  expanded: Set<string>;
  toggle: (id: string) => void;
  onSelect: (id: string, parentPath: string[]) => void;
  onAdd: (parentPath: string[], kind: "leaf" | "group") => void;
  onReorder: (parentPath: string[], orderedIds: string[]) => void;
  dragProps: DragProps;
}

const NodeRow: React.FC<NodeRowProps> = ({
  tab,
  parentPath,
  depth,
  maxDepth,
  selectedId,
  expanded,
  toggle,
  onSelect,
  onAdd,
  onReorder,
  dragProps: dnd,
}) => {
  const { t } = useTranslation();
  const selected = tab.id === selectedId;
  const isOpen = expanded.has(tab.id);
  const label = tab.name ?? tab.icon ?? tab.id.slice(0, 6);
  const dropAbove = dnd["data-drop-target"] === "above";
  const dropBelow = dnd["data-drop-target"] === "below";
  const indentPx = depth * 16;

  return (
    <li
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          paddingLeft: indentPx,
        }}
      >
        {isGroup(tab) ? (
          <button
            type="button"
            data-testid={`tab-row-caret-${tab.id}`}
            aria-label={isOpen ? "Colapsar" : "Expandir"}
            onClick={(e) => {
              e.stopPropagation();
              toggle(tab.id);
            }}
            style={{
              width: 22,
              height: 22,
              background: "transparent",
              border: 0,
              color: "var(--muted)",
              cursor: "pointer",
              fontSize: 16,
              padding: 0,
              lineHeight: 1,
            }}
          >
            {isOpen ? "▾" : "▸"}
          </button>
        ) : (
          <span style={{ width: 22 }} aria-hidden="true" />
        )}
        <button
          type="button"
          data-testid={`tab-row-${tab.id}`}
          data-selected={selected ? "true" : "false"}
          onClick={() => onSelect(tab.id, parentPath)}
          style={{
            flex: 1,
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
          <span
            style={{
              width: 20,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconDisplay icon={tab.icon} fallback="•" size={16} />
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
          {isGroup(tab) && (
            <span
              data-testid="tab-row-group-badge"
              title={t("settings.tree.groupBadge")}
              style={{ color: "var(--muted)", fontSize: 11 }}
            >
              ▶{" "}
              {t("settings.tree.childCount", {
                count: tab.children?.length ?? 0,
              })}
            </span>
          )}
        </button>
      </div>
      {isOpen && isGroup(tab) && (
        <GroupBody
          tab={tab}
          parentPath={parentPath}
          depth={depth}
          maxDepth={maxDepth}
          selectedId={selectedId}
          expanded={expanded}
          toggle={toggle}
          onSelect={onSelect}
          onAdd={onAdd}
          onReorder={onReorder}
        />
      )}
    </li>
  );
};

interface GroupBodyProps {
  tab: Tab;
  parentPath: string[];
  depth: number;
  maxDepth: number;
  selectedId: string | null;
  expanded: Set<string>;
  toggle: (id: string) => void;
  onSelect: (id: string, parentPath: string[]) => void;
  onAdd: (parentPath: string[], kind: "leaf" | "group") => void;
  onReorder: (parentPath: string[], orderedIds: string[]) => void;
}

const GroupBody: React.FC<GroupBodyProps> = ({
  tab,
  parentPath,
  depth,
  maxDepth,
  selectedId,
  expanded,
  toggle,
  onSelect,
  onAdd,
  onReorder,
}) => {
  const { t } = useTranslation();
  const myPath = [...parentPath, tab.id];
  const myDepth = depth + 1;
  const ordered = [...(tab.children ?? [])].sort((a, b) => a.order - b.order);
  const { getItemProps } = useDragReorder({
    items: ordered,
    onReorder: (ids) => onReorder(myPath, ids),
  });
  const canAddSubgroup = myDepth < maxDepth - 1;
  const indentPx = (myDepth + 1) * 16;

  return (
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
      <li
        style={{
          display: "flex",
          gap: 6,
          paddingLeft: indentPx,
          marginBottom: 4,
        }}
      >
        <button
          type="button"
          data-testid={`group-add-leaf-${tab.id}`}
          onClick={() => onAdd(myPath, "leaf")}
          style={{
            background: "transparent",
            color: "var(--muted)",
            border: "1px dashed var(--input-border)",
            borderRadius: 4,
            padding: "4px 10px",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          {t("settings.editor.addChildTab")}
        </button>
        {canAddSubgroup && (
          <button
            type="button"
            data-testid={`group-add-group-${tab.id}`}
            onClick={() => onAdd(myPath, "group")}
            style={{
              background: "transparent",
              color: "var(--muted)",
              border: "1px dashed var(--input-border)",
              borderRadius: 4,
              padding: "4px 10px",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            {t("settings.editor.addChildGroup")}
          </button>
        )}
      </li>
      {ordered.map((child) => (
        <NodeRow
          key={child.id}
          tab={child}
          parentPath={myPath}
          depth={myDepth}
          maxDepth={maxDepth}
          selectedId={selectedId}
          expanded={expanded}
          toggle={toggle}
          onSelect={onSelect}
          onAdd={onAdd}
          onReorder={onReorder}
          dragProps={getItemProps(child.id)}
        />
      ))}
    </ul>
  );
};

export const TabList: React.FC<TabListProps> = ({
  tabs,
  selectedId,
  onSelect,
  onAdd,
  onReorder,
  maxDepth,
}) => {
  const { t } = useTranslation();
  const ordered = [...tabs].sort((a, b) => a.order - b.order);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const { getItemProps } = useDragReorder({
    items: ordered,
    onReorder: (ids) => onReorder([], ids),
  });

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
        overflowY: "auto",
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
        onClick={() => onAdd([], "leaf")}
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
          {ordered.map((tab) => (
            <NodeRow
              key={tab.id}
              tab={tab}
              parentPath={[]}
              depth={0}
              maxDepth={maxDepth}
              selectedId={selectedId}
              expanded={expanded}
              toggle={toggle}
              onSelect={onSelect}
              onAdd={onAdd}
              onReorder={onReorder}
              dragProps={getItemProps(tab.id)}
            />
          ))}
        </ul>
      )}
    </aside>
  );
};
