import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ItemListEditor, type ItemDraft } from "./ItemListEditor";
import { GroupChildrenEditor } from "./GroupChildrenEditor";
import { translateAppError } from "../core/errors";
import { stripLetters, graphemeCount } from "./textUtils";
import { IconPicker } from "./IconPicker";
import type { Tab } from "../core/types/Tab";
import type { Item } from "../core/types/Item";
import type { OpenMode } from "../core/types/OpenMode";
import type { TabKind as SchemaTabKind } from "../core/types/TabKind";

const LUCIDE_PREFIX = "lucide:";
const isLucideToken = (s: string) => s.startsWith(LUCIDE_PREFIX);

/** Plano 16: alinhado com `MAX_TAB_DEPTH` em `validate.rs`. */
export const MAX_TAB_DEPTH = 3;

type Mode = "new" | "edit";
type TabKind = SchemaTabKind;

export interface TabEditorProps {
  mode: Mode;
  initial: Tab | null;
  onSave: (tab: Tab) => Promise<void>;
  onCancel: () => void;
  onDelete: (tabId: string) => Promise<void>;
  /** Plano 16 — nível atual da aba (1 = root, 2 = filho de grupo, ...).
   *  Usado pra desabilitar "+ Adicionar subgrupo" quando depth+1 atingiria
   *  `MAX_TAB_DEPTH`. */
  currentDepth?: number;
  /** Click em um child do `<GroupChildrenEditor>`: SettingsApp navega pra
   *  edição daquele child com parentPath atualizado. */
  onSelectChild?: (childId: string) => void;
  /** "+ Adicionar aba" / "+ Adicionar subgrupo": SettingsApp abre TabEditor
   *  novo no nível imediatamente abaixo. */
  onAddChild?: (kind: TabKind) => void;
  /** Plano 16 — pré-seleciona o radio "Aba" / "Grupo" no modo new.
   *  Ignorado em mode=edit (kind é deduzido de `initial.children`). */
  initialKind?: TabKind;
}

interface FormState {
  id: string;
  name: string;
  icon: string;
  openMode: OpenMode;
  items: ItemDraft[];
  kind: TabKind;
}

function randomUuid(): string {
  return crypto.randomUUID();
}

function itemToDraft(it: Item): ItemDraft {
  if (it.kind === "url") {
    return { kind: "url", value: it.value, openWith: it.openWith ?? "" };
  }
  if (it.kind === "file" || it.kind === "folder") {
    return { kind: it.kind, value: it.path, openWith: it.openWith ?? "" };
  }
  if (it.kind === "app") {
    return { kind: "app", value: it.name, openWith: "" };
  }
  // kind === "script"
  return {
    kind: "script",
    value: it.command,
    openWith: "",
    trusted: it.trusted,
  };
}

function draftToItem(d: ItemDraft): Item {
  if (d.kind === "url") {
    const ow = d.openWith.trim();
    return {
      kind: "url",
      value: d.value,
      openWith: ow.length > 0 ? ow : null,
    };
  }
  if (d.kind === "file" || d.kind === "folder") {
    const ow = d.openWith.trim();
    return {
      kind: d.kind,
      path: d.value,
      openWith: ow.length > 0 ? ow : null,
    };
  }
  if (d.kind === "app") {
    return { kind: "app", name: d.value };
  }
  // kind === "script" — novos sempre nascem trusted=false; edits preservam.
  return {
    kind: "script",
    command: d.value,
    trusted: d.trusted ?? false,
  };
}

function fromTab(tab: Tab | null, initialKind: TabKind = "leaf"): FormState {
  if (!tab) {
    return {
      id: randomUuid(),
      name: "",
      icon: "",
      openMode: "reuseOrNewWindow",
      items: [{ kind: "url", value: "", openWith: "" }],
      kind: initialKind,
    };
  }
  // Plano 16: kind explícito vence; só caímos no fallback (children-non-empty)
  // pra configs Plano-15 antigas que não tinham `kind` no JSON.
  const kind: TabKind =
    tab.kind ?? ((tab.children?.length ?? 0) > 0 ? "group" : "leaf");
  return {
    id: tab.id,
    name: tab.name ?? "",
    icon: tab.icon ?? "",
    openMode: tab.openMode,
    items: tab.items.length
      ? tab.items.map(itemToDraft)
      : [{ kind: "url", value: "", openWith: "" }],
    kind,
  };
}

export const TabEditor: React.FC<TabEditorProps> = ({
  mode,
  initial,
  onSave,
  onCancel,
  onDelete,
  currentDepth = 1,
  onSelectChild,
  onAddChild,
  initialKind = "leaf",
}) => {
  const { t } = useTranslation();
  const [state, setState] = useState<FormState>(() => fromTab(initial, initialKind));
  const [validation, setValidation] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setState(fromTab(initial, initialKind));
    setValidation(null);
    setServerError(null);
  }, [initial, mode, initialKind]);

  const submit = async () => {
    setServerError(null);

    const name = state.name.trim();
    const icon = state.icon.trim();
    if (!name && !icon) {
      setValidation(t("settings.editor.validationNameOrIcon"));
      return;
    }

    if (icon && !isLucideToken(icon) && graphemeCount(icon) > 1) {
      setValidation(t("settings.editor.validationIconTooLong"));
      return;
    }

    let payloadItems: Item[] = [];
    if (state.kind === "leaf") {
      const trimmed: ItemDraft[] = state.items
        .map((it) => ({
          kind: it.kind,
          value: it.value.trim(),
          openWith: it.openWith.trim(),
          trusted: it.trusted,
        }))
        .filter((it) => it.value.length > 0);
      if (trimmed.length === 0) {
        setValidation(t("settings.editor.validationAtLeastOneItem"));
        return;
      }

      for (const it of trimmed) {
        if (it.kind === "url") {
          try {
            new URL(it.value);
          } catch {
            setValidation(t("settings.editor.validationInvalidUrl", { value: it.value }));
            return;
          }
        }
        // file/folder: only emptiness matters; existence is checked at launch.
      }
      payloadItems = trimmed.map(draftToItem);
    }

    setValidation(null);

    const payload: Tab = {
      id: state.id,
      name: name.length > 0 ? name : null,
      icon: icon.length > 0 ? icon : null,
      order: initial?.order ?? 0,
      openMode: state.openMode,
      items: payloadItems,
      // Plano 16: kind explícito persistido — distingue group vazio
      // de leaf vazio depois do round-trip.
      kind: state.kind,
      // leaf nunca persiste children; group preserva os existentes ou
      // inicia vazio (user adiciona depois via "+ Adicionar aba").
      children: state.kind === "group" ? initial?.children ?? [] : [],
    };

    setSaving(true);
    try {
      await onSave(payload);
    } catch (err) {
      setServerError(translateAppError(err, t));
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = async () => {
    if (!initial) return;
    const label = initial.name ?? initial.icon ?? initial.id.slice(0, 6);
    const confirmed = window.confirm(t("settings.editor.confirmDelete", { label }));
    if (!confirmed) return;
    try {
      await onDelete(initial.id);
    } catch (err) {
      setServerError(translateAppError(err, t));
    }
  };

  const title =
    mode === "new" ? t("settings.editor.newTabTitle") : state.name || state.icon || "";

  const inputStyle: React.CSSProperties = {
    background: "var(--input-bg)",
    color: "var(--fg)",
    border: "1px solid var(--input-border)",
    borderRadius: 4,
    padding: "6px 8px",
    font: "inherit",
  };

  return (
    <section
      style={{
        flex: 1,
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 16,
        overflow: "auto",
      }}
    >
      <h2 style={{ margin: 0 }}>{title}</h2>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span>{t("settings.editor.name")}</span>
        <input
          value={state.name}
          onChange={(e) => setState({ ...state, name: e.target.value })}
          placeholder={t("settings.editor.namePlaceholder")}
          style={inputStyle}
        />
      </label>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span>{t("settings.editor.icon")}</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              value={state.icon}
              onChange={(e) => {
                const raw = e.target.value;
                setState({
                  ...state,
                  icon: isLucideToken(raw) ? raw : stripLetters(raw),
                });
              }}
              placeholder={t("settings.editor.iconPlaceholder")}
              maxLength={64}
              size={4}
              style={{ ...inputStyle, width: 160 }}
            />
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
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
              {t("settings.icon.pickButton")}
            </button>
          </div>
        </label>
        <small style={{ color: "var(--muted)" }}>{t("settings.editor.iconHint")}</small>
      </div>

      <IconPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(icon) => setState((s) => ({ ...s, icon }))}
      />

      {mode === "new" && (
        <fieldset
          style={{ border: "1px solid var(--input-border)", borderRadius: 4, padding: 12 }}
        >
          <legend style={{ padding: "0 6px" }}>{t("settings.editor.kindLabel")}</legend>
          <label
            style={{ display: "flex", gap: 6, alignItems: "center", padding: 4 }}
          >
            <input
              type="radio"
              name="tab-kind"
              data-testid="tab-kind-leaf"
              checked={state.kind === "leaf"}
              onChange={() => setState({ ...state, kind: "leaf" })}
            />
            {t("settings.editor.tabKindLeaf")}
          </label>
          <label
            style={{ display: "flex", gap: 6, alignItems: "center", padding: 4 }}
          >
            <input
              type="radio"
              name="tab-kind"
              data-testid="tab-kind-group"
              checked={state.kind === "group"}
              onChange={() => setState({ ...state, kind: "group" })}
            />
            {t("settings.editor.tabKindGroup")}
          </label>
        </fieldset>
      )}

      {state.kind === "leaf" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span>{t("settings.editor.items")}</span>
          <ItemListEditor
            values={state.items}
            onChange={(items) => setState({ ...state, items })}
          />
        </div>
      ) : mode === "edit" ? (
        <GroupChildrenEditor
          children={initial?.children ?? []}
          currentDepth={currentDepth}
          maxDepth={MAX_TAB_DEPTH}
          onChildSelect={(childId) => onSelectChild?.(childId)}
          onAddChildLeaf={() => onAddChild?.("leaf")}
          onAddChildGroup={
            currentDepth < MAX_TAB_DEPTH - 1 && onAddChild
              ? () => onAddChild("group")
              : undefined
          }
        />
      ) : (
        // Plano 16 — group novo ainda não foi salvo, então não dá pra
        // adicionar children (a child precisa de parentPath válido).
        // User salva o grupo vazio aqui; reabre via TabList ou via
        // donut "+ in group" pra preencher.
        <div
          data-testid="group-new-hint"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            padding: 12,
            border: "1px dashed var(--input-border)",
            borderRadius: 4,
          }}
        >
          <small style={{ color: "var(--muted)" }}>
            {t("settings.editor.groupNewHint")}
          </small>
        </div>
      )}

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

      <footer style={{ display: "flex", gap: 8, marginTop: "auto" }}>
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
          {saving ? t("settings.editor.saving") : t("settings.editor.save")}
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
        {mode === "edit" && initial && (
          <button
            type="button"
            onClick={requestDelete}
            style={{
              marginLeft: "auto",
              background: "transparent",
              color: "var(--danger-fg)",
              border: "1px solid var(--danger-border)",
              borderRadius: 4,
              padding: "8px 16px",
              cursor: "pointer",
            }}
          >
            {t("settings.editor.delete")}
          </button>
        )}
      </footer>
    </section>
  );
};
