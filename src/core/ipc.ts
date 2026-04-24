import { invoke } from "@tauri-apps/api/core";
import type { Config } from "./types/Config";
import type { Tab } from "./types/Tab";

export const ipc = {
  getConfig: () => invoke<Config>("get_config"),
  openTab: (tabId: string) => invoke<void>("open_tab", { tabId }),
  hideDonut: () => invoke<void>("hide_donut"),
  saveTab: (tab: Tab) => invoke<Config>("save_tab", { tab }),
  deleteTab: (tabId: string) => invoke<Config>("delete_tab", { tabId }),
  openSettings: () => invoke<void>("open_settings"),
  closeSettings: () => invoke<void>("close_settings"),
};

export const CONFIG_CHANGED_EVENT = "config-changed";
