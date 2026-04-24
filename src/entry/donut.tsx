import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Donut } from "../donut/Donut";
import { ipc } from "../core/ipc";
import type { Config } from "../core/types/Config";

const WINDOW_SIZE = 420;

function App() {
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    ipc.getConfig().then(setConfig).catch(console.error);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void ipc.hideDonut();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const w = getCurrentWindow();
    const unlisten = w.onFocusChanged(({ payload: focused }) => {
      if (!focused) void ipc.hideDonut();
    });
    return () => { void unlisten.then((fn) => fn()); };
  }, []);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) void ipc.hideDonut();
  };

  const handleSelect = async (tabId: string) => {
    try {
      await ipc.openTab(tabId);
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
        <Donut tabs={config.tabs} size={WINDOW_SIZE} onSelect={handleSelect} />
      )}
    </div>
  );
}

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
