import React from "react";
import { useTranslation } from "react-i18next";
import type { Profile } from "../core/types/Profile";
import { DraggableProfileList } from "./DraggableProfileList";

export interface ProfilePickerProps {
  profiles: Profile[];
  selectedId: string;
  activeId: string;
  onSelect: (profileId: string) => void;
  onReorder: (orderedIds: string[]) => void;
  /** Issue #51 — duplo-clique seleciona perfil e pula para a seção "Abas". */
  onActivate?: (profileId: string) => void;
}

/**
 * Topbar acima do `<SectionTabs>`. Mostra os chips draggable de perfis pra
 * trocar o contexto de edição (qual perfil é alvo das seções "Abas",
 * "Aparência", "Atalho"). Issue #39: criação/edição/exclusão de perfis
 * mudaram pra a seção dedicada `<ProfilesSection>`. Aqui só ficam os chips
 * de seleção e o label. O perfil **ativo** (que comanda o donut) pode ser
 * diferente do **selecionado**; o marcador dourado sinaliza isso.
 */
export const ProfilePicker: React.FC<ProfilePickerProps> = ({
  profiles,
  selectedId,
  activeId,
  onSelect,
  onReorder,
  onActivate,
}) => {
  const { t } = useTranslation();
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
          onActivate={onActivate}
        />
      </div>
    </div>
  );
};
