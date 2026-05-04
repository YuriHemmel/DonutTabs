import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../core/i18n";
import { SystemSection } from "../SystemSection";
import type { Language } from "../../core/types/Language";

async function renderSection(overrides: Partial<{
  language: Language;
  onLanguageChange: (l: Language) => void;
  autostart: boolean;
  onAutostartChange: (e: boolean) => void;
  onExportConfig: () => void;
  onImportConfig: () => void;
  allowScripts: boolean;
  onAllowScriptsChange: (a: boolean) => void;
  autoCheckUpdates: boolean;
  onAutoCheckUpdatesChange: (e: boolean) => void;
  scriptHistoryEnabled: boolean;
  onScriptHistoryEnabledChange: (e: boolean) => void;
}> = {}) {
  const i18n = await createI18n("pt-BR");
  const props = {
    language: "auto" as Language,
    onLanguageChange: vi.fn(),
    autostart: false,
    onAutostartChange: vi.fn(),
    ...overrides,
  };
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <SystemSection {...props} />
    </I18nextProvider>,
  );
  return { ...utils, props };
}

describe("SystemSection", () => {
  it("pre-selects the current language in the select", async () => {
    await renderSection({ language: "en" });
    const select = screen.getByLabelText(/idioma/i) as HTMLSelectElement;
    expect(select.value).toBe("en");
  });

  it("calls onLanguageChange when a different language is selected", async () => {
    const user = userEvent.setup();
    const { props } = await renderSection({ language: "auto" });
    await user.selectOptions(screen.getByLabelText(/idioma/i), "ptBr");
    expect(props.onLanguageChange).toHaveBeenCalledWith("ptBr");
  });

  it("autostart checkbox reflects the current value", async () => {
    await renderSection({ autostart: true });
    const cb = screen.getByTestId("autostart-toggle") as HTMLInputElement;
    expect(cb.checked).toBe(true);
  });

  it("calls onAutostartChange when the checkbox is toggled", async () => {
    const user = userEvent.setup();
    const { props } = await renderSection({ autostart: false });
    await user.click(screen.getByTestId("autostart-toggle"));
    expect(props.onAutostartChange).toHaveBeenCalledWith(true);
  });

  it("does not render export/import buttons when callbacks are absent", async () => {
    await renderSection();
    expect(screen.queryByTestId("export-config")).toBeNull();
    expect(screen.queryByTestId("import-config")).toBeNull();
  });

  it("renders and invokes the export-config callback when clicked", async () => {
    const user = userEvent.setup();
    const onExportConfig = vi.fn();
    await renderSection({ onExportConfig });
    const btn = screen.getByTestId("export-config");
    await user.click(btn);
    expect(onExportConfig).toHaveBeenCalledTimes(1);
  });

  it("renders and invokes the import-config callback when clicked", async () => {
    const user = userEvent.setup();
    const onImportConfig = vi.fn();
    await renderSection({ onImportConfig });
    const btn = screen.getByTestId("import-config");
    await user.click(btn);
    expect(onImportConfig).toHaveBeenCalledTimes(1);
  });
});
