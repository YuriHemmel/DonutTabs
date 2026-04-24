import { useEffect, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { ipc, CONFIG_CHANGED_EVENT } from "../core/ipc";
import type { Config } from "../core/types/Config";
import type { Tab } from "../core/types/Tab";
import type { Theme } from "../core/types/Theme";
import type { Language } from "../core/types/Language";

export interface UseConfig {
  config: Config | null;
  loadError: unknown;
  saveTab: (tab: Tab) => Promise<Config>;
  deleteTab: (tabId: string) => Promise<Config>;
  setShortcut: (combo: string) => Promise<Config>;
  setTheme: (theme: Theme) => Promise<Config>;
  setLanguage: (language: Language) => Promise<Config>;
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

  const setShortcut = useCallback(async (combo: string) => {
    const next = await ipc.setShortcut(combo);
    setConfig(next);
    return next;
  }, []);

  const setTheme = useCallback(async (theme: Theme) => {
    const next = await ipc.setTheme(theme);
    setConfig(next);
    return next;
  }, []);

  const setLanguage = useCallback(async (language: Language) => {
    const next = await ipc.setLanguage(language);
    setConfig(next);
    return next;
  }, []);

  return {
    config,
    loadError,
    saveTab,
    deleteTab,
    setShortcut,
    setTheme,
    setLanguage,
  };
}
