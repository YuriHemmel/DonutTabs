import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { TabList } from "./TabList";
import { TabEditor } from "./TabEditor";
import { useConfig } from "./useConfig";
import type { Tab } from "../core/types/Tab";

type Selection =
  | { mode: "empty" }
  | { mode: "new" }
  | { mode: "edit"; tabId: string };

export const SettingsApp: React.FC = () => {
  const { t } = useTranslation();
  const { config, saveTab, deleteTab } = useConfig();
  const [selection, setSelection] = useState<Selection>({ mode: "empty" });

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
    <div style={{ display: "flex", height: "100vh" }}>
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
            color: "#889",
            padding: 24,
            textAlign: "center",
          }}
        >
          {t("settings.tabs.selectPrompt")}
        </section>
      )}
    </div>
  );
};
