import { invoke } from "@tauri-apps/api/core";
import { open as openDialog, save as saveDialog } from "@tauri-apps/plugin-dialog";
import type { Config } from "./types/Config";
import type { Tab } from "./types/Tab";
import type { Theme } from "./types/Theme";
import type { Language } from "./types/Language";
import type { FaviconResult } from "./types/FaviconResult";
import type { ImportResult } from "./types/ImportResult";
import type { ThemeOverrides } from "./types/ThemeOverrides";

export type SettingsIntent = "new-tab" | `edit-tab:${string}` | "new-profile";

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
  saveTab: (tab: Tab, profileId?: string) =>
    invoke<Config>("save_tab", { tab, profileId: profileId ?? null }),
  deleteTab: (tabId: string, profileId?: string) =>
    invoke<Config>("delete_tab", { tabId, profileId: profileId ?? null }),
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
  reorderTabs: (profileId: string, orderedIds: string[]) =>
    invoke<Config>("reorder_tabs", { profileId, orderedIds }),
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
