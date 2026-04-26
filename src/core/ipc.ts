import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { Config } from "./types/Config";
import type { Tab } from "./types/Tab";
import type { Theme } from "./types/Theme";
import type { Language } from "./types/Language";
import type { FaviconResult } from "./types/FaviconResult";

export type SettingsIntent = "new-tab" | `edit-tab:${string}` | "new-profile";

export const ipc = {
  getConfig: () => invoke<Config>("get_config"),
  openTab: (tabId: string) => invoke<void>("open_tab", { tabId }),
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
};

/** Native file/folder picker wrappers. Return absolute path or `null` when
 *  the user cancels. Result is `string | null` (Tauri's `open` returns
 *  `string[]` only when `multiple: true`, which we don't use here). */
export const dialog = {
  pickFile: async (): Promise<string | null> => {
    const r = await openDialog({ multiple: false, directory: false });
    return typeof r === "string" ? r : null;
  },
  pickFolder: async (): Promise<string | null> => {
    const r = await openDialog({ multiple: false, directory: true });
    return typeof r === "string" ? r : null;
  },
};

export const CONFIG_CHANGED_EVENT = "config-changed";
export const SETTINGS_INTENT_EVENT = "settings-intent";
