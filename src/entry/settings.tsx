import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import i18next from "i18next";
import { ipc } from "../core/ipc";
import { initI18n } from "../core/i18n";
import { SettingsApp } from "../settings/SettingsApp";
import type { Config } from "../core/types/Config";

async function bootstrap() {
  let language: Config["appearance"]["language"] = "auto";
  try {
    const cfg = await ipc.getConfig();
    language = cfg.appearance.language;
  } catch (e) {
    console.error("getConfig failed during settings bootstrap; using auto", e);
  }
  await initI18n(language);

  document.title = i18next.t("settings.title");

  createRoot(document.getElementById("root")!).render(
    <I18nextProvider i18n={i18next}>
      <SettingsApp />
    </I18nextProvider>,
  );
}

void bootstrap();
