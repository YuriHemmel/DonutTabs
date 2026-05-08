import React from "react";
import { useTranslation } from "react-i18next";
import { ProfileEditor } from "./ProfileEditor";
import type { Profile } from "../core/types/Profile";

export type ProfilesEditorMode =
  | { mode: "new" }
  | { mode: "edit"; profileId: string };

export interface ProfilesSectionProps {
  profiles: Profile[];
  activeId: string;
  /** Estado interno do editor (lifted no SettingsApp pra sobreviver à
   *  troca de seção). `null` = nenhum painel aberto. */
  editorMode: ProfilesEditorMode | null;
  onOpenNew: () => void;
  onOpenEdit: (profileId: string) => void;
  onCloseEditor: () => void;
  onSubmit: (payload: { name: string; icon: string | null }) => Promise<void>;
  onDelete: (profileId: string) => void;
  onSetActive: (profileId: string) => void;
}

export const ProfilesSection: React.FC<ProfilesSectionProps> = ({
  profiles,
  activeId,
  editorMode,
  onOpenNew,
  onOpenEdit,
  onCloseEditor,
  onSubmit,
  onDelete,
  onSetActive,
}) => {
  const { t } = useTranslation();

  const editorInitial: Profile | null =
    editorMode?.mode === "edit"
      ? profiles.find((p) => p.id === editorMode.profileId) ?? null
      : null;
  const editingProfileId =
    editorMode?.mode === "edit" ? editorMode.profileId : null;
  const canDelete = profiles.length > 1;

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
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
          {t("settings.profile.sectionTitle")}
        </header>
        <button
          type="button"
          data-testid="profile-add"
          onClick={onOpenNew}
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
          + {t("settings.profile.addProfile")}
        </button>
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
          {profiles.map((profile) => {
            const selected = profile.id === editingProfileId;
            const isActive = profile.id === activeId;
            return (
              <li key={profile.id}>
                <button
                  type="button"
                  data-testid={`profile-row-${profile.id}`}
                  data-selected={selected ? "true" : "false"}
                  onClick={() => onOpenEdit(profile.id)}
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
                    {profile.icon ?? "•"}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {profile.name}
                  </span>
                  {isActive && (
                    <span
                      data-testid="profile-row-active-badge"
                      style={{
                        color: "var(--accent-fg)",
                        background: "var(--accent-bg)",
                        borderRadius: 4,
                        padding: "1px 6px",
                        fontSize: 11,
                      }}
                    >
                      {t("settings.profile.activeBadge")}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {editorMode ? (
        <ProfileEditor
          mode={editorMode.mode}
          initial={editorInitial}
          onSubmit={onSubmit}
          onCancel={onCloseEditor}
          onSetActive={
            editorMode.mode === "edit" && editorMode.profileId !== activeId
              ? () => onSetActive(editorMode.profileId)
              : undefined
          }
          onDelete={
            editorMode.mode === "edit" && canDelete
              ? () => onDelete(editorMode.profileId)
              : undefined
          }
        />
      ) : (
        <section
          style={{
            flex: 1,
            display: "grid",
            placeItems: "center",
            color: "var(--muted)",
            padding: 24,
            textAlign: "center",
          }}
        >
          {t("settings.profile.selectPrompt")}
        </section>
      )}
    </div>
  );
};
