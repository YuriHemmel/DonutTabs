import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { TabList } from "./TabList";
import { TabEditor } from "./TabEditor";
import { AppearanceSection } from "./AppearanceSection";
import { ShortcutSection } from "./ShortcutSection";
import { HistorySection } from "./HistorySection";
import { SectionTabs, type Section } from "./SectionTabs";
import { ProfilePicker } from "./ProfilePicker";
import { ProfileEditor } from "./ProfileEditor";
import { useConfig } from "./useConfig";
import { ipc, dialog, SETTINGS_INTENT_EVENT } from "../core/ipc";
import { translateAppError } from "../core/errors";
import type { Config } from "../core/types/Config";
import type { Profile } from "../core/types/Profile";
import type { Tab } from "../core/types/Tab";

type Selection =
  | { mode: "empty" }
  | { mode: "new"; parentPath?: string[]; suggestedKind?: "leaf" | "group" }
  | { mode: "edit"; tabId: string; parentPath?: string[] };

interface IntentTarget {
  section: Section;
  selection: Selection;
  selectedProfileId?: string;
  /** Quando `true`, dispara o fluxo de criação de perfil após aplicar o
   *  target. Usado pelo intent `new-profile` vindo do donut. */
  triggerCreateProfile?: boolean;
}

/**
 * Procura uma aba pela árvore de tabs do perfil. Retorna o path
 * (lista de ids dos pais) e o tab encontrado, ou `null` se não bater.
 */
function findTabPathInProfile(
  tabs: Tab[] | undefined,
  targetId: string,
  acc: string[] = [],
): { tab: Tab; path: string[] } | null {
  if (!tabs) return null;
  for (const tab of tabs) {
    if (tab.id === targetId) return { tab, path: acc };
    const inner = findTabPathInProfile(tab.children, targetId, [...acc, tab.id]);
    if (inner) return inner;
  }
  return null;
}

/**
 * Resolve um intent (`new-tab`, `edit-tab:<id>`, `new-profile`,
 * `new-tab-in-group:<csv>`) em uma mudança de seção/seleção. Para
 * `edit-tab:<id>`, busca a aba **recursivamente** em todos os perfis e
 * ajusta `selectedProfileId` para o perfil dono + `parentPath` para o
 * caminho de grupos até a aba. `new-tab-in-group:<csv>` carrega o path
 * de UUIDs separados por vírgula no qual o "+ slice" foi clicado.
 */
function resolveIntent(
  intent: string | null,
  config: Config | null,
): IntentTarget | null {
  if (intent === "new-tab") {
    return { section: "tabs", selection: { mode: "new" } };
  }
  if (intent === "new-profile") {
    return {
      section: "tabs",
      selection: { mode: "empty" },
      triggerCreateProfile: true,
    };
  }
  if (intent && intent.startsWith("new-tab-in-group:")) {
    const csv = intent.slice("new-tab-in-group:".length);
    const parentPath = csv.split(",").filter((s) => s.length > 0);
    return {
      section: "tabs",
      selection: { mode: "new", parentPath },
    };
  }
  if (intent && intent.startsWith("edit-tab:")) {
    const tabId = intent.slice("edit-tab:".length);
    if (!config) return null;
    for (const profile of config.profiles) {
      const found = findTabPathInProfile(profile.tabs, tabId);
      if (found) {
        return {
          section: "tabs",
          selection: { mode: "edit", tabId, parentPath: found.path },
          selectedProfileId: profile.id,
        };
      }
    }
  }
  return null;
}

export const SettingsApp: React.FC = () => {
  const { t } = useTranslation();
  const {
    config,
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
    setProfileAllowScripts,
    setProfileThemeOverrides,
    setAutoCheckUpdates,
    setScriptHistoryEnabled,
  } = useConfig();
  const [section, setSection] = useState<Section>("tabs");
  const [selection, setSelection] = useState<Selection>({ mode: "empty" });
  // Perfil sob edição. Default = ativo do config quando ele carrega.
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  // Painel `<ProfileEditor>` sobreposto. `null` = oculto.
  const [profileEditorMode, setProfileEditorMode] = useState<
    | null
    | { mode: "new" }
    | { mode: "edit"; profileId: string }
  >(null);

  const configRef = useRef<Config | null>(config);
  configRef.current = config;
  const pendingIntentRef = useRef<string | null>(null);
  // Ref para `handleCreateProfile` permite que `apply` (declarado antes)
  // dispare o fluxo de criação sem depender da ordem de declaração.
  const createProfileRef = useRef<() => void>(() => {});

  const apply = (target: IntentTarget) => {
    setSection(target.section);
    setSelection(target.selection);
    if (target.selectedProfileId) setSelectedProfileId(target.selectedProfileId);
    if (target.triggerCreateProfile) createProfileRef.current();
  };

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const handle = (intent: string | null) => {
      // Intents que dependem do config (lookup de aba/perfil) ou que abrem
      // prompt na UI (new-profile) ficam em buffer até o config carregar.
      const needsConfig =
        !!intent &&
        (intent.startsWith("edit-tab:") || intent === "new-profile");
      if (needsConfig && !configRef.current) {
        pendingIntentRef.current = intent;
        return;
      }
      const target = resolveIntent(intent, configRef.current);
      if (target) apply(target);
    };
    void listen<string>(SETTINGS_INTENT_EVENT, (e) => {
      handle(e.payload);
    }).then((fn) => {
      unlisten = fn;
      void ipc.consumeSettingsIntent().then(handle);
    });
    return () => unlisten?.();
  }, []);

  // Quando o config carrega, decide o `selectedProfileId` inicial:
  //   1) Se há intent pendente que resolve para um perfil específico, aplica.
  //   2) Caso contrário, default = perfil ativo.
  // Colapsado em um único effect pra evitar race entre "replay pending" e
  // "default to active" (a ordem de execução das effects dependentes de
  // `config` causaria o default sobrescrever o apply).
  useEffect(() => {
    if (!config) return;
    const pending = pendingIntentRef.current;
    if (pending) {
      pendingIntentRef.current = null;
      const target = resolveIntent(pending, config);
      if (target) {
        apply(target);
        return;
      }
    }
    if (selectedProfileId === null) {
      setSelectedProfileId(config.activeProfileId);
    }
  }, [config]);

  // Computado mesmo com `config` nulo para manter os hooks abaixo na ordem
  // estável (não pode haver early-return acima de `useCallback`).
  const effectiveProfileId = config
    ? selectedProfileId ?? config.activeProfileId
    : null;
  const selectedProfile: Profile | null = config
    ? config.profiles.find((p) => p.id === effectiveProfileId) ??
      config.profiles[0]
    : null;

  const handleReorderProfiles = useCallback(
    (orderedIds: string[]) => {
      reorderProfiles(orderedIds).catch((e) => {
        console.error("reorderProfiles failed", e);
      });
    },
    [reorderProfiles],
  );

  const handleReorderTabs = useCallback(
    (orderedIds: string[]) => {
      if (!selectedProfile) return;
      reorderTabs(selectedProfile.id, orderedIds).catch((e) => {
        console.error("reorderTabs failed", e);
      });
    },
    [reorderTabs, selectedProfile],
  );

  if (!config || !selectedProfile) {
    return <div style={{ padding: 24 }}>…</div>;
  }

  // Busca recursiva na árvore — necessária pra editar abas dentro de
  // sub-grupos.
  const selectedTab: Tab | null =
    selection.mode === "edit"
      ? findTabPathInProfile(selectedProfile.tabs, selection.tabId)?.tab ?? null
      : null;

  const currentParentPath: string[] | undefined =
    selection.mode === "new" || selection.mode === "edit"
      ? selection.parentPath
      : undefined;

  const handleSelectChild = (childId: string) => {
    if (selection.mode !== "edit") return;
    const extendedPath = [...(selection.parentPath ?? []), selection.tabId];
    setSelection({ mode: "edit", tabId: childId, parentPath: extendedPath });
  };

  const handleAddChild = (kind: "leaf" | "group") => {
    if (selection.mode !== "edit") return;
    const extendedPath = [...(selection.parentPath ?? []), selection.tabId];
    setSelection({ mode: "new", parentPath: extendedPath, suggestedKind: kind });
  };

  const currentDepth = (currentParentPath?.length ?? 0) + 1;

  const handleSave = async (tab: Tab) => {
    await saveTab(tab, selectedProfile.id, currentParentPath);
    setSelection({ mode: "edit", tabId: tab.id, parentPath: currentParentPath });
  };

  const handleDelete = async (tabId: string) => {
    await deleteTab(tabId, selectedProfile.id, currentParentPath);
    setSelection({ mode: "empty" });
  };

  const handleCreateProfile = () => {
    setProfileEditorMode({ mode: "new" });
  };
  createProfileRef.current = () => {
    handleCreateProfile();
  };

  const handleEditProfile = (profileId: string) => {
    setProfileEditorMode({ mode: "edit", profileId });
  };

  const handleProfileEditorSubmit = async ({
    name,
    icon,
  }: {
    name: string;
    icon: string | null;
  }) => {
    if (!profileEditorMode) return;
    if (profileEditorMode.mode === "new") {
      const newId = await createProfile(name, icon);
      setSelectedProfileId(newId);
    } else {
      // `updateProfile` espera `string` (não `null`); string vazia = limpa o ícone.
      await updateProfile(profileEditorMode.profileId, name, icon ?? "");
    }
    setProfileEditorMode(null);
  };

  const handleDeleteProfile = async (profileId: string) => {
    const target = config.profiles.find((p) => p.id === profileId);
    if (!target) return;
    const confirmed = window.confirm(
      t("settings.profile.confirmDelete", { name: target.name }) ??
        `Excluir perfil "${target.name}"?`,
    );
    if (!confirmed) return;
    try {
      await deleteProfile(profileId);
      // Se excluímos o selecionado, volta para o ativo (que o backend pode ter trocado).
      setSelectedProfileId(null);
    } catch (e) {
      console.error("deleteProfile failed", e);
    }
  };

  const profileEditorInitial: Profile | null =
    profileEditorMode?.mode === "edit"
      ? config.profiles.find((p) => p.id === profileEditorMode.profileId) ?? null
      : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <ProfilePicker
        profiles={config.profiles}
        selectedId={selectedProfile.id}
        activeId={config.activeProfileId}
        onSelect={(id) => {
          setSelectedProfileId(id);
          setSelection({ mode: "empty" });
        }}
        onCreate={handleCreateProfile}
        onEdit={handleEditProfile}
        onDelete={handleDeleteProfile}
        onReorder={handleReorderProfiles}
      />
      {profileEditorMode && (
        <ProfileEditor
          mode={profileEditorMode.mode}
          initial={profileEditorInitial}
          onSubmit={handleProfileEditorSubmit}
          onCancel={() => setProfileEditorMode(null)}
        />
      )}
      <SectionTabs active={section} onChange={setSection} />

      {section === "tabs" && (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <TabList
            tabs={selectedProfile.tabs}
            selectedId={selection.mode === "edit" ? selection.tabId : null}
            onSelect={(id) => setSelection({ mode: "edit", tabId: id })}
            onAdd={() => setSelection({ mode: "new" })}
            onReorder={handleReorderTabs}
          />
          {selection.mode === "new" ? (
            <TabEditor
              mode="new"
              initial={null}
              onSave={handleSave}
              onCancel={() => setSelection({ mode: "empty" })}
              onDelete={handleDelete}
              currentDepth={currentDepth}
              initialKind={selection.suggestedKind ?? "leaf"}
            />
          ) : selection.mode === "edit" && selectedTab ? (
            <TabEditor
              mode="edit"
              initial={selectedTab}
              onSave={handleSave}
              onCancel={() => setSelection({ mode: "empty" })}
              onDelete={handleDelete}
              currentDepth={currentDepth}
              onSelectChild={handleSelectChild}
              onAddChild={handleAddChild}
            />
          ) : (
            <section
              style={{
                flex: 1,
                display: "grid",
                placeItems: "center",
                color: "var(--muted)",
                padding: 24,
                textAlign: "center",
              }}
            >
              {t("settings.tabs.selectPrompt")}
            </section>
          )}
        </div>
      )}

      {section === "appearance" && (
        <AppearanceSection
          theme={selectedProfile.theme}
          language={config.appearance.language}
          autostart={config.system.autostart}
          onThemeChange={(theme) => {
            void setTheme(theme, selectedProfile.id);
          }}
          onLanguageChange={(language) => {
            void setLanguage(language);
          }}
          onAutostartChange={(enabled) => {
            void setAutostart(enabled);
          }}
          onExportConfig={() => {
            void (async () => {
              const path = await dialog.saveAs({
                defaultPath: "donuttabs-config.json",
                filters: [
                  { name: "DonutTabs config", extensions: ["json"] },
                ],
              });
              if (!path) return;
              try {
                await ipc.exportConfig(path);
                window.alert(t("settings.system.exportSuccess", { path }));
              } catch (err) {
                window.alert(translateAppError(err, t));
              }
            })();
          }}
          onImportConfig={() => {
            void (async () => {
              const path = await dialog.pickFile({
                filters: [
                  { name: "DonutTabs config", extensions: ["json"] },
                ],
              });
              if (!path) return;
              if (!window.confirm(t("settings.system.importConfirm"))) return;
              try {
                const result = await ipc.importConfig(path);
                if (!result.shortcutReconciled) {
                  window.alert(t("settings.system.importShortcutWarning"));
                }
              } catch (err) {
                window.alert(translateAppError(err, t));
              }
            })();
          }}
          onSetActiveProfile={
            selectedProfile.id !== config.activeProfileId
              ? () => {
                  void setActiveProfile(selectedProfile.id);
                }
              : undefined
          }
          allowScripts={selectedProfile.allowScripts}
          onAllowScriptsChange={(allow) => {
            void setProfileAllowScripts(selectedProfile.id, allow);
          }}
          themeOverrides={selectedProfile.themeOverrides}
          onThemeOverridesChange={(overrides) => {
            void setProfileThemeOverrides(selectedProfile.id, overrides);
          }}
          autoCheckUpdates={config.system.autoCheckUpdates}
          onAutoCheckUpdatesChange={(enabled) => {
            void setAutoCheckUpdates(enabled);
          }}
          scriptHistoryEnabled={config.system.scriptHistoryEnabled}
          onScriptHistoryEnabledChange={(enabled) => {
            void setScriptHistoryEnabled(enabled);
          }}
        />
      )}

      {section === "shortcut" && (
        <ShortcutSection
          current={selectedProfile.shortcut}
          onCapture={async (combo) => {
            await setShortcut(combo, selectedProfile.id);
          }}
          searchShortcut={config.interaction.searchShortcut}
          onCaptureSearchShortcut={async (combo) => {
            await setSearchShortcut(combo);
          }}
        />
      )}

      {section === "history" && (
        <HistorySection enabled={config.system.scriptHistoryEnabled} />
      )}
    </div>
  );
};
