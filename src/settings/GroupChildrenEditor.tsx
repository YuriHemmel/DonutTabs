import React from "react";
import { useTranslation } from "react-i18next";
import type { Tab } from "../core/types/Tab";

export interface GroupChildrenEditorProps {
  children: Tab[];
  /** 1-based: 1 = root level. Para um grupo no root depth=1; pra um sub-grupo
   *  dentro dele depth=2. Usado pra desabilitar "+ Adicionar subgrupo" quando
   *  a profundidade já bateu no limite. */
  currentDepth: number;
  maxDepth: number;
  onChildSelect: (childId: string) => void;
  onAddChildLeaf: () => void;
  onAddChildGroup?: () => void;
}

export const GroupChildrenEditor: React.FC<GroupChildrenEditorProps> = ({
  children,
  currentDepth,
  maxDepth,
  onChildSelect,
  onAddChildLeaf,
  onAddChildGroup,
}) => {
  const { t } = useTranslation();
  const canAddSubgroup = currentDepth < maxDepth - 1;

  return (
    <div
      data-testid="group-children-editor"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <span>{t("settings.editor.groupChildrenLabel")}</span>
      {children.length === 0 ? (
        <small style={{ color: "var(--muted)" }}>
          {t("settings.editor.groupChildrenEmpty")}
        </small>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {children.map((child) => (
            <li key={child.id}>
              <button
                type="button"
                data-testid={`group-child-${child.id}`}
                onClick={() => onChildSelect(child.id)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "var(--input-bg)",
                  color: "var(--fg)",
                  border: "1px solid var(--input-border)",
                  borderRadius: 4,
                  padding: "6px 10px",
                  cursor: "pointer",
                  font: "inherit",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {child.kind === "group" && (
                  <span style={{ opacity: 0.6, fontSize: 11 }}>▶</span>
                )}
                <span>{child.icon ?? ""}</span>
                <span style={{ flex: 1 }}>
                  {child.name ?? child.id.slice(0, 6)}
                </span>
                {child.kind === "group" && (
                  <small style={{ color: "var(--muted)" }}>
                    ({child.children?.length ?? 0})
                  </small>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          data-testid="add-child-leaf"
          onClick={onAddChildLeaf}
          style={{
            background: "transparent",
            color: "var(--fg)",
            border: "1px solid var(--ghost-border)",
            borderRadius: 4,
            padding: "6px 12px",
            cursor: "pointer",
            font: "inherit",
          }}
        >
          {t("settings.editor.addChildTab")}
        </button>
        {canAddSubgroup && onAddChildGroup && (
          <button
            type="button"
            data-testid="add-child-group"
            onClick={onAddChildGroup}
            style={{
              background: "transparent",
              color: "var(--fg)",
              border: "1px solid var(--ghost-border)",
              borderRadius: 4,
              padding: "6px 12px",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            {t("settings.editor.addChildGroup")}
          </button>
        )}
        {!canAddSubgroup && (
          <small style={{ color: "var(--muted)", alignSelf: "center" }}>
            {t("settings.editor.maxDepthHint")}
          </small>
        )}
      </div>
    </div>
  );
};
