import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import i18next from "i18next";
import { listen } from "@tauri-apps/api/event";
import { ipc, CONFIG_CHANGED_EVENT } from "../core/ipc";
import { initI18n, changeLanguage } from "../core/i18n";
import { applyTheme, watchSystemTheme } from "../core/theme";
import { SettingsApp } from "../settings/SettingsApp";
import type { Config } from "../core/types/Config";

let unwatchSystemTheme: () => void = () => {};

async function reactToConfig(cfg: Config) {
  await changeLanguage(cfg.appearance.language);
  document.title = i18next.t("settings.title");

  unwatchSystemTheme();
  applyTheme(cfg.appearance.theme);
  unwatchSystemTheme = watchSystemTheme(cfg.appearance.theme, () => {
    applyTheme(cfg.appearance.theme);
  });
}

async function bootstrap() {
  let cfg: Config | null = null;
  try {
    cfg = await ipc.getConfig();
  } catch (e) {
    console.error("getConfig failed during settings bootstrap; using defaults", e);
  }

  const language = cfg?.appearance.language ?? "auto";
  await initI18n(language);

  if (cfg) {
    document.title = i18next.t("settings.title");
    applyTheme(cfg.appearance.theme);
    unwatchSystemTheme = watchSystemTheme(cfg.appearance.theme, () => {
      applyTheme(cfg.appearance.theme);
    });
  }

  // Eventos de mudança: Rust emite `config-changed` em toda mutação.
  void listen<Config>(CONFIG_CHANGED_EVENT, (e) => {
    void reactToConfig(e.payload);
  });

  createRoot(document.getElementById("root")!).render(
    <I18nextProvider i18n={i18next}>
      <SettingsApp />
    </I18nextProvider>,
  );
}

void bootstrap();
