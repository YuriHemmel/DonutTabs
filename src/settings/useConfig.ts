import { useEffect, useState, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { ipc, CONFIG_CHANGED_EVENT } from "../core/ipc";
import type { Config } from "../core/types/Config";
import type { Tab } from "../core/types/Tab";
import type { Theme } from "../core/types/Theme";
import type { Language } from "../core/types/Language";
import type { ThemeOverrides } from "../core/types/ThemeOverrides";

export interface UseConfig {
  config: Config | null;
  loadError: unknown;
  saveTab: (tab: Tab, profileId?: string, parentPath?: string[]) => Promise<Config>;
  deleteTab: (
    tabId: string,
    profileId?: string,
    parentPath?: string[],
  ) => Promise<Config>;
  setShortcut: (combo: string, profileId?: string) => Promise<Config>;
  setTheme: (theme: Theme, profileId?: string) => Promise<Config>;
  setLanguage: (language: Language) => Promise<Config>;
  setActiveProfile: (profileId: string) => Promise<Config>;
  createProfile: (name: string, icon?: string | null) => Promise<string>;
  deleteProfile: (profileId: string) => Promise<Config>;
  updateProfile: (
    profileId: string,
    name?: string,
    icon?: string,
  ) => Promise<Config>;
  setAutostart: (enabled: boolean) => Promise<Config>;
  reorderTabs: (
    profileId: string,
    orderedIds: string[],
    parentPath?: string[],
  ) => Promise<Config>;
  reorderProfiles: (orderedIds: string[]) => Promise<Config>;
  setSearchShortcut: (combo: string) => Promise<Config>;
  setScriptTrusted: (
    profileId: string,
    tabId: string,
    itemIndex: number,
    expectedCommand: string,
    trusted: boolean,
  ) => Promise<Config>;
  setProfileAllowScripts: (profileId: string, allow: boolean) => Promise<Config>;
  setProfileThemeOverrides: (
    profileId: string,
    overrides: ThemeOverrides | null,
  ) => Promise<Config>;
  setAutoCheckUpdates: (enabled: boolean) => Promise<Config>;
  setScriptHistoryEnabled: (enabled: boolean) => Promise<Config>;
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

  const saveTab = useCallback(
    async (tab: Tab, profileId?: string, parentPath?: string[]) => {
      const next = await ipc.saveTab(tab, profileId, parentPath);
      setConfig(next);
      return next;
    },
    [],
  );

  const deleteTab = useCallback(
    async (tabId: string, profileId?: string, parentPath?: string[]) => {
      const next = await ipc.deleteTab(tabId, profileId, parentPath);
      setConfig(next);
      return next;
    },
    [],
  );

  const setShortcut = useCallback(async (combo: string, profileId?: string) => {
    const next = await ipc.setShortcut(combo, profileId);
    setConfig(next);
    return next;
  }, []);

  const setTheme = useCallback(async (theme: Theme, profileId?: string) => {
    const next = await ipc.setTheme(theme, profileId);
    setConfig(next);
    return next;
  }, []);

  const setLanguage = useCallback(async (language: Language) => {
    const next = await ipc.setLanguage(language);
    setConfig(next);
    return next;
  }, []);

  const setActiveProfile = useCallback(async (profileId: string) => {
    const next = await ipc.setActiveProfile(profileId);
    setConfig(next);
    return next;
  }, []);

  const createProfile = useCallback(
    async (name: string, icon?: string | null) => {
      const [next, newId] = await ipc.createProfile(name, icon ?? null);
      setConfig(next);
      return newId;
    },
    [],
  );

  const deleteProfile = useCallback(async (profileId: string) => {
    const next = await ipc.deleteProfile(profileId);
    setConfig(next);
    return next;
  }, []);

  const updateProfile = useCallback(
    async (profileId: string, name?: string, icon?: string) => {
      const next = await ipc.updateProfile(profileId, name, icon);
      setConfig(next);
      return next;
    },
    [],
  );

  const setAutostart = useCallback(async (enabled: boolean) => {
    const next = await ipc.setAutostart(enabled);
    setConfig(next);
    return next;
  }, []);

  const reorderTabs = useCallback(
    async (profileId: string, orderedIds: string[], parentPath?: string[]) => {
      const next = await ipc.reorderTabs(profileId, orderedIds, parentPath);
      setConfig(next);
      return next;
    },
    [],
  );

  const reorderProfiles = useCallback(async (orderedIds: string[]) => {
    const next = await ipc.reorderProfiles(orderedIds);
    setConfig(next);
    return next;
  }, []);

  const setSearchShortcut = useCallback(async (combo: string) => {
    const next = await ipc.setSearchShortcut(combo);
    setConfig(next);
    return next;
  }, []);

  const setScriptTrusted = useCallback(
    async (
      profileId: string,
      tabId: string,
      itemIndex: number,
      expectedCommand: string,
      trusted: boolean,
    ) => {
      const next = await ipc.setScriptTrusted(
        profileId,
        tabId,
        itemIndex,
        expectedCommand,
        trusted,
      );
      setConfig(next);
      return next;
    },
    [],
  );

  const setProfileAllowScripts = useCallback(
    async (profileId: string, allow: boolean) => {
      const next = await ipc.setProfileAllowScripts(profileId, allow);
      setConfig(next);
      return next;
    },
    [],
  );

  const setProfileThemeOverrides = useCallback(
    async (profileId: string, overrides: ThemeOverrides | null) => {
      const next = await ipc.setProfileThemeOverrides(profileId, overrides);
      setConfig(next);
      return next;
    },
    [],
  );

  const setAutoCheckUpdates = useCallback(async (enabled: boolean) => {
    const next = await ipc.setAutoCheckUpdates(enabled);
    setConfig(next);
    return next;
  }, []);

  const setScriptHistoryEnabled = useCallback(async (enabled: boolean) => {
    const next = await ipc.setScriptHistoryEnabled(enabled);
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
    setActiveProfile,
    createProfile,
    deleteProfile,
    updateProfile,
    setAutostart,
    reorderTabs,
    reorderProfiles,
    setSearchShortcut,
    setScriptTrusted,
    setProfileAllowScripts,
    setProfileThemeOverrides,
    setAutoCheckUpdates,
    setScriptHistoryEnabled,
  };
}
