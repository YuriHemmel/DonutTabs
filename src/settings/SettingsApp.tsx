import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { TabList } from "./TabList";
import { TabEditor } from "./TabEditor";
import { AppearanceSection } from "./AppearanceSection";
import { ShortcutSection } from "./ShortcutSection";
import { SystemSection } from "./SystemSection";
import { AboutSection } from "./AboutSection";
import { HistorySection } from "./HistorySection";
import { SectionTabs, type Section } from "./SectionTabs";
import { ProfilePicker } from "./ProfilePicker";
import { ProfilesSection, type ProfilesEditorMode } from "./ProfilesSection";
import { Wizard } from "./Wizard";
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
  /** Issue #39: o intent `new-profile` (donut) agora abre a seção dedicada
   *  "Perfis" com o editor já em modo "new". `null` = não toca no editor. */
  profileEditorMode?: ProfilesEditorMode;
  /** Issue #62: quando `true`, abre o Setup Wizard sobre a Settings. */
  openWizard?: boolean;
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
    // O "+" do donut sempre refere ao perfil ativo. Forçar o
    // selectedProfileId aqui evita que o Settings reaproveite o perfil
    // selecionado de uma sessão anterior (issue #23).
    return {
      section: "tabs",
      selection: { mode: "new" },
      selectedProfileId: config?.activeProfileId,
    };
  }
  if (intent === "new-profile") {
    return {
      section: "profiles",
      selection: { mode: "empty" },
      profileEditorMode: { mode: "new" },
    };
  }
  if (intent === "show-wizard") {
    // Wizard começa no passo 1 (welcome) cuja seção bg é "tabs". O próprio
    // componente vai sincronizar quando o user avançar.
    return {
      section: "tabs",
      selection: { mode: "empty" },
      openWizard: true,
    };
  }
  if (intent && intent.startsWith("new-tab-in-group:")) {
    const csv = intent.slice("new-tab-in-group:".length);
    const parentPath = csv.split(",").filter((s) => s.length > 0);
    return {
      section: "tabs",
      selection: { mode: "new", parentPath },
      selectedProfileId: config?.activeProfileId,
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
    setSettingsShortcut,
    setProfileAllowScripts,
    setProfileThemeOverrides,
    setAutoCheckUpdates,
    setScriptHistoryEnabled,
    setSpawnPosition,
    setQuickMode,
  } = useConfig();
  const [section, setSection] = useState<Section>("tabs");
  const [selection, setSelection] = useState<Selection>({ mode: "empty" });
  // Perfil sob edição. Default = ativo do config quando ele carrega.
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  // Issue #39 — estado do editor da seção "Perfis". Vive no SettingsApp
  // (não dentro de ProfilesSection) pra sobreviver à troca de seção e pra
  // que intents `new-profile` consigam abrir o editor já no mount.
  const [profileEditorMode, setProfileEditorMode] =
    useState<ProfilesEditorMode | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const configRef = useRef<Config | null>(config);
  configRef.current = config;
  const pendingIntentRef = useRef<string | null>(null);
  // Issue #76 — guarda o último `activeProfileId` visto para detectar
  // mudanças externas (donut, "definir como ativo" no Settings, import).
  // `null` antes do primeiro config carregar; sincronizado pelo effect
  // abaixo.
  const prevActiveProfileIdRef = useRef<string | null>(null);

  const apply = (target: IntentTarget) => {
    setSection(target.section);
    setSelection(target.selection);
    if (target.selectedProfileId) setSelectedProfileId(target.selectedProfileId);
    if (target.profileEditorMode) setProfileEditorMode(target.profileEditorMode);
    if (target.openWizard) setWizardOpen(true);
  };

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const handle = (intent: string | null) => {
      // Intents que dependem do config (lookup de aba/perfil, resolução do
      // perfil ativo) ou que abrem prompt na UI (new-profile) ficam em
      // buffer até o config carregar. `new-tab` e `new-tab-in-group:`
      // precisam do config pra resolver `activeProfileId` (issue #23).
      const needsConfig =
        !!intent &&
        (intent.startsWith("edit-tab:") ||
          intent === "new-profile" ||
          intent === "new-tab" ||
          intent.startsWith("new-tab-in-group:"));
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
        prevActiveProfileIdRef.current = config.activeProfileId;
        return;
      }
    }
    // Issue #76 — quando o perfil ativo muda externamente (donut, botão
    // "definir como ativo", import), retargeta o editor pro novo ativo
    // pra que a seção "Abas" mostre as abas certas. Usuário ainda pode
    // selecionar manualmente outro perfil no picker depois — só sobrescreve
    // quando `activeProfileId` realmente muda entre snapshots.
    const prev = prevActiveProfileIdRef.current;
    const next = config.activeProfileId;
    if (prev !== null && prev !== next) {
      setSelectedProfileId(next);
      setSelection({ mode: "empty" });
    } else if (selectedProfileId === null) {
      setSelectedProfileId(next);
    }
    prevActiveProfileIdRef.current = next;
  }, [config]);

  // Issue #39 — se o perfil sob edição sumiu do config (ex: outra janela
  // o excluiu via config-changed), fecha o editor pra evitar render com
  // `initial=null` em mode=edit. Delete local já zera no `handleDeleteProfile`;
  // este effect é o safety net pra mutações externas.
  useEffect(() => {
    if (!config) return;
    if (profileEditorMode?.mode !== "edit") return;
    const exists = config.profiles.some(
      (p) => p.id === profileEditorMode.profileId,
    );
    if (!exists) setProfileEditorMode(null);
  }, [config, profileEditorMode]);

  // Issue #54 (rev) — quando o toggle de histórico desliga (aqui ou em
  // outra janela via CONFIG_CHANGED_EVENT), tira o usuário da aba caso
  // ele esteja nela; evita ficar numa aba que sumiu do nav.
  useEffect(() => {
    if (!config) return;
    if (!config.system.scriptHistoryEnabled && section === "history") {
      setSection("system");
    }
  }, [config, section]);

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
      // Se excluímos o selecionado, volta para o ativo (que o backend pode
      // ter trocado).
      setSelectedProfileId(null);
      setProfileEditorMode(null);
    } catch (e) {
      console.error("deleteProfile failed", e);
    }
  };

  const handleSetActiveFromEditor = (profileId: string) => {
    void setActiveProfile(profileId);
  };

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
        onReorder={handleReorderProfiles}
        onActivate={(id) => {
          // Issue #51 — duplo-clique: seleciona perfil e abre direto a seção Abas.
          setSelectedProfileId(id);
          setSelection({ mode: "empty" });
          setSection("tabs");
        }}
      />
      <SectionTabs
        active={section}
        onChange={setSection}
        showHistory={config.system.scriptHistoryEnabled}
      />

      {section === "tabs" && (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <TabList
            tabs={selectedProfile.tabs}
            selectedId={selection.mode === "edit" ? selection.tabId : null}
            onSelect={(id, parentPath) =>
              setSelection({ mode: "edit", tabId: id, parentPath })
            }
            onAdd={(parentPath, kind) =>
              setSelection({
                mode: "new",
                parentPath,
                suggestedKind: kind,
              })
            }
            onReorder={(parentPath, orderedIds) => {
              if (parentPath.length === 0) {
                handleReorderTabs(orderedIds);
              } else {
                reorderTabs(selectedProfile.id, orderedIds, parentPath).catch(
                  (e) => {
                    console.error("reorderTabs failed", e);
                  },
                );
              }
            }}
            maxDepth={2}
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

      {section === "profiles" && (
        <ProfilesSection
          profiles={config.profiles}
          activeId={config.activeProfileId}
          editorMode={profileEditorMode}
          onOpenNew={() => setProfileEditorMode({ mode: "new" })}
          onOpenEdit={(profileId) =>
            setProfileEditorMode({ mode: "edit", profileId })
          }
          onCloseEditor={() => setProfileEditorMode(null)}
          onSubmit={handleProfileEditorSubmit}
          onDelete={handleDeleteProfile}
          onSetActive={handleSetActiveFromEditor}
        />
      )}

      {section === "appearance" && (
        <AppearanceSection
          theme={selectedProfile.theme}
          onThemeChange={(theme) => {
            void setTheme(theme, selectedProfile.id);
          }}
          onSetActiveProfile={
            selectedProfile.id !== config.activeProfileId
              ? () => {
                  void setActiveProfile(selectedProfile.id);
                }
              : undefined
          }
          themeOverrides={selectedProfile.themeOverrides}
          onThemeOverridesChange={(overrides) => {
            void setProfileThemeOverrides(selectedProfile.id, overrides);
          }}
          sliceGapEnabled={config.interaction.sliceGapEnabled}
          onSliceGapEnabledChange={(enabled) => {
            void ipc.setSliceGapEnabled(enabled).catch((err) => {
              window.alert(translateAppError(err, t));
            });
          }}
        />
      )}

      {section === "system" && (
        <SystemSection
          language={config.appearance.language}
          onLanguageChange={(language) => {
            void setLanguage(language);
          }}
          autostart={config.system.autostart}
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
          allowScripts={selectedProfile.allowScripts}
          onAllowScriptsChange={(allow) => {
            void setProfileAllowScripts(selectedProfile.id, allow);
          }}
          scriptHistoryEnabled={config.system.scriptHistoryEnabled}
          onScriptHistoryEnabledChange={(enabled) => {
            void setScriptHistoryEnabled(enabled);
          }}
          spawnPosition={config.interaction.spawnPosition}
          onSpawnPositionChange={(position) => {
            void setSpawnPosition(position);
          }}
          quickMode={config.interaction.quickMode}
          onQuickModeChange={(enabled) => {
            void setQuickMode(enabled).catch((err) => {
              window.alert(translateAppError(err, t));
            });
          }}
          onReopenWizard={() => {
            // Issue #62 — abre o wizard imediatamente. Flag de
            // `first_launch_completed` é setado pra true apenas quando o
            // user conclui/pula o wizard (em onClose abaixo).
            setWizardOpen(true);
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
          settingsShortcut={config.interaction.settingsShortcut}
          onCaptureSettingsShortcut={async (combo) => {
            await setSettingsShortcut(combo);
          }}
        />
      )}

      {section === "history" && config.system.scriptHistoryEnabled && (
        <HistorySection enabled={config.system.scriptHistoryEnabled} />
      )}

      {section === "about" && (
        <AboutSection
          autoCheckUpdates={config.system.autoCheckUpdates}
          onAutoCheckUpdatesChange={(enabled) => {
            void setAutoCheckUpdates(enabled);
          }}
        />
      )}

      <Wizard
        open={wizardOpen}
        onClose={() => {
          setWizardOpen(false);
          // Persiste a conclusão. Falha em disco vira alerta — sem ela o
          // wizard reabriria toda manual launch.
          ipc.setFirstLaunchCompleted(true).catch((e) => {
            window.alert(translateAppError(e, t));
          });
        }}
        onSectionChange={setSection}
        shortcutDisplay={selectedProfile.shortcut}
        language={config.appearance.language}
        onLanguageChange={(lang) => {
          void setLanguage(lang);
        }}
        autostart={config.system.autostart}
        onAutostartChange={(enabled) => {
          void setAutostart(enabled);
        }}
        allowScripts={selectedProfile.allowScripts}
        onAllowScriptsChange={(allow) => {
          void setProfileAllowScripts(selectedProfile.id, allow);
        }}
        spawnPosition={config.interaction.spawnPosition}
        onSpawnPositionChange={(pos) => {
          void setSpawnPosition(pos);
        }}
        quickMode={config.interaction.quickMode}
        onQuickModeChange={(enabled) => {
          void setQuickMode(enabled).catch((err) => {
            window.alert(translateAppError(err, t));
          });
        }}
      />
    </div>
  );
};
