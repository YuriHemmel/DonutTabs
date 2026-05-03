import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import type { Config } from "./types/Config";
import type { Tab } from "./types/Tab";
import type { Theme } from "./types/Theme";
import type { Language } from "./types/Language";
import type { FaviconResult } from "./types/FaviconResult";
import type { ImportResult } from "./types/ImportResult";
import type { InstalledApp } from "./types/InstalledApp";
import type { ThemeOverrides } from "./types/ThemeOverrides";
import type { UpdateSummary } from "./types/UpdateSummary";
import type { ScriptRun } from "./types/ScriptRun";
import type { ScriptRunSummary } from "./types/ScriptRunSummary";
import type { ScriptStream } from "./types/ScriptStream";

export type SettingsIntent =
  | "new-tab"
  | `edit-tab:${string}`
  | "new-profile"
  | `new-tab-in-group:${string}`;

export const ipc = {
  getConfig: () => invoke<Config>("get_config"),
  /** `forceItemIndex`: índice do Script untrusted que o user acabou de
   *  confirmar via `<ScriptConfirmModal>` (one-shot). Bypassa o trust-check
   *  só desse índice — qualquer outro script untrusted no tab segue
   *  bloqueando, e o modal reabre na próxima iteração. `allow_scripts`
   *  continua bloqueando. */
  openTab: (tabId: string, forceItemIndex?: number) =>
    invoke<void>("open_tab", {
      tabId,
      forceItemIndex: forceItemIndex ?? null,
    }),
  hideDonut: () => invoke<void>("hide_donut"),
  saveTab: (tab: Tab, profileId?: string, parentPath?: string[]) =>
    invoke<Config>("save_tab", {
      tab,
      profileId: profileId ?? null,
      parentPath: parentPath ?? null,
    }),
  deleteTab: (tabId: string, profileId?: string, parentPath?: string[]) =>
    invoke<Config>("delete_tab", {
      tabId,
      profileId: profileId ?? null,
      parentPath: parentPath ?? null,
    }),
  openSettings: (intent?: SettingsIntent) =>
    invoke<void>("open_settings", { intent: intent ?? null }),
  consumeSettingsIntent: () => invoke<string | null>("consume_settings_intent"),
  closeSettings: () => invoke<void>("close_settings"),
  setShortcut: (combo: string, profileId?: string) =>
    invoke<Config>("set_shortcut", { combo, profileId: profileId ?? null }),
  setTheme: (theme: Theme, profileId?: string) =>
    invoke<Config>("set_theme", { theme, profileId: profileId ?? null }),
  setLanguage: (language: Language) => invoke<Config>("set_language", { language }),
  setActiveProfile: (profileId: string) =>
    invoke<Config>("set_active_profile", { profileId }),
  createProfile: (name: string, icon?: string | null) =>
    invoke<[Config, string]>("create_profile", { name, icon: icon ?? null }),
  deleteProfile: (profileId: string) =>
    invoke<Config>("delete_profile", { profileId }),
  updateProfile: (profileId: string, name?: string, icon?: string) =>
    invoke<Config>("update_profile", {
      profileId,
      name: name ?? null,
      // `undefined` → não tocar, `""` → zera o ícone, string normal → seta
      icon: icon === undefined ? null : icon,
    }),
  setAutostart: (enabled: boolean) =>
    invoke<Config>("set_autostart", { enabled }),
  reorderTabs: (profileId: string, orderedIds: string[], parentPath?: string[]) =>
    invoke<Config>("reorder_tabs", {
      profileId,
      orderedIds,
      parentPath: parentPath ?? null,
    }),
  reorderProfiles: (orderedIds: string[]) =>
    invoke<Config>("reorder_profiles", { orderedIds }),
  fetchFavicon: (url: string) => invoke<FaviconResult>("fetch_favicon", { url }),
  exportConfig: (targetPath: string) =>
    invoke<void>("export_config", { targetPath }),
  importConfig: (sourcePath: string) =>
    invoke<ImportResult>("import_config", { sourcePath }),
  setSearchShortcut: (combo: string) =>
    invoke<Config>("set_search_shortcut", { combo }),
  /** `expectedCommand`: comando que o user viu no modal. Backend rejeita com
   *  `script_command_mismatch` se o item foi editado por outra janela entre
   *  o modal abrir e o user confirmar — evita autorizar comando que o user
   *  não autorizou. */
  setScriptTrusted: (
    profileId: string,
    tabId: string,
    itemIndex: number,
    expectedCommand: string,
    trusted: boolean,
  ) =>
    invoke<Config>("set_script_trusted", {
      profileId,
      tabId,
      itemIndex,
      expectedCommand,
      trusted,
    }),
  setProfileAllowScripts: (profileId: string, allow: boolean) =>
    invoke<Config>("set_profile_allow_scripts", { profileId, allow }),
  /** Plano 15 — substitui (ou limpa, com `null`) os overrides cosméticos do
   *  perfil indicado. Validate roda no backend; payloads inválidos voltam
   *  como `AppError` de config sem persistir. */
  setProfileThemeOverrides: (profileId: string, overrides: ThemeOverrides | null) =>
    invoke<Config>("set_profile_theme_overrides", {
      profileId,
      overrides,
    }),
  /** Plano 17 — devolve a lista de apps instalados no SO (cross-OS via
   *  `apps_picker/`). Read-only; não toca config. */
  listInstalledApps: () => invoke<InstalledApp[]>("list_installed_apps"),
  /** Plano 18 — verifica disponibilidade de update. `force=true` ignora o
   *  gate `should_notify` (usado pelo botão "Verificar agora"). `force=false`
   *  retorna `null` se a versão remota já foi notificada antes. */
  checkForUpdates: (force: boolean) =>
    invoke<UpdateSummary | null>("check_for_updates", { force }),
  /** Plano 18 — entrega o `UpdateSummary` populado pelo task de startup,
   *  sem disparar nova chamada de rede. */
  getPendingUpdate: () => invoke<UpdateSummary | null>("get_pending_update"),
  /** Plano 18 — baixa + instala + reinicia. Promise pode nunca resolver
   *  (relaunch). Frontend deve subscrever `UPDATE_PROGRESS_EVENT` antes. */
  installUpdate: () => invoke<void>("install_update"),
  setAutoCheckUpdates: (enabled: boolean) =>
    invoke<Config>("set_auto_check_updates", { enabled }),
  /** Plano 19 — lista runs do buffer in-memory (mais nova primeiro). */
  listScriptRuns: () => invoke<ScriptRunSummary[]>("list_script_runs"),
  /** Plano 19 — entrega run completa com stdout/stderr ou `null` se foi
   *  evictada. */
  getScriptRun: (id: string) =>
    invoke<ScriptRun | null>("get_script_run", { id }),
  /** Plano 19 — esvazia o buffer. Runs em curso seguem rodando mas saída
   *  futura é descartada (run não está mais no buffer). */
  clearScriptRuns: () => invoke<void>("clear_script_runs"),
  /** Plano 19 — mata o child process correspondente e marca run como
   *  Cancelled. Retorna `false` se id não existe ou já estava terminal. */
  cancelScriptRun: (id: string) =>
    invoke<boolean>("cancel_script_run", { id }),
  /** Plano 19 — toggle global da captura. Quando `false`, scripts voltam
   *  ao fire-and-forget Plano-14. */
  setScriptHistoryEnabled: (enabled: boolean) =>
    invoke<Config>("set_script_history_enabled", { enabled }),
};

export interface DialogFilter {
  name: string;
  extensions: string[];
}

export interface SaveAsOptions {
  defaultPath?: string;
  filters?: DialogFilter[];
}

export interface PickFileOptions {
  filters?: DialogFilter[];
}

/** Native file/folder picker wrappers. Return absolute path or `null` when
 *  the user cancels. Result is `string | null` (Tauri's `open` returns
 *  `string[]` only when `multiple: true`, which we don't use here). */
export const dialog = {
  pickFile: async (opts: PickFileOptions = {}): Promise<string | null> => {
    const r = await openDialog({
      multiple: false,
      directory: false,
      filters: opts.filters,
    });
    return typeof r === "string" ? r : null;
  },
  pickFolder: async (): Promise<string | null> => {
    const r = await openDialog({ multiple: false, directory: true });
    return typeof r === "string" ? r : null;
  },
  saveAs: async (opts: SaveAsOptions = {}): Promise<string | null> => {
    const r = await saveDialog(opts);
    return typeof r === "string" ? r : null;
  },
};

export const CONFIG_CHANGED_EVENT = "config-changed";
export const SETTINGS_INTENT_EVENT = "settings-intent";
export const UPDATE_PROGRESS_EVENT = "update-progress";

export interface UpdateProgress {
  downloaded: number;
  total: number | null;
}

export const SCRIPT_RUN_STARTED_EVENT = "script-run-started";
export const SCRIPT_RUN_OUTPUT_EVENT = "script-run-output";
export const SCRIPT_RUN_FINISHED_EVENT = "script-run-finished";

export interface ScriptOutputPayload {
  runId: string;
  stream: ScriptStream;
  chunk: string;
}
