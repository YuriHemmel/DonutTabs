import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { translateAppError } from "../core/errors";
import { stripLetters, graphemeCount } from "./textUtils";
import type { Profile } from "../core/types/Profile";

type Mode = "new" | "edit";

export interface ProfileEditorSubmit {
  name: string;
  icon: string | null;
}

export interface ProfileEditorProps {
  mode: Mode;
  initial: Profile | null;
  onSubmit: (payload: ProfileEditorSubmit) => Promise<void> | void;
  onCancel: () => void;
}

interface FormState {
  name: string;
  icon: string;
}

function fromProfile(p: Profile | null): FormState {
  if (!p) return { name: "", icon: "" };
  return { name: p.name, icon: p.icon ?? "" };
}

export const ProfileEditor: React.FC<ProfileEditorProps> = ({
  mode,
  initial,
  onSubmit,
  onCancel,
}) => {
  const { t } = useTranslation();
  const [state, setState] = useState<FormState>(() => fromProfile(initial));
  const [validation, setValidation] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset apenas quando muda o alvo (mode ou perfil sob edição). Não depender
  // de `initial` direto: a referência muda a cada `config-changed`, o que
  // descartaria edições in-progress se outro fluxo persistisse no meio do
  // formulário aberto.
  const initialId = initial?.id ?? null;
  useEffect(() => {
    setState(fromProfile(initial));
    setValidation(null);
    setServerError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, initialId]);

  const submit = async () => {
    setServerError(null);

    const name = state.name.trim();
    const icon = state.icon.trim();

    if (!name) {
      setValidation(t("settings.profile.validationNameRequired"));
      return;
    }

    if (icon && graphemeCount(icon) > 1) {
      setValidation(t("settings.profile.validationIconTooLong"));
      return;
    }

    setValidation(null);
    setSaving(true);
    try {
      await onSubmit({ name, icon: icon.length > 0 ? icon : null });
    } catch (err) {
      setServerError(translateAppError(err, t));
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    background: "var(--input-bg)",
    color: "var(--fg)",
    border: "1px solid var(--input-border)",
    borderRadius: 4,
    padding: "6px 8px",
    font: "inherit",
  };

  const title =
    mode === "new"
      ? t("settings.profile.newTitle")
      : t("settings.profile.editTitle");
  const submitLabel =
    mode === "new"
      ? t("settings.profile.create")
      : t("settings.editor.save");

  return (
    <section
      data-testid="profile-editor"
      style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        borderBottom: "1px solid var(--border)",
        background: "var(--panel)",
      }}
    >
      <h2 style={{ margin: 0, fontSize: 16 }}>{title}</h2>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span>{t("settings.profile.nameLabel")}</span>
        <input
          value={state.name}
          onChange={(e) => setState({ ...state, name: e.target.value })}
          placeholder={t("settings.profile.namePlaceholder")}
          style={inputStyle}
          autoFocus
        />
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>{t("settings.profile.iconLabel")}</span>
          <input
            value={state.icon}
            onChange={(e) =>
              setState({ ...state, icon: stripLetters(e.target.value) })
            }
            placeholder={t("settings.profile.iconPlaceholder")}
            maxLength={16}
            size={4}
            style={{ ...inputStyle, width: 80 }}
          />
        </label>
        <small style={{ color: "var(--muted)" }}>
          {t("settings.profile.iconHint")}
        </small>
      </div>

      {validation && (
        <div role="alert" style={{ color: "var(--danger-fg)" }}>
          {validation}
        </div>
      )}
      {serverError && (
        <div role="alert" style={{ color: "var(--danger-fg)" }}>
          {serverError}
        </div>
      )}

      <footer style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          disabled={saving}
          onClick={submit}
          style={{
            background: "var(--accent-bg)",
            color: "var(--accent-fg)",
            border: 0,
            borderRadius: 4,
            padding: "8px 16px",
            cursor: saving ? "wait" : "pointer",
          }}
        >
          {saving ? t("settings.editor.saving") : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            background: "transparent",
            color: "var(--fg)",
            border: "1px solid var(--ghost-border)",
            borderRadius: 4,
            padding: "8px 16px",
            cursor: "pointer",
          }}
        >
          {t("settings.editor.cancel")}
        </button>
      </footer>
    </section>
  );
};
