import { invoke } from "@tauri-apps/api/core";
import type { Config } from "./types/Config";
import type { Tab } from "./types/Tab";
import type { Theme } from "./types/Theme";
import type { Language } from "./types/Language";

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
};

export const CONFIG_CHANGED_EVENT = "config-changed";
export const SETTINGS_INTENT_EVENT = "settings-intent";
