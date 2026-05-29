import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../core/i18n";
import { Wizard, type WizardProps } from "../Wizard";

function makeProps(overrides: Partial<WizardProps> = {}): WizardProps {
  return {
    open: true,
    onClose: vi.fn(),
    onSectionChange: vi.fn(),
    shortcutDisplay: "CommandOrControl+Shift+Space",
    language: "auto",
    onLanguageChange: vi.fn(),
    autostart: false,
    onAutostartChange: vi.fn(),
    allowScripts: false,
    onAllowScriptsChange: vi.fn(),
    spawnPosition: "cursor",
    onSpawnPositionChange: vi.fn(),
    quickMode: false,
    onQuickModeChange: vi.fn(),
    ...overrides,
  };
}

async function renderWizard(overrides: Partial<WizardProps> = {}) {
  const props = makeProps(overrides);
  const i18n = await createI18n("en");
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <Wizard {...props} />
    </I18nextProvider>,
  );
  return { ...utils, props };
}

describe("Wizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("não renderiza nada quando open=false", () => {
    const { container } = render(<Wizard {...makeProps({ open: false })} />);
    expect(container.firstChild).toBeNull();
  });

  it("começa no passo welcome e sincroniza a seção bg pra tabs", async () => {
    const { props } = await renderWizard();
    expect(screen.getByTestId("wizard-card-welcome")).toBeTruthy();
    expect(props.onSectionChange).toHaveBeenCalledWith("tabs");
  });

  it("avança linearmente e dispara onSectionChange só pra section steps", async () => {
    const user = userEvent.setup();
    const { props } = await renderWizard();

    // welcome (section tabs) -> tabs (section tabs) -> demoCreateTab (demo)
    await user.click(screen.getByTestId("wizard-next"));
    expect(screen.getByTestId("wizard-card-tabs")).toBeTruthy();

    await user.click(screen.getByTestId("wizard-next"));
    expect(screen.getByTestId("wizard-card-demoCreateTab")).toBeTruthy();

    // section calls: welcome (tabs), tabs (tabs). demoCreateTab é demo,
    // não acrescenta. Total = 2.
    const sectionCalls = (props.onSectionChange as ReturnType<typeof vi.fn>).mock
      .calls;
    expect(sectionCalls).toEqual([["tabs"], ["tabs"]]);
  });

  it("Voltar disabled no primeiro passo", async () => {
    await renderWizard();
    expect(
      (screen.getByTestId("wizard-back") as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it("Pular abre confirmação e chama onClose ao confirmar", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    await renderWizard({ onClose });
    await user.click(screen.getByTestId("wizard-skip"));
    expect(screen.getByTestId("wizard-skip-confirm")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    await user.click(screen.getByTestId("wizard-skip-confirm-yes"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("último passo: Concluir chama onClose sem confirmação", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    await renderWizard({ onClose });
    // STEPS = 15 passos (0..14). Avança 14 vezes pra chegar em done.
    for (let i = 0; i < 14; i++) {
      await user.click(screen.getByTestId("wizard-next"));
    }
    expect(screen.getByTestId("wizard-card-done")).toBeTruthy();
    await user.click(screen.getByTestId("wizard-next"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("toggles de language/autostart/allowScripts no passo system", async () => {
    const user = userEvent.setup();
    const onLanguageChange = vi.fn();
    const onAutostartChange = vi.fn();
    const onAllowScriptsChange = vi.fn();
    await renderWizard({
      onLanguageChange,
      onAutostartChange,
      onAllowScriptsChange,
    });
    // system é índice 10: welcome(0)→tabs(1)→demoCreateTab(2)→demoSubdonuts(3)
    // →demoGroupInDonut(4)→profiles(5)→demoProfileSwitch(6)→appearance(7)
    // →shortcut(8)→demoSearchOverlay(9)→system(10).
    for (let i = 0; i < 10; i++) {
      await user.click(screen.getByTestId("wizard-next"));
    }
    expect(screen.getByTestId("wizard-card-system")).toBeTruthy();
    // Issue #106: o seletor do tutorial deve oferecer os 9 idiomas (não só auto/ptBr/en).
    const languageSelect = screen.getByTestId("wizard-language") as HTMLSelectElement;
    const optionValues = Array.from(languageSelect.options).map((o) => o.value);
    expect(optionValues).toEqual([
      "auto",
      "ptBr",
      "en",
      "es",
      "zh",
      "ja",
      "ru",
      "fr",
      "it",
    ]);
    await user.click(screen.getByTestId("wizard-autostart"));
    expect(onAutostartChange).toHaveBeenCalledWith(true);
    await user.click(screen.getByTestId("wizard-allow-scripts"));
    expect(onAllowScriptsChange).toHaveBeenCalledWith(true);
    await user.selectOptions(screen.getByTestId("wizard-language"), "en");
    expect(onLanguageChange).toHaveBeenCalledWith("en");
  });

  it("toggle de quickMode no demo dispara callback", async () => {
    const user = userEvent.setup();
    const onQuickModeChange = vi.fn();
    await renderWizard({ onQuickModeChange });
    // demoQuickMode é índice 11 (vem depois de system).
    for (let i = 0; i < 11; i++) {
      await user.click(screen.getByTestId("wizard-next"));
    }
    expect(screen.getByTestId("wizard-card-demoQuickMode")).toBeTruthy();
    await user.click(screen.getByTestId("wizard-quick-mode"));
    expect(onQuickModeChange).toHaveBeenCalledWith(true);
  });

  it("radio de spawnPosition dispara callback", async () => {
    const user = userEvent.setup();
    const onSpawnPositionChange = vi.fn();
    await renderWizard({ onSpawnPositionChange });
    // demoSpawnPosition é índice 12.
    for (let i = 0; i < 12; i++) {
      await user.click(screen.getByTestId("wizard-next"));
    }
    expect(screen.getByTestId("wizard-card-demoSpawnPosition")).toBeTruthy();
    await user.click(screen.getByTestId("wizard-spawn-center"));
    expect(onSpawnPositionChange).toHaveBeenCalledWith("center");
  });

  it("passo shortcut mostra o atalho atual", async () => {
    const user = userEvent.setup();
    await renderWizard({ shortcutDisplay: "Ctrl+Alt+D" });
    // shortcut é índice 8.
    for (let i = 0; i < 8; i++) {
      await user.click(screen.getByTestId("wizard-next"));
    }
    expect(screen.getByTestId("wizard-card-shortcut")).toBeTruthy();
    expect(screen.getByText("Ctrl+Alt+D")).toBeTruthy();
  });

  it("Esc dispara confirmação de pular", async () => {
    const user = userEvent.setup();
    await renderWizard();
    await user.keyboard("{Escape}");
    expect(screen.getByTestId("wizard-skip-confirm")).toBeTruthy();
  });

  it("Voltar retorna ao passo anterior e re-aplica section", async () => {
    const user = userEvent.setup();
    const onSectionChange = vi.fn();
    await renderWizard({ onSectionChange });
    // welcome → tabs → demoCreateTab
    await user.click(screen.getByTestId("wizard-next"));
    await user.click(screen.getByTestId("wizard-next"));
    onSectionChange.mockClear();
    await user.click(screen.getByTestId("wizard-back"));
    // Volta pra tabs (section step) — deve re-aplicar.
    expect(screen.getByTestId("wizard-card-tabs")).toBeTruthy();
    expect(onSectionChange).toHaveBeenCalledWith("tabs");
  });
});
