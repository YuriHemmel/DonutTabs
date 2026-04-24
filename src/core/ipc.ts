import { invoke } from "@tauri-apps/api/core";
import type { Config } from "./types/Config";

export const ipc = {
  getConfig: () => invoke<Config>("get_config"),
  openTab: (tabId: string) => invoke<void>("open_tab", { tabId }),
  hideDonut: () => invoke<void>("hide_donut"),
};
