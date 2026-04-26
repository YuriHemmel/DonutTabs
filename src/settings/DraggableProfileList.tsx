import React from "react";
import { useTranslation } from "react-i18next";
import type { Profile } from "../core/types/Profile";
import { useDragReorder } from "./useDragReorder";

export interface DraggableProfileListProps {
  profiles: Profile[];
  selectedId: string;
  activeId: string;
  onSelect: (profileId: string) => void;
  onReorder: (orderedIds: string[]) => void;
}

/**
 * Lista horizontal de chips de perfil, clicáveis e arrastáveis. Substitui o
 * `<select>` nativo do `<ProfilePicker>` (que não permite drag de `<option>`).
 */
export const DraggableProfileList: React.FC<DraggableProfileListProps> = ({
  profiles,
  selectedId,
  activeId,
  onSelect,
  onReorder,
}) => {
  const { t } = useTranslation();
  const { getItemProps } = useDragReorder({ items: profiles, onReorder });

  return (
    <ul
      data-testid="profile-list"
      role="listbox"
      aria-label={t("settings.profile.label")}
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 6,
        listStyle: "none",
        margin: 0,
        padding: 0,
      }}
    >
      {profiles.map((p) => {
        const dnd = getItemProps(p.id);
        const isActive = p.id === activeId;
        const isSelected = p.id === selectedId;
        const fallbackChar = (p.name.trim()[0] ?? "?").toUpperCase();
        const dropAbove = dnd["data-drop-target"] === "above";
        const dropBelow = dnd["data-drop-target"] === "below";
        return (
          <li
            key={p.id}
            data-testid={`profile-chip-${p.id}`}
            role="option"
            aria-selected={isSelected}
            data-dragging={dnd["data-dragging"] ? "true" : undefined}
            data-drop-target={dnd["data-drop-target"] ?? undefined}
            draggable={dnd.draggable}
            onDragStart={dnd.onDragStart}
            onDragOver={dnd.onDragOver}
            onDrop={dnd.onDrop}
            onDragEnd={dnd.onDragEnd}
            onClick={() => onSelect(p.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(p.id);
              }
            }}
            tabIndex={0}
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              borderRadius: 6,
              border: `1px solid ${
                isSelected ? "var(--accent-bg)" : "var(--input-border)"
              }`,
              background: "var(--input-bg)",
              color: "var(--fg)",
              cursor: dnd["data-dragging"] ? "grabbing" : "grab",
              opacity: dnd["data-dragging"] ? 0.5 : 1,
              userSelect: "none",
              boxShadow: dropAbove
                ? "inset 2px 0 0 var(--accent-bg)"
                : dropBelow
                  ? "inset -2px 0 0 var(--accent-bg)"
                  : "none",
              outline: "none",
            }}
          >
            <span aria-hidden="true">{p.icon ? p.icon : fallbackChar}</span>
            <span>{p.name}</span>
            {isActive && (
              <span
                data-testid={`profile-chip-active-${p.id}`}
                aria-label={t("settings.profile.activeMarker")}
                title={t("settings.profile.activeMarker")}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: "#f3c742",
                  marginLeft: 4,
                  display: "inline-block",
                }}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
};
