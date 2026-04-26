import React from "react";
import { useTranslation } from "react-i18next";
import type { Profile } from "../core/types/Profile";
import { DraggableProfileList } from "./DraggableProfileList";

export interface ProfilePickerProps {
  profiles: Profile[];
  selectedId: string;
  activeId: string;
  onSelect: (profileId: string) => void;
  onCreate: () => void;
  onEdit: (profileId: string) => void;
  onDelete: (profileId: string) => void;
  onReorder: (orderedIds: string[]) => void;
}

/**
 * Topbar acima do `<SectionTabs>`. Mostra qual perfil está sendo editado +
 * botões de criar/excluir. Os chips arrastáveis ficam em
 * `<DraggableProfileList>` (substitui o `<select>` nativo: `<option>` não é
 * draggable). O perfil **ativo** (que comanda o donut) pode ser diferente do
 * **selecionado** (que está sob edição); o marcador dourado sinaliza isso.
 */
export const ProfilePicker: React.FC<ProfilePickerProps> = ({
  profiles,
  selectedId,
  activeId,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
  onReorder,
}) => {
  const { t } = useTranslation();
  const canDelete = profiles.length > 1;
  return (
    <div
      data-testid="profile-picker"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--panel)",
      }}
    >
      <span style={{ color: "var(--fg)" }}>{t("settings.profile.label")}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <DraggableProfileList
          profiles={profiles}
          selectedId={selectedId}
          activeId={activeId}
          onSelect={onSelect}
          onReorder={onReorder}
        />
      </div>
      <button
        type="button"
        data-testid="profile-edit"
        onClick={() => onEdit(selectedId)}
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
        {t("settings.profile.edit")}
      </button>
      <button
        type="button"
        data-testid="profile-create"
        onClick={onCreate}
        style={{
          background: "var(--accent-bg)",
          color: "var(--accent-fg)",
          border: 0,
          borderRadius: 4,
          padding: "6px 12px",
          cursor: "pointer",
          font: "inherit",
        }}
      >
        + {t("settings.profile.new")}
      </button>
      {canDelete && (
        <button
          type="button"
          data-testid="profile-delete"
          onClick={() => onDelete(selectedId)}
          style={{
            background: "transparent",
            color: "var(--danger-fg)",
            border: "1px solid var(--danger-border)",
            borderRadius: 4,
            padding: "6px 12px",
            cursor: "pointer",
            font: "inherit",
          }}
        >
          {t("settings.profile.delete")}
        </button>
      )}
    </div>
  );
};
