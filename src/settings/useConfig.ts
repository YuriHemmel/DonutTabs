import { useEffect, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { ipc, CONFIG_CHANGED_EVENT } from "../core/ipc";
import type { Config } from "../core/types/Config";
import type { Tab } from "../core/types/Tab";

export interface UseConfig {
  config: Config | null;
  loadError: unknown;
  saveTab: (tab: Tab) => Promise<Config>;
  deleteTab: (tabId: string) => Promise<Config>;
}

export function useConfig(): UseConfig {
  const [config, setConfig] = useState<Config | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);

  useEffect(() => {
    let disposed = false;
    ipc
      .getConfig()
      .then((c) => {
        if (!disposed) setConfig(c);
      })
      .catch((e) => {
        if (!disposed) setLoadError(e);
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<Config>(CONFIG_CHANGED_EVENT, (e) => {
      setConfig(e.payload);
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  const saveTab = useCallback(async (tab: Tab) => {
    const next = await ipc.saveTab(tab);
    setConfig(next);
    return next;
  }, []);

  const deleteTab = useCallback(async (tabId: string) => {
    const next = await ipc.deleteTab(tabId);
    setConfig(next);
    return next;
  }, []);

  return { config, loadError, saveTab, deleteTab };
}
