import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider, useTranslation } from "react-i18next";
import i18next from "i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { Donut } from "../donut/Donut";
import { ipc, CONFIG_CHANGED_EVENT } from "../core/ipc";
import { initI18n } from "../core/i18n";
import { translateAppError } from "../core/errors";
import type { Config } from "../core/types/Config";

const WINDOW_SIZE = 420;

function App({ initialConfig }: { initialConfig: Config | null }) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<Config | null>(initialConfig);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (config) return;
    ipc.getConfig().then(setConfig).catch(console.error);
  }, [config]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (errorMsg) {
          setErrorMsg(null);
          return;
        }
        void ipc.hideDonut();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [errorMsg]);

  useEffect(() => {
    const w = getCurrentWindow();
    const unlisten = w.onFocusChanged(({ payload: focused }) => {
      if (!focused) void ipc.hideDonut();
    });
    return () => {
      void unlisten.then((fn) => fn());
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

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) void ipc.hideDonut();
  };

  const handleSelect = async (tabId: string) => {
    try {
      await ipc.openTab(tabId);
      void ipc.hideDonut();
    } catch (err) {
      setErrorMsg(translateAppError(err, t));
    }
  };

  const handleOpenSettings = async () => {
    try {
      await ipc.openSettings();
    } finally {
      void ipc.hideDonut();
    }
  };

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        display: "grid",
        placeItems: "center",
        background: "transparent",
      }}
      onClick={handleBackdropClick}
    >
      {config && (
        <Donut
          tabs={config.tabs}
          size={WINDOW_SIZE}
          onSelect={handleSelect}
          onOpenSettings={handleOpenSettings}
        />
      )}
      {errorMsg && (
        <div
          role="alert"
          style={{
            position: "fixed",
            bottom: 16,
            left: "50%",
            transform: "translateX(-50%)",
            padding: "8px 14px",
            borderRadius: 8,
            background: "#3a1f24",
            color: "#fdd",
            border: "1px solid #884",
            maxWidth: "80vw",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span>{errorMsg}</span>
          <button
            onClick={() => setErrorMsg(null)}
            style={{
              background: "transparent",
              color: "#fdd",
              border: "1px solid #884",
              borderRadius: 4,
              padding: "2px 8px",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            {t("donut.toastDismiss")}
          </button>
        </div>
      )}
    </div>
  );
}

async function bootstrap() {
  let initialConfig: Config | null = null;
  let language: Config["appearance"]["language"] = "auto";
  try {
    initialConfig = await ipc.getConfig();
    language = initialConfig.appearance.language;
  } catch (e) {
    console.error("getConfig failed during i18n bootstrap; using auto", e);
  }
  await initI18n(language);

  const root = createRoot(document.getElementById("root")!);
  root.render(
    <I18nextProvider i18n={i18next}>
      <App initialConfig={initialConfig} />
    </I18nextProvider>,
  );
}

void bootstrap();
