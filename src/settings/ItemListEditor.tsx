import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { dialog, ipc } from "../core/ipc";
import { AppPicker } from "./AppPicker";
import type { InstalledApp } from "../core/types/InstalledApp";
import type { MonitorInfo } from "../core/types/MonitorInfo";

export type ItemKind = "url" | "file" | "folder" | "app" | "script";

export interface ItemDraft {
  kind: ItemKind;
  /** Para url=value, file/folder=path, app=name, script=command. */
  value: string;
  /** Optional handler/program. Empty string ⇔ unset (uses OS default).
   *  Não se aplica a `app`/`script` (sempre empty para esses kinds). */
  openWith: string;
  /** Só `kind: "script"` carrega esse flag. Default `false`; flipped via
   *  `<ScriptConfirmModal>` ou checkbox no editor. */
  trusted?: boolean;
  /** Plano 21 — índice 0-based do monitor alvo. `null` (default) = OS
   *  decide. Round-trips com o backend via `Item.monitor`. */
  monitor?: number | null;
  /** Issue — Quando `true` e `kind === "url"`, launcher abre o navegador
   *  escolhido (`openWith`) em modo anônimo/privado. Requer `openWith`
   *  non-empty; combinação inválida é normalizada pra `false` no submit. */
  incognito?: boolean;
  /** Issue #64 — preset de shell para `kind: "script"`. `null`/undefined =
   *  default da plataforma (cmd/sh). Allowlist: cmd | powershell | pwsh |
   *  wsl | bash | sh | zsh. */
  shell?: string | null;
}

export interface ItemListEditorProps {
  values: ItemDraft[];
  onChange: (next: ItemDraft[]) => void;
  /** Plano 21 — injectable pra testes. Quando ausente, hook chama
   *  `ipc.listMonitors()` no mount. */
  monitorsOverride?: MonitorInfo[];
  /** Issue #45 — injectable pra testes do dropdown "Abrir com". Quando
   *  ausente, hook chama `ipc.listInstalledApps()` no mount. */
  installedAppsOverride?: InstalledApp[];
}

const KIND_OPTIONS: ReadonlyArray<ItemKind> = [
  "url",
  "file",
  "folder",
  "app",
  "script",
];

const KIND_SUFFIX: Record<ItemKind, string> = {
  url: "Url",
  file: "File",
  folder: "Folder",
  app: "App",
  script: "Script",
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  // `<input>`/`<textarea>` carregam min-width intrínseca (~size attr) que
  // impede flex-shrink. Sem isto, em telas estreitas o value input não
  // encolhe enquanto o header `<div flex:1>` sim — desalinha colunas
  // subsequentes. selectStyle/openWithStyle/monitorSelectStyle sobrescrevem
  // `flex` com basis fixa, então a min-width não afeta quem não cresce.
  minWidth: 0,
  background: "var(--input-bg)",
  color: "var(--fg)",
  border: "1px solid var(--input-border)",
  borderRadius: 4,
  padding: "6px 8px",
  font: "inherit",
};
/** Min-width do campo "Valor" — impede que o input fique impraticavelmente
 *  estreito ao encolher a janela. Header valor cell usa o mesmo `minWidth`
 *  pra alinhar colunas subsequentes (openWith/monitor/remove) em todas as
 *  larguras. */
const VALUE_MIN_WIDTH = 200;
const selectStyle: React.CSSProperties = {
  ...inputStyle,
  flex: "0 0 110px",
};
const openWithStyle: React.CSSProperties = {
  ...inputStyle,
  flex: "0 0 200px",
};

/** Issue — "Abrir com" para `kind: "url"` deve listar só navegadores. Match
 *  case-insensitive contra `name`/`value`/`path` do `InstalledApp`. Cobre
 *  rótulos localizados (ex. "Google Chrome") e binários nus (ex. `chrome.exe`,
 *  `/usr/bin/firefox`). */
const BROWSER_KEYWORDS = [
  "chrome",
  "chromium",
  "firefox",
  "edge",
  "msedge",
  "brave",
  "opera",
  "safari",
  "vivaldi",
  "arc",
  "tor browser",
  "torbrowser",
  "librewolf",
  "waterfox",
  "yandex",
  "duckduckgo",
  "zen browser",
];

const isBrowser = (app: InstalledApp): boolean => {
  const haystack = `${app.name}\n${app.value}\n${app.path}`.toLowerCase();
  return BROWSER_KEYWORDS.some((kw) => haystack.includes(kw));
};

/** Title Case por palavra. "google chrome" → "Google Chrome",
 *  "MICROSOFT EDGE" → "Microsoft Edge", "firefox" → "Firefox". Preserva
 *  separadores (espaço, hífen, etc.) usando `\b\p{L}`. */
const titleCase = (s: string): string =>
  s.toLocaleLowerCase().replace(/\b\p{L}/gu, (c) => c.toLocaleUpperCase());
const monitorSelectStyle: React.CSSProperties = {
  ...inputStyle,
  flex: "0 0 140px",
};
const ghostBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--fg)",
  border: "1px solid var(--ghost-border)",
  borderRadius: 4,
  padding: "4px 10px",
  cursor: "pointer",
  font: "inherit",
};
/** Slot fixo ocupado pelo botão "Procurar…" (file/folder) ou "📋 Procurar app"
 *  (app). Header reserva o mesmo width quando qualquer row precisa do slot,
 *  pra que `openWith`/`monitor`/`remove` fiquem alinhados em ambos. */
const actionSlotStyle: React.CSSProperties = {
  flex: "0 0 130px",
  display: "flex",
};
const actionBtnStyle: React.CSSProperties = {
  ...ghostBtn,
  flex: 1,
  textAlign: "center",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};
const removeBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--danger-fg)",
  border: "1px solid var(--danger-border)",
  borderRadius: 4,
  padding: "4px 10px",
  cursor: "pointer",
};
const addBtn: React.CSSProperties = {
  background: "transparent",
  color: "var(--fg)",
  border: "1px dashed var(--input-border)",
  borderRadius: 4,
  padding: "4px 10px",
  cursor: "pointer",
  fontSize: 12,
};

const usesOpenWith = (k: ItemKind) => k === "url" || k === "file" || k === "folder";
const usesBrowse = (k: ItemKind) => k === "file" || k === "folder";
const isScript = (k: ItemKind) => k === "script";
const isApp = (k: ItemKind) => k === "app";

export const ItemListEditor: React.FC<ItemListEditorProps> = ({
  values,
  onChange,
  monitorsOverride,
  installedAppsOverride,
}) => {
  const { t } = useTranslation();
  /** Plano 17 — index do row de `kind: "app"` aberto no `<AppPicker>`,
   *  ou `null` quando o picker está fechado. */
  const [appPickerIndex, setAppPickerIndex] = useState<number | null>(null);
  /** Plano 21 — monitores conectados. Fetched no mount; `null` enquanto
   *  carregando (esconde a coluna até saber a contagem real). */
  const [monitors, setMonitors] = useState<MonitorInfo[] | null>(
    monitorsOverride ?? null,
  );
  /** Issue #45 — apps instalados pra popular o dropdown "Abrir com". `null`
   *  enquanto carregando: cai pra "Padrão" + valor custom corrente até a
   *  lista chegar. */
  const [installedApps, setInstalledApps] = useState<InstalledApp[] | null>(
    installedAppsOverride ?? null,
  );

  useEffect(() => {
    if (monitorsOverride !== undefined) {
      setMonitors(monitorsOverride);
      return;
    }
    let cancelled = false;
    ipc
      .listMonitors()
      .then((list) => {
        if (!cancelled) setMonitors(list);
      })
      .catch(() => {
        // Falha de query — assume 1 monitor (esconde coluna). User não fica
        // bloqueado se o SO recusar a query (raro).
        if (!cancelled) setMonitors([]);
      });
    return () => {
      cancelled = true;
    };
  }, [monitorsOverride]);

  useEffect(() => {
    if (installedAppsOverride !== undefined) {
      setInstalledApps(installedAppsOverride);
      return;
    }
    let cancelled = false;
    ipc
      .listInstalledApps()
      .then((list) => {
        if (!cancelled) setInstalledApps(list);
      })
      .catch(() => {
        // Falha não bloqueia: dropdown fica com "Padrão" + valor corrente.
        if (!cancelled) setInstalledApps([]);
      });
    return () => {
      cancelled = true;
    };
  }, [installedAppsOverride]);

  const showMonitorSelect = monitors !== null && monitors.length > 1;

  const updateAt = (i: number, patch: Partial<ItemDraft>) => {
    const next = values.map((v, idx) => (idx === i ? { ...v, ...patch } : v));
    onChange(next);
  };

  const removeAt = (i: number) => {
    onChange(values.filter((_, idx) => idx !== i));
  };

  const add = (kind: ItemKind) => {
    // Plano 21 — `monitor` fica omitido do draft inicial (não vira `null`
    // explícito) pra evitar poluir testes existentes que comparam shape
    // estrita; backend deserializa a ausência como `None`.
    const draft: ItemDraft = { kind, value: "", openWith: "" };
    if (isScript(kind)) draft.trusted = false;
    onChange([...values, draft]);
  };

  const browse = async (i: number, kind: ItemKind) => {
    const path =
      kind === "folder" ? await dialog.pickFolder() : await dialog.pickFile();
    if (path) updateAt(i, { value: path });
  };

  const placeholderFor = (kind: ItemKind) =>
    t(`settings.editor.itemPlaceholder${KIND_SUFFIX[kind]}`);

  const labelFor = (kind: ItemKind) =>
    t(`settings.editor.itemKind${KIND_SUFFIX[kind]}`);

  const anyUsesOpenWith = values.some((v) => usesOpenWith(v.kind));
  const usesActionSlot = (k: ItemKind) => usesBrowse(k) || isApp(k);
  const anyUsesActionSlot = values.some((v) => usesActionSlot(v.kind));

  const headerCellStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    color: "var(--muted)",
    letterSpacing: 0.4,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {values.length > 0 && (
        <div
          data-testid="item-header-row"
          style={{
            display: "flex",
            gap: 6,
            alignItems: "center",
            paddingBottom: 4,
            borderBottom: "1px solid var(--input-border)",
          }}
        >
          <div style={{ ...headerCellStyle, flex: "0 0 110px" }}>
            {t("settings.editor.kindLabel")}
          </div>
          <div style={{ ...headerCellStyle, flex: 1, minWidth: VALUE_MIN_WIDTH }}>
            {t("settings.editor.headerValue")}
          </div>
          {anyUsesActionSlot && (
            <div style={actionSlotStyle} aria-hidden="true" />
          )}
          {anyUsesOpenWith && (
            <div style={{ ...headerCellStyle, flex: "0 0 200px" }}>
              {t("settings.editor.openWithLabel")}
            </div>
          )}
          {showMonitorSelect && (
            <div style={{ ...headerCellStyle, flex: "0 0 140px" }}>
              {t("settings.editor.monitorLabel")}
            </div>
          )}
          {/* spacer alinhando com o botão remover (✕) */}
          <div style={{ flex: "0 0 36px" }} aria-hidden="true" />
        </div>
      )}
      {values.map((it, i) => (
        <div
          key={i}
          data-testid={`item-row-${i}`}
          style={{ display: "flex", flexDirection: "column", gap: 4 }}
        >
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select
              aria-label={`${t("settings.editor.items")} ${i + 1} kind`}
              data-testid={`item-kind-${i}`}
              value={it.kind}
              onChange={(e) =>
                updateAt(i, { kind: e.target.value as ItemKind })
              }
              style={selectStyle}
            >
              {KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {labelFor(k)}
                </option>
              ))}
            </select>
            {isScript(it.kind) ? (
              <textarea
                aria-label={`${labelFor(it.kind)} ${i + 1}`}
                data-testid={`item-value-${i}`}
                value={it.value}
                onChange={(e) => updateAt(i, { value: e.target.value })}
                placeholder={placeholderFor(it.kind)}
                rows={3}
                style={{
                  ...inputStyle,
                  minWidth: VALUE_MIN_WIDTH,
                  fontFamily: "ui-monospace, Menlo, Consolas, monospace",
                  fontSize: 12,
                  resize: "vertical",
                }}
              />
            ) : (
              <input
                aria-label={`${labelFor(it.kind)} ${i + 1}`}
                data-testid={`item-value-${i}`}
                value={it.value}
                onChange={(e) => updateAt(i, { value: e.target.value })}
                placeholder={placeholderFor(it.kind)}
                style={{ ...inputStyle, minWidth: VALUE_MIN_WIDTH }}
              />
            )}
            {anyUsesActionSlot && (
              <div style={actionSlotStyle}>
                {usesBrowse(it.kind) && (
                  <button
                    type="button"
                    data-testid={`item-browse-${i}`}
                    onClick={() => browse(i, it.kind)}
                    style={actionBtnStyle}
                  >
                    {t("settings.editor.browse")}
                  </button>
                )}
                {isApp(it.kind) && (
                  <button
                    type="button"
                    data-testid={`item-app-picker-${i}`}
                    title={t("settings.editor.appPickerHint")}
                    onClick={() => setAppPickerIndex(i)}
                    style={actionBtnStyle}
                  >
                    {t("settings.editor.appPickerButton")}
                  </button>
                )}
              </div>
            )}
            {usesOpenWith(it.kind) && (() => {
              const pool = installedApps ?? [];
              const filtered = it.kind === "url" ? pool.filter(isBrowser) : pool;
              return (
                <select
                  aria-label={`${t("settings.editor.openWithLabel")} ${i + 1}`}
                  data-testid={`item-open-with-${i}`}
                  value={it.openWith}
                  onChange={(e) => updateAt(i, { openWith: e.target.value })}
                  title={t("settings.editor.openWithHint")}
                  style={openWithStyle}
                >
                  <option value="">
                    {t("settings.editor.openWithDefault")}
                  </option>
                  {filtered.map((app) => (
                    <option key={`${app.value}-${app.path}`} value={app.value}>
                      {it.kind === "url" ? titleCase(app.name) : app.name}
                    </option>
                  ))}
                  {it.openWith !== "" &&
                    !filtered.some((a) => a.value === it.openWith) && (
                      <option value={it.openWith}>
                        {t("settings.editor.openWithCustom", { value: it.openWith })}
                      </option>
                    )}
                </select>
              );
            })()}
            {showMonitorSelect && monitors && (
              <select
                aria-label={`${t("settings.editor.monitorLabel")} ${i + 1}`}
                data-testid={`item-monitor-${i}`}
                title={t("settings.editor.monitorHint")}
                value={it.monitor ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  updateAt(i, { monitor: v === "" ? null : Number(v) });
                }}
                style={monitorSelectStyle}
              >
                <option value="">{t("settings.editor.monitorDefault")}</option>
                {monitors.map((m) => (
                  <option key={m.index} value={m.index}>
                    {m.name}
                    {m.primary ? t("settings.editor.monitorPrimarySuffix") : ""}
                  </option>
                ))}
              </select>
            )}
            {it.kind === "url" && (
              <label
                style={{
                  flex: "0 0 auto",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12,
                  color: "var(--muted)",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
                title={t("settings.editor.incognitoHint")}
              >
                <input
                  type="checkbox"
                  data-testid={`item-incognito-${i}`}
                  checked={!!it.incognito}
                  onChange={(e) => updateAt(i, { incognito: e.target.checked })}
                />
                {t("settings.editor.incognitoLabel")}
              </label>
            )}
            <button
              type="button"
              aria-label={t("settings.editor.removeItem")}
              data-testid={`item-remove-${i}`}
              onClick={() => removeAt(i)}
              style={removeBtn}
            >
              ✕
            </button>
          </div>
          {isScript(it.kind) && (
            <div
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                fontSize: 12,
                color: "var(--muted)",
                paddingLeft: 116,
                flexWrap: "wrap",
              }}
            >
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <input
                  type="checkbox"
                  data-testid={`item-script-trusted-${i}`}
                  checked={!!it.trusted}
                  onChange={(e) => updateAt(i, { trusted: e.target.checked })}
                />
                {t("settings.editor.scriptTrustedLabel")}
              </label>
              <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span>{t("settings.editor.scriptShellLabel")}:</span>
                <select
                  aria-label={`${t("settings.editor.scriptShellLabel")} ${i + 1}`}
                  data-testid={`item-script-shell-${i}`}
                  value={it.shell ?? ""}
                  onChange={(e) =>
                    updateAt(i, {
                      shell: e.target.value === "" ? null : e.target.value,
                    })
                  }
                  style={{
                    background: "var(--input-bg)",
                    color: "var(--fg)",
                    border: "1px solid var(--input-border)",
                    borderRadius: 4,
                    padding: "4px 6px",
                    font: "inherit",
                    fontSize: 12,
                  }}
                >
                  <option value="">
                    {t("settings.editor.scriptShellDefault")}
                  </option>
                  <option value="cmd">
                    {t("settings.editor.scriptShellOptionCmd")}
                  </option>
                  <option value="powershell">
                    {t("settings.editor.scriptShellOptionPowerShell")}
                  </option>
                  <option value="pwsh">
                    {t("settings.editor.scriptShellOptionPwsh")}
                  </option>
                  <option value="wsl">
                    {t("settings.editor.scriptShellOptionWsl")}
                  </option>
                  <option value="bash">
                    {t("settings.editor.scriptShellOptionBash")}
                  </option>
                  <option value="sh">
                    {t("settings.editor.scriptShellOptionSh")}
                  </option>
                  <option value="zsh">
                    {t("settings.editor.scriptShellOptionZsh")}
                  </option>
                </select>
              </label>
            </div>
          )}
        </div>
      ))}

      <AppPicker
        open={appPickerIndex !== null}
        onSelect={(name) => {
          if (appPickerIndex !== null) updateAt(appPickerIndex, { value: name });
        }}
        onClose={() => setAppPickerIndex(null)}
      />

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button
          type="button"
          data-testid="add-item-url"
          onClick={() => add("url")}
          style={addBtn}
        >
          + {t("settings.editor.addItemUrl")}
        </button>
        <button
          type="button"
          data-testid="add-item-file"
          onClick={() => add("file")}
          style={addBtn}
        >
          + {t("settings.editor.addItemFile")}
        </button>
        <button
          type="button"
          data-testid="add-item-folder"
          onClick={() => add("folder")}
          style={addBtn}
        >
          + {t("settings.editor.addItemFolder")}
        </button>
        <button
          type="button"
          data-testid="add-item-app"
          onClick={() => add("app")}
          style={addBtn}
        >
          + {t("settings.editor.addItemApp")}
        </button>
        <button
          type="button"
          data-testid="add-item-script"
          onClick={() => add("script")}
          style={addBtn}
        >
          + {t("settings.editor.addItemScript")}
        </button>
      </div>
    </div>
  );
};
