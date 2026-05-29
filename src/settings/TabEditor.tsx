import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ItemListEditor, type ItemDraft } from "./ItemListEditor";
import { GroupChildrenEditor } from "./GroupChildrenEditor";
import { translateAppError } from "../core/errors";
import { graphemeCount } from "./textUtils";
import { IconPicker } from "./IconPicker";
import { IconField } from "./IconField";
import { IconDisplay } from "./IconDisplay";
import { Switch } from "./Switch";
import type { Tab } from "../core/types/Tab";
import type { Item } from "../core/types/Item";
import type { OpenMode } from "../core/types/OpenMode";
import type { TabKind as SchemaTabKind } from "../core/types/TabKind";

const LUCIDE_PREFIX = "lucide:";
const isLucideToken = (s: string) => s.startsWith(LUCIDE_PREFIX);

const isMacPlatform = (): boolean => {
  if (typeof navigator === "undefined") return false;
  return /Mac/i.test(navigator.platform);
};

/** Plano 16 / Issue #39: alinhado com `MAX_TAB_DEPTH` em `validate.rs`.
 *  Reduzido de 3 pra 2 pra encolher a janela do donut. */
export const MAX_TAB_DEPTH = 2;

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
  /** Issue #103 — grupo-pai quando criando uma aba dentro de um grupo
   *  (mode=new + currentDepth > 1). Renderizado como cabeçalho (ícone + nome)
   *  acima do título "Nova aba"; `null` no root. */
  parentGroup?: { name: string | null; icon: string | null } | null;
  /** Issue #109 — destinos válidos pra "Mover para" (mode=edit). Cada item:
   *  `value` = `"root"` ou o id do grupo de destino. A localização atual da
   *  aba já vem **excluída** da lista pelo SettingsApp; lista vazia esconde o
   *  controle. */
  moveDestinations?: { value: string; label: string }[];
  /** Issue #109 — dispara o move pro destino escolhido (`"root"` → `[]`). */
  onMove?: (toParentPath: string[]) => Promise<void>;
}

interface FormState {
  id: string;
  name: string;
  icon: string;
  openMode: OpenMode;
  items: ItemDraft[];
  kind: TabKind;
  /** Plano 24 — quando true, o launcher tenta focar apps/URLs já abertos
   *  antes de cair no fluxo de abrir novo. */
  focusIfOpen: boolean;
}

function randomUuid(): string {
  return crypto.randomUUID();
}

function itemToDraft(it: Item): ItemDraft {
  if (it.kind === "url") {
    return {
      kind: "url",
      value: it.value,
      openWith: it.openWith ?? "",
      monitor: it.monitor ?? null,
      incognito: it.incognito,
    };
  }
  if (it.kind === "file" || it.kind === "folder") {
    return {
      kind: it.kind,
      value: it.path,
      openWith: it.openWith ?? "",
      monitor: it.monitor ?? null,
    };
  }
  if (it.kind === "app") {
    return {
      kind: "app",
      value: it.name,
      openWith: "",
      monitor: it.monitor ?? null,
    };
  }
  // kind === "script"
  return {
    kind: "script",
    value: it.command,
    openWith: "",
    trusted: it.trusted,
    monitor: it.monitor ?? null,
    shell: it.shell ?? null,
  };
}

function draftToItem(d: ItemDraft): Item {
  // Plano 21 — monitor é `null` quando não selecionado; round-trip mantém
  // `null` (backend `Option<u32>` aceita null + omite na serialização).
  const monitor = d.monitor ?? null;
  if (d.kind === "url") {
    const ow = d.openWith.trim();
    return {
      kind: "url",
      value: d.value,
      openWith: ow.length > 0 ? ow : null,
      monitor,
      // Incognito preservado mesmo sem openWith — launcher detecta o
      // navegador padrão do SO em runtime quando necessário.
      incognito: !!d.incognito,
    };
  }
  if (d.kind === "file" || d.kind === "folder") {
    const ow = d.openWith.trim();
    return {
      kind: d.kind,
      path: d.value,
      openWith: ow.length > 0 ? ow : null,
      monitor,
    };
  }
  if (d.kind === "app") {
    return { kind: "app", name: d.value, monitor };
  }
  // kind === "script" — novos sempre nascem trusted=false; edits preservam.
  return {
    kind: "script",
    command: d.value,
    trusted: d.trusted ?? false,
    monitor,
    shell: d.shell ?? null,
  };
}

/** Plano 24 — Firefox no macOS não expõe abas via AppleScript, então
 *  `try_focus_url` ignora qualquer URL com openWith=Firefox e cai no
 *  fallback (abre nova aba). Detectamos isso aqui pra mostrar warning
 *  inline quando user combina focus_if_open=true + openWith referindo
 *  Firefox. Match em substring case-insensitive cobre variantes que o
 *  user pode digitar ("Firefox", "firefox", "firefox-nightly", etc.). */
export function hasFirefoxUrlItem(items: { kind: ItemDraft["kind"]; openWith: string }[]): boolean {
  return items.some(
    (it) =>
      it.kind === "url" && it.openWith.trim().toLowerCase().includes("firefox"),
  );
}

function fromTab(tab: Tab | null, initialKind: TabKind = "leaf"): FormState {
  if (!tab) {
    return {
      id: randomUuid(),
      name: "",
      icon: "",
      openMode: "reuseOrNewWindow",
      items: [{ kind: "url", value: "", openWith: "", monitor: null }],
      kind: initialKind,
      focusIfOpen: false,
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
    // Plano 24: configs Plano-23 e anteriores não têm o campo; ?? false
    // cobre o caso (ts-rs marca como boolean sem nullable, mas runtime
    // pode receber undefined em JSONs antigos).
    focusIfOpen: tab.focusIfOpen ?? false,
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
  parentGroup = null,
  moveDestinations = [],
  onMove,
}) => {
  const { t } = useTranslation();
  // Issue #103 — dentro de um grupo (currentDepth > 1) só é possível criar
  // aba (leaf); o tipo "Grupo" seria inútil (MAX_TAB_DEPTH = 2). Forçamos leaf
  // como kind inicial pra evitar um estado "group" órfão vindo de initialKind.
  const insideGroup = currentDepth > 1;
  const effectiveInitialKind: TabKind = insideGroup ? "leaf" : initialKind;
  const [state, setState] = useState<FormState>(() =>
    fromTab(initial, effectiveInitialKind),
  );
  const [validation, setValidation] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setState(fromTab(initial, effectiveInitialKind));
    setValidation(null);
    setServerError(null);
  }, [initial, mode, effectiveInitialKind]);

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
          monitor: it.monitor ?? null,
          incognito: it.incognito,
          shell: it.shell ?? null,
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
      // Plano 24 — toggle por aba lido pelo launcher em runtime. Grupos
      // não usam essa lógica (sem items), então sempre persistimos `false`.
      focusIfOpen: state.kind === "leaf" ? state.focusIfOpen : false,
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

  const handleMoveSelect = async (value: string) => {
    if (!onMove || value === "") return;
    const toParentPath = value === "root" ? [] : [value];
    setServerError(null);
    setSaving(true);
    try {
      await onMove(toParentPath);
    } catch (err) {
      setServerError(translateAppError(err, t));
    } finally {
      setSaving(false);
    }
  };

  const showMoveControl =
    mode === "edit" && !!onMove && moveDestinations.length > 0;

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
      {mode === "new" && parentGroup && (
        <div
          data-testid="new-tab-in-group-header"
          aria-label={t("settings.editor.newTabInGroupAria", {
            groupName: parentGroup.name ?? parentGroup.icon ?? "",
          })}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontWeight: 600,
            fontSize: "1.1em",
          }}
        >
          {parentGroup.icon && <IconDisplay icon={parentGroup.icon} size={22} />}
          {parentGroup.name && <span>{parentGroup.name}</span>}
        </div>
      )}
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
            <IconField
              testId="tab-icon"
              value={state.icon}
              onChange={(icon) => setState((s) => ({ ...s, icon }))}
              onRequestPicker={() => setPickerOpen(true)}
              placeholder={t("settings.editor.iconPlaceholder")}
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

      {showMoveControl && (
        <label
          data-testid="tab-move-to"
          style={{ display: "flex", flexDirection: "column", gap: 4 }}
        >
          <span>{t("settings.editor.moveToLabel")}</span>
          <select
            data-testid="tab-move-to-select"
            value=""
            disabled={saving}
            onChange={(e) => {
              void handleMoveSelect(e.target.value);
            }}
            style={inputStyle}
          >
            <option value="">{t("settings.editor.moveToLabel")}…</option>
            {moveDestinations.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      )}

      {state.kind === "leaf" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <Switch
              data-testid="tab-focus-if-open"
              checked={state.focusIfOpen}
              onChange={(next) => setState({ ...state, focusIfOpen: next })}
            />
            <span>{t("settings.editor.focusIfOpen.label")}</span>
          </label>
          <small style={{ color: "var(--muted)" }}>
            {t("settings.editor.focusIfOpen.hint")}
          </small>
          {isMacPlatform() && (
            <small
              data-testid="tab-focus-mac-hint"
              style={{ color: "var(--muted)", whiteSpace: "pre-line" }}
            >
              {t("settings.editor.focusIfOpen.hintMac")}
            </small>
          )}
          {state.focusIfOpen && hasFirefoxUrlItem(state.items) && (
            <div
              role="alert"
              data-testid="tab-focus-firefox-warning"
              style={{
                marginTop: 4,
                padding: 8,
                border: "1px solid var(--warning-border, var(--input-border))",
                borderRadius: 4,
                background: "var(--warning-bg, transparent)",
                color: "var(--warning-fg, var(--fg))",
                fontSize: "0.9em",
              }}
            >
              {t("settings.editor.focusIfOpen.firefoxWarning")}
            </div>
          )}
        </div>
      )}

      {mode === "new" && !insideGroup && (
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
