import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import i18next from "i18next";
import { listen } from "@tauri-apps/api/event";
import { ipc, CONFIG_CHANGED_EVENT } from "../core/ipc";
import { initI18n, changeLanguage } from "../core/i18n";
import { applyTheme, applyTokensAsCssVars, watchSystemTheme } from "../core/theme";
import { resolveThemeTokens } from "../core/themeTokens";
import { SettingsApp } from "../settings/SettingsApp";
import type { Config } from "../core/types/Config";
import type { Profile } from "../core/types/Profile";

let unwatchSystemTheme: () => void = () => {};

function activeProfile(cfg: Config): Profile | null {
  return cfg.profiles.find((p) => p.id === cfg.activeProfileId) ?? null;
}

function applyTokensFor(profile: Profile) {
  const tokens = resolveThemeTokens(profile.theme, profile.themeOverrides);
  applyTokensAsCssVars(tokens);
}

async function reactToConfig(cfg: Config) {
  await changeLanguage(cfg.appearance.language);
  document.title = i18next.t("settings.title");

  const profile = activeProfile(cfg);
  const theme = profile?.theme ?? "dark";
  unwatchSystemTheme();
  applyTheme(theme);
  if (profile) applyTokensFor(profile);
  unwatchSystemTheme = watchSystemTheme(theme, () => {
    applyTheme(theme);
    if (profile) applyTokensFor(profile);
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
    const profile = activeProfile(cfg);
    const theme = profile?.theme ?? "dark";
    applyTheme(theme);
    if (profile) applyTokensFor(profile);
    unwatchSystemTheme = watchSystemTheme(theme, () => {
      applyTheme(theme);
      if (profile) applyTokensFor(profile);
    });
  }

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
