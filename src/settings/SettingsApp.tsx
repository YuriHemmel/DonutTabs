import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { TabList } from "./TabList";
import { TabEditor } from "./TabEditor";
import { AppearanceSection } from "./AppearanceSection";
import { ShortcutSection } from "./ShortcutSection";
import { SectionTabs, type Section } from "./SectionTabs";
import { useConfig } from "./useConfig";
import { ipc, SETTINGS_INTENT_EVENT } from "../core/ipc";
import type { Tab } from "../core/types/Tab";

type Selection =
  | { mode: "empty" }
  | { mode: "new" }
  | { mode: "edit"; tabId: string };

function applyIntent(
  intent: string | null,
  setSection: (s: Section) => void,
  setSelection: (s: Selection) => void,
) {
  if (intent === "new-tab") {
    setSection("tabs");
    setSelection({ mode: "new" });
  }
}

export const SettingsApp: React.FC = () => {
  const { t } = useTranslation();
  const { config, saveTab, deleteTab, setShortcut, setTheme, setLanguage } = useConfig();
  const [section, setSection] = useState<Section>("tabs");
  const [selection, setSelection] = useState<Selection>({ mode: "empty" });

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<string>(SETTINGS_INTENT_EVENT, (e) => {
      applyIntent(e.payload, setSection, setSelection);
    }).then((fn) => {
      unlisten = fn;
      void ipc.consumeSettingsIntent().then((intent) => {
        applyIntent(intent, setSection, setSelection);
      });
    });
    return () => unlisten?.();
  }, []);

  if (!config) {
    return <div style={{ padding: 24 }}>…</div>;
  }

  const selectedTab: Tab | null =
    selection.mode === "edit"
      ? config.tabs.find((tab) => tab.id === selection.tabId) ?? null
      : null;

  const handleSave = async (tab: Tab) => {
    await saveTab(tab);
    setSelection({ mode: "edit", tabId: tab.id });
  };

  const handleDelete = async (tabId: string) => {
    await deleteTab(tabId);
    setSelection({ mode: "empty" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <SectionTabs active={section} onChange={setSection} />

      {section === "tabs" && (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <TabList
            tabs={config.tabs}
            selectedId={selection.mode === "edit" ? selection.tabId : null}
            onSelect={(id) => setSelection({ mode: "edit", tabId: id })}
            onAdd={() => setSelection({ mode: "new" })}
          />
          {selection.mode === "new" ? (
            <TabEditor
              mode="new"
              initial={null}
              onSave={handleSave}
              onCancel={() => setSelection({ mode: "empty" })}
              onDelete={handleDelete}
            />
          ) : selection.mode === "edit" && selectedTab ? (
            <TabEditor
              mode="edit"
              initial={selectedTab}
              onSave={handleSave}
              onCancel={() => setSelection({ mode: "empty" })}
              onDelete={handleDelete}
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
          theme={config.appearance.theme}
          language={config.appearance.language}
          onThemeChange={(theme) => {
            void setTheme(theme);
          }}
          onLanguageChange={(language) => {
            void setLanguage(language);
          }}
        />
      )}

      {section === "shortcut" && (
        <ShortcutSection
          current={config.shortcut}
          onCapture={async (combo) => {
            await setShortcut(combo);
          }}
        />
      )}
    </div>
  );
};
