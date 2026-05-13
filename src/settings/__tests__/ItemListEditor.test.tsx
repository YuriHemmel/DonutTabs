import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../core/i18n";
import { ItemListEditor, type ItemDraft } from "../ItemListEditor";

vi.mock("../../core/ipc", () => ({
  dialog: {
    pickFile: vi.fn(),
    pickFolder: vi.fn(),
  },
  ipc: {
    listInstalledApps: vi.fn().mockResolvedValue([
      { name: "Firefox", value: "Firefox", path: "/Applications/Firefox.app" },
      { name: "VSCode", value: "/usr/local/bin/code", path: "/usr/local/bin/code" },
    ]),
    // Plano 21 — default mock = single monitor (esconde o select).
    // Tests que precisam mostrar o select usam `monitorsOverride` direto.
    listMonitors: vi.fn().mockResolvedValue([
      { name: "Tela 1", index: 0, x: 0, y: 0, width: 1920, height: 1080, primary: true },
    ]),
  },
}));

import { dialog, ipc } from "../../core/ipc";

beforeEach(() => {
  vi.clearAllMocks();
});

async function renderEditor(
  values: ItemDraft[],
  monitorsOverride?: Parameters<typeof ItemListEditor>[0]["monitorsOverride"],
) {
  const i18n = await createI18n("pt-BR");
  const onChange = vi.fn();
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <ItemListEditor
        values={values}
        onChange={onChange}
        monitorsOverride={monitorsOverride}
      />
    </I18nextProvider>,
  );
  return { ...utils, onChange };
}

describe("ItemListEditor", () => {
  it("renders one row per item with the right kind selected", async () => {
    await renderEditor([
      { kind: "url", value: "https://a", openWith: "" },
      { kind: "file", value: "/tmp/x", openWith: "" },
      { kind: "folder", value: "/tmp", openWith: "" },
    ]);
    expect(
      (screen.getByTestId("item-kind-0") as HTMLSelectElement).value,
    ).toBe("url");
    expect(
      (screen.getByTestId("item-kind-1") as HTMLSelectElement).value,
    ).toBe("file");
    expect(
      (screen.getByTestId("item-kind-2") as HTMLSelectElement).value,
    ).toBe("folder");
  });

  it("only shows the Browse button for file/folder rows", async () => {
    await renderEditor([
      { kind: "url", value: "", openWith: "" },
      { kind: "file", value: "", openWith: "" },
      { kind: "folder", value: "", openWith: "" },
    ]);
    expect(screen.queryByTestId("item-browse-0")).toBeNull();
    expect(screen.getByTestId("item-browse-1")).toBeTruthy();
    expect(screen.getByTestId("item-browse-2")).toBeTruthy();
  });

  it("preserves the input value when switching kind", async () => {
    const { onChange } = await renderEditor([
      { kind: "url", value: "https://keepme", openWith: "" },
    ]);
    fireEvent.change(screen.getByTestId("item-kind-0"), {
      target: { value: "file" },
    });
    expect(onChange).toHaveBeenCalledWith([
      { kind: "file", value: "https://keepme", openWith: "" },
    ]);
  });

  it("typing in the value input emits onChange with the new value", async () => {
    const user = userEvent.setup();
    const { onChange } = await renderEditor([
      { kind: "file", value: "", openWith: "" },
    ]);
    const input = screen.getByTestId("item-value-0");
    await user.type(input, "x");
    expect(onChange).toHaveBeenLastCalledWith([
      { kind: "file", value: "x", openWith: "" },
    ]);
  });

  it("remove drops the row from values", async () => {
    const { onChange } = await renderEditor([
      { kind: "url", value: "a", openWith: "" },
      { kind: "url", value: "b", openWith: "" },
    ]);
    fireEvent.click(screen.getByTestId("item-remove-0"));
    expect(onChange).toHaveBeenCalledWith([
      { kind: "url", value: "b", openWith: "" },
    ]);
  });

  it("'+ Adicionar arquivo' appends a file row with empty value and openWith", async () => {
    const { onChange } = await renderEditor([
      { kind: "url", value: "https://a", openWith: "" },
    ]);
    fireEvent.click(screen.getByTestId("add-item-file"));
    expect(onChange).toHaveBeenCalledWith([
      { kind: "url", value: "https://a", openWith: "" },
      { kind: "file", value: "", openWith: "" },
    ]);
  });

  it("Browse on file row calls dialog.pickFile and writes the returned path", async () => {
    (dialog.pickFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      "C:/picked.pdf",
    );
    const { onChange } = await renderEditor([
      { kind: "file", value: "", openWith: "" },
    ]);
    fireEvent.click(screen.getByTestId("item-browse-0"));
    await Promise.resolve();
    await Promise.resolve();
    expect(dialog.pickFile).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith([
      { kind: "file", value: "C:/picked.pdf", openWith: "" },
    ]);
  });

  it("Browse on folder row calls dialog.pickFolder", async () => {
    (
      dialog.pickFolder as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue("/picked/dir");
    const { onChange } = await renderEditor([
      { kind: "folder", value: "", openWith: "" },
    ]);
    fireEvent.click(screen.getByTestId("item-browse-0"));
    await Promise.resolve();
    await Promise.resolve();
    expect(dialog.pickFolder).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith([
      { kind: "folder", value: "/picked/dir", openWith: "" },
    ]);
  });

  it("Browse cancel (null) does not change the value", async () => {
    (dialog.pickFile as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    const { onChange } = await renderEditor([
      { kind: "file", value: "old", openWith: "" },
    ]);
    fireEvent.click(screen.getByTestId("item-browse-0"));
    await Promise.resolve();
    await Promise.resolve();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders an openWith input on every row regardless of kind", async () => {
    await renderEditor([
      { kind: "url", value: "https://a", openWith: "" },
      { kind: "file", value: "/tmp/x", openWith: "" },
      { kind: "folder", value: "/tmp", openWith: "" },
    ]);
    expect(screen.getByTestId("item-open-with-0")).toBeTruthy();
    expect(screen.getByTestId("item-open-with-1")).toBeTruthy();
    expect(screen.getByTestId("item-open-with-2")).toBeTruthy();
  });

  it("Issue #45 — selecting an installed app from openWith dropdown emits onChange", async () => {
    const { onChange } = await renderEditor([
      { kind: "url", value: "https://a", openWith: "" },
    ]);
    // Aguarda o fetch dos apps instalados (mock async via ipc.listInstalledApps).
    await screen.findByRole("option", { name: "Firefox" });
    fireEvent.change(screen.getByTestId("item-open-with-0"), {
      target: { value: "Firefox" },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      { kind: "url", value: "https://a", openWith: "Firefox" },
    ]);
  });

  it("Issue #45 — picking the default option clears openWith to empty string", async () => {
    const { onChange } = await renderEditor([
      { kind: "url", value: "https://a", openWith: "Firefox" },
    ]);
    await screen.findByRole("option", { name: "Firefox" });
    fireEvent.change(screen.getByTestId("item-open-with-0"), {
      target: { value: "" },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      { kind: "url", value: "https://a", openWith: "" },
    ]);
  });

  it("renders a header row with column labels when values is non-empty", async () => {
    await renderEditor([{ kind: "url", value: "https://a", openWith: "" }]);
    const header = screen.getByTestId("item-header-row");
    expect(header).toBeTruthy();
    expect(header.textContent).toMatch(/tipo/i);
    expect(header.textContent).toMatch(/valor/i);
    expect(header.textContent).toMatch(/abrir com/i);
  });

  it("does not render the header row when values is empty", async () => {
    await renderEditor([]);
    expect(screen.queryByTestId("item-header-row")).toBeNull();
  });

  it("hides 'Abrir com' header when no row uses openWith", async () => {
    await renderEditor([
      { kind: "app", value: "firefox", openWith: "" },
      { kind: "script", value: "ls", openWith: "", trusted: false },
    ]);
    const header = screen.getByTestId("item-header-row");
    expect(header.textContent).not.toMatch(/abrir com/i);
  });

  it("shows monitor header when 2+ monitors are connected", async () => {
    await renderEditor(
      [{ kind: "url", value: "https://a", openWith: "" }],
      [
        {
          name: "Tela 1",
          index: 0,
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          primary: true,
        },
        {
          name: "Tela 2",
          index: 1,
          x: 1920,
          y: 0,
          width: 1280,
          height: 720,
          primary: false,
        },
      ],
    );
    const header = screen.getByTestId("item-header-row");
    expect(header.textContent).toMatch(/tela/i);
  });

  // ---- Issue: incognito toggle ----

  it("incognito toggle renders for URL rows only", async () => {
    await renderEditor([
      { kind: "url", value: "https://a", openWith: "Firefox" },
      { kind: "file", value: "/tmp/x", openWith: "" },
      { kind: "app", value: "firefox", openWith: "" },
    ]);
    expect(screen.getByTestId("item-incognito-0")).toBeTruthy();
    expect(screen.queryByTestId("item-incognito-1")).toBeNull();
    expect(screen.queryByTestId("item-incognito-2")).toBeNull();
  });

  it("incognito checkbox enabled regardless of openWith (detection at launch)", async () => {
    await renderEditor([
      { kind: "url", value: "https://a", openWith: "" },
    ]);
    const cb = screen.getByTestId("item-incognito-0") as HTMLInputElement;
    expect(cb.disabled).toBe(false);
  });

  it("toggling incognito emits onChange with the new flag (no openWith)", async () => {
    const { onChange } = await renderEditor([
      { kind: "url", value: "https://a", openWith: "" },
    ]);
    fireEvent.click(screen.getByTestId("item-incognito-0"));
    expect(onChange).toHaveBeenLastCalledWith([
      { kind: "url", value: "https://a", openWith: "", incognito: true },
    ]);
  });

  it("toggling incognito emits onChange with the new flag (with openWith)", async () => {
    const { onChange } = await renderEditor([
      { kind: "url", value: "https://a", openWith: "Firefox" },
    ]);
    fireEvent.click(screen.getByTestId("item-incognito-0"));
    expect(onChange).toHaveBeenLastCalledWith([
      { kind: "url", value: "https://a", openWith: "Firefox", incognito: true },
    ]);
  });

  it("openWith dropdown title-cases option labels on URL rows only", async () => {
    const i18n = await createI18n("pt-BR");
    const apps = [
      { name: "google chrome", value: "chrome", path: "/usr/bin/chrome" },
      { name: "FIREFOX", value: "firefox", path: "/usr/bin/firefox" },
    ];
    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <ItemListEditor
          values={[{ kind: "url", value: "https://a", openWith: "" }]}
          onChange={vi.fn()}
          installedAppsOverride={apps}
        />
      </I18nextProvider>,
    );
    await screen.findByRole("option", { name: "Google Chrome" });
    expect(screen.getByRole("option", { name: "Firefox" })).toBeTruthy();

    // file row — labels preservam o nome bruto (sem titleCase).
    rerender(
      <I18nextProvider i18n={i18n}>
        <ItemListEditor
          values={[{ kind: "file", value: "/tmp/x", openWith: "" }]}
          onChange={vi.fn()}
          installedAppsOverride={apps}
        />
      </I18nextProvider>,
    );
    expect(screen.getByRole("option", { name: "google chrome" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "FIREFOX" })).toBeTruthy();
  });

  it("openWith dropdown filters to browsers only on URL rows", async () => {
    // Mock global retorna Firefox + VSCode. URL row deve mostrar só Firefox
    // (browser); VSCode some.
    await renderEditor([{ kind: "url", value: "https://a", openWith: "" }]);
    await screen.findByRole("option", { name: "Firefox" });
    const select = screen.getByTestId("item-open-with-0") as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toContain("Firefox");
    expect(labels.some((l) => l && l.includes("VSCode"))).toBe(false);
  });

  it("openWith dropdown keeps non-browser apps on file/folder rows", async () => {
    // file/folder podem ser abertos por qualquer app — filtro só vale pra URL.
    // titleCase também é só pra URL — nomes nativos preservados aqui (VSCode
    // mantém caps internos).
    await renderEditor([{ kind: "file", value: "/tmp/x", openWith: "" }]);
    await screen.findByRole("option", { name: "VSCode" });
    const select = screen.getByTestId("item-open-with-0") as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toContain("Firefox");
    expect(labels).toContain("VSCode");
  });

  it("renders the existing openWith value (custom value preserved as synthetic option)", async () => {
    await renderEditor([
      { kind: "url", value: "https://w", openWith: "edge" },
    ]);
    const select = screen.getByTestId("item-open-with-0") as HTMLSelectElement;
    expect(select.value).toBe("edge");
  });

  it("hides browse + openWith for app rows; uses input not textarea", async () => {
    await renderEditor([{ kind: "app", value: "firefox", openWith: "" }]);
    expect(screen.queryByTestId("item-browse-0")).toBeNull();
    expect(screen.queryByTestId("item-open-with-0")).toBeNull();
    // App uses single-line <input>, not <textarea>.
    expect(screen.getByTestId("item-value-0").tagName).toBe("INPUT");
  });

  it("renders a textarea + trust checkbox for script rows", async () => {
    await renderEditor([
      { kind: "script", value: "git pull", openWith: "", trusted: false },
    ]);
    expect(screen.queryByTestId("item-browse-0")).toBeNull();
    expect(screen.queryByTestId("item-open-with-0")).toBeNull();
    expect(screen.getByTestId("item-value-0").tagName).toBe("TEXTAREA");
    expect(screen.getByTestId("item-script-trusted-0")).toBeTruthy();
  });

  it("toggling trust checkbox emits onChange with the new flag", async () => {
    const { onChange } = await renderEditor([
      { kind: "script", value: "ls", openWith: "", trusted: false },
    ]);
    fireEvent.click(screen.getByTestId("item-script-trusted-0"));
    expect(onChange).toHaveBeenLastCalledWith([
      { kind: "script", value: "ls", openWith: "", trusted: true },
    ]);
  });

  it("'+ Adicionar app' appends app row with empty value", async () => {
    const { onChange } = await renderEditor([]);
    fireEvent.click(screen.getByTestId("add-item-app"));
    expect(onChange).toHaveBeenCalledWith([
      { kind: "app", value: "", openWith: "" },
    ]);
  });

  it("'+ Adicionar script' appends script row with trusted=false", async () => {
    const { onChange } = await renderEditor([]);
    fireEvent.click(screen.getByTestId("add-item-script"));
    expect(onChange).toHaveBeenCalledWith([
      { kind: "script", value: "", openWith: "", trusted: false },
    ]);
  });

  it("renders all five kind options in the selector", async () => {
    await renderEditor([{ kind: "url", value: "", openWith: "" }]);
    const select = screen.getByTestId("item-kind-0") as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toEqual(["url", "file", "folder", "app", "script"]);
  });

  it("trust checkbox renders for script rows even when `trusted` is undefined", async () => {
    // Bug fix: o checkbox dependia de `it.trusted !== undefined`. Isso fazia
    // com que trocar kind via dropdown (que não inicializa trusted) escondesse
    // o checkbox e impedisse o user de marcar trust antes de salvar. Agora
    // renderiza sempre que kind === "script", tratando undefined como unchecked.
    await renderEditor([{ kind: "script", value: "ls", openWith: "" }]);
    const cb = screen.getByTestId("item-script-trusted-0") as HTMLInputElement;
    expect(cb).toBeTruthy();
    expect(cb.checked).toBe(false);
  });

  it("app row shows the app picker button; selecting an app fills the value", async () => {
    const { onChange } = await renderEditor([
      { kind: "app", value: "", openWith: "" },
    ]);
    const button = screen.getByTestId("item-app-picker-0");
    fireEvent.click(button);
    // Picker abre — espera os apps carregarem do mock.
    const row = await screen.findByTestId("app-picker-row-0");
    expect(row).toBeTruthy();
    expect(ipc.listInstalledApps).toHaveBeenCalled();
    fireEvent.click(row);
    // Picker fecha + onChange foi disparado com o name selecionado.
    expect(onChange).toHaveBeenLastCalledWith([
      { kind: "app", value: "Firefox", openWith: "" },
    ]);
  });

  it("app row never shows the open-with field nor the browse button", async () => {
    await renderEditor([{ kind: "app", value: "firefox", openWith: "" }]);
    expect(screen.queryByTestId("item-open-with-0")).toBeNull();
    expect(screen.queryByTestId("item-browse-0")).toBeNull();
    expect(screen.getByTestId("item-app-picker-0")).toBeTruthy();
  });

  // ---------- Plano 21: monitor select per row ----------

  it("hides monitor select when only 1 monitor is connected", async () => {
    await renderEditor(
      [{ kind: "url", value: "https://a", openWith: "" }],
      [
        {
          name: "Tela 1",
          index: 0,
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          primary: true,
        },
      ],
    );
    expect(screen.queryByTestId("item-monitor-0")).toBeNull();
  });

  it("hides monitor select when fetch returns empty list", async () => {
    await renderEditor(
      [{ kind: "url", value: "https://a", openWith: "" }],
      [],
    );
    expect(screen.queryByTestId("item-monitor-0")).toBeNull();
  });

  it("renders monitor select per row when 2+ monitors are connected", async () => {
    await renderEditor(
      [
        { kind: "url", value: "https://a", openWith: "" },
        { kind: "app", value: "firefox", openWith: "" },
      ],
      [
        {
          name: "Tela 1",
          index: 0,
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          primary: true,
        },
        {
          name: "Tela 2",
          index: 1,
          x: 1920,
          y: 0,
          width: 1280,
          height: 720,
          primary: false,
        },
      ],
    );
    expect(screen.getByTestId("item-monitor-0")).toBeTruthy();
    expect(screen.getByTestId("item-monitor-1")).toBeTruthy();
  });

  it("monitor select includes a Default option plus one per monitor and marks the primary", async () => {
    await renderEditor(
      [{ kind: "url", value: "https://a", openWith: "" }],
      [
        {
          name: "Tela 1",
          index: 0,
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          primary: true,
        },
        {
          name: "Tela 2",
          index: 1,
          x: 1920,
          y: 0,
          width: 1280,
          height: 720,
          primary: false,
        },
      ],
    );
    const select = screen.getByTestId("item-monitor-0") as HTMLSelectElement;
    const opts = Array.from(select.options).map((o) => ({
      value: o.value,
      label: o.textContent ?? "",
    }));
    expect(opts[0].value).toBe("");
    expect(opts[0].label).toMatch(/padrão/i);
    expect(opts[1].value).toBe("0");
    expect(opts[1].label).toContain("Tela 1");
    expect(opts[1].label).toMatch(/primária/i);
    expect(opts[2].value).toBe("1");
    expect(opts[2].label).toBe("Tela 2");
  });

  it("selecting a monitor emits onChange with monitor=index", async () => {
    const { onChange } = await renderEditor(
      [{ kind: "url", value: "https://a", openWith: "" }],
      [
        {
          name: "Tela 1",
          index: 0,
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          primary: true,
        },
        {
          name: "Tela 2",
          index: 1,
          x: 1920,
          y: 0,
          width: 1280,
          height: 720,
          primary: false,
        },
      ],
    );
    fireEvent.change(screen.getByTestId("item-monitor-0"), {
      target: { value: "1" },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      { kind: "url", value: "https://a", openWith: "", monitor: 1 },
    ]);
  });

  it("selecting Default option clears monitor (sets to null)", async () => {
    const { onChange } = await renderEditor(
      [{ kind: "url", value: "https://a", openWith: "", monitor: 1 }],
      [
        {
          name: "Tela 1",
          index: 0,
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          primary: true,
        },
        {
          name: "Tela 2",
          index: 1,
          x: 1920,
          y: 0,
          width: 1280,
          height: 720,
          primary: false,
        },
      ],
    );
    fireEvent.change(screen.getByTestId("item-monitor-0"), {
      target: { value: "" },
    });
    expect(onChange).toHaveBeenLastCalledWith([
      { kind: "url", value: "https://a", openWith: "", monitor: null },
    ]);
  });

  it("monitor select reflects the existing item.monitor value", async () => {
    await renderEditor(
      [{ kind: "url", value: "https://a", openWith: "", monitor: 1 }],
      [
        {
          name: "Tela 1",
          index: 0,
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          primary: true,
        },
        {
          name: "Tela 2",
          index: 1,
          x: 1920,
          y: 0,
          width: 1280,
          height: 720,
          primary: false,
        },
      ],
    );
    const select = screen.getByTestId("item-monitor-0") as HTMLSelectElement;
    expect(select.value).toBe("1");
  });

  it("monitor select also appears for app and script rows", async () => {
    await renderEditor(
      [
        { kind: "app", value: "firefox", openWith: "" },
        { kind: "script", value: "ls", openWith: "", trusted: false },
      ],
      [
        {
          name: "Tela 1",
          index: 0,
          x: 0,
          y: 0,
          width: 1920,
          height: 1080,
          primary: true,
        },
        {
          name: "Tela 2",
          index: 1,
          x: 1920,
          y: 0,
          width: 1280,
          height: 720,
          primary: false,
        },
      ],
    );
    expect(screen.getByTestId("item-monitor-0")).toBeTruthy();
    expect(screen.getByTestId("item-monitor-1")).toBeTruthy();
  });

  it("fetches monitors via ipc.listMonitors when no override is passed", async () => {
    await renderEditor([{ kind: "url", value: "https://a", openWith: "" }]);
    // Default mock retorna 1 monitor → select escondido. O hook deve ter
    // disparado ipc.listMonitors mesmo assim.
    await Promise.resolve();
    await Promise.resolve();
    expect(ipc.listMonitors).toHaveBeenCalled();
  });
});
