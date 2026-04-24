import { invoke } from "@tauri-apps/api/core";
import type { Config } from "./types/Config";
import type { Tab } from "./types/Tab";
import type { Theme } from "./types/Theme";
import type { Language } from "./types/Language";

export type SettingsIntent = "new-tab";

export const ipc = {
  getConfig: () => invoke<Config>("get_config"),
  openTab: (tabId: string) => invoke<void>("open_tab", { tabId }),
  hideDonut: () => invoke<void>("hide_donut"),
  saveTab: (tab: Tab) => invoke<Config>("save_tab", { tab }),
  deleteTab: (tabId: string) => invoke<Config>("delete_tab", { tabId }),
  openSettings: (intent?: SettingsIntent) =>
    invoke<void>("open_settings", { intent: intent ?? null }),
  consumeSettingsIntent: () => invoke<string | null>("consume_settings_intent"),
  closeSettings: () => invoke<void>("close_settings"),
  setShortcut: (combo: string) => invoke<Config>("set_shortcut", { combo }),
  setTheme: (theme: Theme) => invoke<Config>("set_theme", { theme }),
  setLanguage: (language: Language) => invoke<Config>("set_language", { language }),
};

export const CONFIG_CHANGED_EVENT = "config-changed";
export const SETTINGS_INTENT_EVENT = "settings-intent";
