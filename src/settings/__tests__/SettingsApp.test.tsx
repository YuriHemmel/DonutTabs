import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../core/i18n";
import { SettingsApp } from "../SettingsApp";

type Listener = (e: { payload: unknown }) => void;

vi.mock("@tauri-apps/api/event", () => {
  const listeners = new Map<string, Set<Listener>>();
  return {
    listen: vi.fn(async (name: string, cb: Listener) => {
      const set = listeners.get(name) ?? new Set<Listener>();
      set.add(cb);
      listeners.set(name, set);
      return () => {
        set.delete(cb);
      };
    }),
    __emit: (name: string, payload: unknown) => {
      listeners.get(name)?.forEach((cb) => cb({ payload }));
    },
    __reset: () => {
      listeners.clear();
    },
  };
});

vi.mock("../../core/ipc", () => ({
  ipc: {
    getConfig: vi.fn(),
    saveTab: vi.fn(),
    deleteTab: vi.fn(),
    openSettings: vi.fn(),
    closeSettings: vi.fn(),
    openTab: vi.fn(),
    hideDonut: vi.fn(),
    consumeSettingsIntent: vi.fn().mockResolvedValue(null),
    setShortcut: vi.fn(),
    setTheme: vi.fn(),
    setLanguage: vi.fn(),
    setActiveProfile: vi.fn(),
    createProfile: vi.fn(),
    deleteProfile: vi.fn(),
    updateProfile: vi.fn(),
    setAutostart: vi.fn(),
    reorderTabs: vi.fn(),
    reorderProfiles: vi.fn(),
  },
  CONFIG_CHANGED_EVENT: "config-changed",
  SETTINGS_INTENT_EVENT: "settings-intent",
}));

import { ipc } from "../../core/ipc";
import * as events from "@tauri-apps/api/event";

const PROFILE_ID = "00000000-0000-0000-0000-000000000001";
const PROFILE_ID_2 = "00000000-0000-0000-0000-000000000002";

const makeProfile = (
  overrides: Partial<{
    id: string;
    name: string;
    icon: string | null;
    shortcut: string;
    theme: string;
    tabs: { id: string; name: string | null; icon: string | null; order: number; openMode: string; items: unknown[] }[];
  }> = {},
) => ({
  id: PROFILE_ID,
  name: "Padrão",
  icon: null,
  shortcut: "CommandOrControl+Shift+Space",
  theme: "dark",
  tabs: [],
  ...overrides,
});

const makeConfig = (
  overrides: Partial<{
    profiles: ReturnType<typeof makeProfile>[];
    activeProfileId: string;
  }> = {},
) => ({
  version: 2,
  activeProfileId: PROFILE_ID,
  profiles: [makeProfile()],
  appearance: { language: "auto" },
  interaction: {
    spawnPosition: "cursor",
    selectionMode: "clickOrRelease",
    hoverHoldMs: 800,
  },
  pagination: { itemsPerPage: 6, wheelDirection: "standard" },
  system: { autostart: false },
  ...overrides,
});

async function renderApp() {
  const i18n = await createI18n("pt-BR");
  return render(
    <I18nextProvider i18n={i18n}>
      <SettingsApp />
    </I18nextProvider>,
  );
}

describe("SettingsApp intent routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (events as unknown as { __reset: () => void }).__reset();
    (ipc.consumeSettingsIntent as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  it("defaults to the select-prompt view when no intent is pending", async () => {
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(makeConfig());
    await renderApp();
    await waitFor(() => {
      expect(screen.getByText(/selecione uma aba/i)).toBeTruthy();
    });
  });

  it("opens the new-tab editor when the pending intent is 'new-tab'", async () => {
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(makeConfig());
    (ipc.consumeSettingsIntent as ReturnType<typeof vi.fn>).mockResolvedValue("new-tab");
    await renderApp();
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /nova aba/i })).toBeTruthy();
    });
  });

  it("switches to new-tab editor when receiving a live settings-intent event", async () => {
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(makeConfig());
    await renderApp();
    await waitFor(() => {
      expect(screen.getByText(/selecione uma aba/i)).toBeTruthy();
    });
    act(() => {
      (events as unknown as { __emit: (n: string, p: unknown) => void }).__emit(
        "settings-intent",
        "new-tab",
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /nova aba/i })).toBeTruthy();
    });
  });

  it("renders AppearanceSection when the Aparência tab is clicked", async () => {
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(makeConfig());
    const user = userEvent.setup();
    await renderApp();
    await waitFor(() => {
      expect(screen.getByText(/selecione uma aba/i)).toBeTruthy();
    });
    await user.click(screen.getByTestId("section-appearance"));
    expect(screen.getByRole("heading", { name: /aparência/i })).toBeTruthy();
    expect(screen.queryByText(/selecione uma aba/i)).toBeNull();
  });

  it("renders ShortcutSection when the Atalho tab is clicked", async () => {
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(makeConfig());
    const user = userEvent.setup();
    await renderApp();
    await waitFor(() => {
      expect(screen.getByText(/selecione uma aba/i)).toBeTruthy();
    });
    await user.click(screen.getByTestId("section-shortcut"));
    expect(screen.getByRole("heading", { name: /atalho global/i })).toBeTruthy();
  });

  it("intent 'new-tab' also switches back to the tabs section when on another section", async () => {
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(makeConfig());
    const user = userEvent.setup();
    await renderApp();
    await waitFor(() => {
      expect(screen.getByText(/selecione uma aba/i)).toBeTruthy();
    });
    await user.click(screen.getByTestId("section-appearance"));
    act(() => {
      (events as unknown as { __emit: (n: string, p: unknown) => void }).__emit(
        "settings-intent",
        "new-tab",
      );
    });
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /nova aba/i })).toBeTruthy();
    });
  });

  it("opens the editor of the matching tab when intent is 'edit-tab:<id>'", async () => {
    const cfg = makeConfig({
      profiles: [
        makeProfile({
          tabs: [
            {
              id: "abc",
              name: "Trabalho",
              icon: null,
              order: 0,
              openMode: "reuseOrNewWindow",
              items: [{ kind: "url", value: "https://example.com" }],
            },
          ],
        }),
      ],
    });
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(cfg);
    (ipc.consumeSettingsIntent as ReturnType<typeof vi.fn>).mockResolvedValue(
      "edit-tab:abc",
    );
    await renderApp();
    await waitFor(() => {
      const nameInput = screen.getByLabelText(/nome/i) as HTMLInputElement;
      expect(nameInput.value).toBe("Trabalho");
    });
    expect(screen.queryByRole("heading", { name: /nova aba/i })).toBeNull();
  });

  it("clicking a tab when sibling leaves lack the `children` field doesn't crash", async () => {
    // Backend serializa `Tab.children` com `skip_serializing_if = "Vec::is_empty"`,
    // então leaves chegam ao frontend sem o campo. `findTabPathInProfile`
    // recursivo precisa tolerar `tab.children === undefined`. Regressão real
    // observada no app: clicar numa aba após o primeiro irmão quebrava o
    // render porque `for (const t of undefined)` lançava `TypeError`.
    const cfg = makeConfig({
      profiles: [
        makeProfile({
          tabs: [
            {
              id: "first",
              name: "Primeiro",
              icon: null,
              order: 0,
              openMode: "reuseOrNewWindow",
              items: [{ kind: "url", value: "https://a.test" }],
              // sem `children` — simula o JSON real do backend
            } as never,
            {
              id: "second",
              name: "Segundo",
              icon: null,
              order: 1,
              openMode: "reuseOrNewWindow",
              items: [{ kind: "url", value: "https://b.test" }],
            } as never,
          ],
        }),
      ],
    });
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(cfg);
    (ipc.consumeSettingsIntent as ReturnType<typeof vi.fn>).mockResolvedValue(
      "edit-tab:second",
    );
    await renderApp();
    await waitFor(() => {
      const nameInput = screen.getByLabelText(/nome/i) as HTMLInputElement;
      expect(nameInput.value).toBe("Segundo");
    });
  });

  it("ignores 'edit-tab:<id>' when the tab id does not exist", async () => {
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(makeConfig());
    (ipc.consumeSettingsIntent as ReturnType<typeof vi.fn>).mockResolvedValue(
      "edit-tab:does-not-exist",
    );
    await renderApp();
    await waitFor(() => {
      expect(screen.getByText(/selecione uma aba/i)).toBeTruthy();
    });
  });

  it("switches to edit mode when receiving live edit-tab:<id> event", async () => {
    const cfg = makeConfig({
      profiles: [
        makeProfile({
          tabs: [
            {
              id: "xyz",
              name: "Estudo",
              icon: null,
              order: 0,
              openMode: "reuseOrNewWindow",
              items: [{ kind: "url", value: "https://example.com" }],
            },
          ],
        }),
      ],
    });
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(cfg);
    await renderApp();
    await waitFor(() => {
      expect(screen.getByText(/selecione uma aba/i)).toBeTruthy();
    });
    act(() => {
      (events as unknown as { __emit: (n: string, p: unknown) => void }).__emit(
        "settings-intent",
        "edit-tab:xyz",
      );
    });
    await waitFor(() => {
      const nameInput = screen.getByLabelText(/nome/i) as HTMLInputElement;
      expect(nameInput.value).toBe("Estudo");
    });
  });

  it("edit-tab:<id> from a non-active profile selects that profile", async () => {
    const cfg = makeConfig({
      profiles: [
        makeProfile({ tabs: [] }),
        makeProfile({
          id: PROFILE_ID_2,
          name: "Estudo",
          tabs: [
            {
              id: "tab-in-second-profile",
              name: "Faculdade",
              icon: null,
              order: 0,
              openMode: "reuseOrNewWindow",
              items: [{ kind: "url", value: "https://uni.test" }],
            },
          ],
        }),
      ],
    });
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(cfg);
    (ipc.consumeSettingsIntent as ReturnType<typeof vi.fn>).mockResolvedValue(
      "edit-tab:tab-in-second-profile",
    );
    await renderApp();
    await waitFor(() => {
      const nameInput = screen.getByLabelText(/nome/i) as HTMLInputElement;
      expect(nameInput.value).toBe("Faculdade");
    });
    expect(
      screen.getByTestId(`profile-chip-${PROFILE_ID_2}`).getAttribute(
        "aria-selected",
      ),
    ).toBe("true");
  });

  it("'new-profile' intent opens ProfileEditor in new mode after config loads", async () => {
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(makeConfig());
    (ipc.consumeSettingsIntent as ReturnType<typeof vi.fn>).mockResolvedValue(
      "new-profile",
    );
    await renderApp();
    await waitFor(() => {
      expect(screen.getByTestId("profile-editor")).toBeTruthy();
    });
    expect(
      screen.getByRole("heading", { name: /novo perfil/i }),
    ).toBeTruthy();
    expect(ipc.createProfile).not.toHaveBeenCalled();
  });

  it("submitting the new ProfileEditor calls ipc.createProfile with name + icon", async () => {
    const NEW_ID = "00000000-0000-0000-0000-0000000000aa";
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(makeConfig());
    (ipc.createProfile as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeConfig({
        profiles: [makeProfile(), makeProfile({ id: NEW_ID, name: "Estudo" })],
      }),
      NEW_ID,
    ]);
    const user = userEvent.setup();
    await renderApp();
    await waitFor(() => {
      expect(screen.getByTestId("profile-create")).toBeTruthy();
    });
    await user.click(screen.getByTestId("profile-create"));
    const editor = await waitFor(() => screen.getByTestId("profile-editor"));
    const nameInput = editor.querySelector("input") as HTMLInputElement;
    await user.type(nameInput, "Estudo");
    await user.click(screen.getByRole("button", { name: /^criar$/i }));
    expect(ipc.createProfile).toHaveBeenCalledWith("Estudo", null);
    await waitFor(() => {
      expect(screen.queryByTestId("profile-editor")).toBeNull();
    });
  });

  it("editing a profile opens ProfileEditor with prefilled fields and calls updateProfile on submit", async () => {
    const cfg = makeConfig({
      profiles: [
        makeProfile(),
        makeProfile({ id: PROFILE_ID_2, name: "Estudo", icon: "📚" }),
      ],
    });
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(cfg);
    (ipc.updateProfile as ReturnType<typeof vi.fn>).mockResolvedValue(cfg);
    const user = userEvent.setup();
    await renderApp();
    await waitFor(() => {
      expect(screen.getByTestId("profile-edit")).toBeTruthy();
    });
    await user.click(screen.getByTestId(`profile-chip-${PROFILE_ID_2}`));
    await user.click(screen.getByTestId("profile-edit"));
    const editor = await waitFor(() => screen.getByTestId("profile-editor"));
    const nameInput = editor.querySelector("input") as HTMLInputElement;
    expect(nameInput.value).toBe("Estudo");
    await user.clear(nameInput);
    await user.type(nameInput, "Faculdade");
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));
    expect(ipc.updateProfile).toHaveBeenCalledWith(
      PROFILE_ID_2,
      "Faculdade",
      "📚",
    );
    await waitFor(() => {
      expect(screen.queryByTestId("profile-editor")).toBeNull();
    });
  });

  it("ProfileEditor cancel closes the panel without calling IPC", async () => {
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(makeConfig());
    const user = userEvent.setup();
    await renderApp();
    await waitFor(() => {
      expect(screen.getByTestId("profile-create")).toBeTruthy();
    });
    await user.click(screen.getByTestId("profile-create"));
    await waitFor(() => {
      expect(screen.getByTestId("profile-editor")).toBeTruthy();
    });
    await user.click(screen.getByRole("button", { name: /^cancelar$/i }));
    await waitFor(() => {
      expect(screen.queryByTestId("profile-editor")).toBeNull();
    });
    expect(ipc.createProfile).not.toHaveBeenCalled();
    expect(ipc.updateProfile).not.toHaveBeenCalled();
  });

  it("ProfilePicker shows all profiles", async () => {
    const cfg = makeConfig({
      profiles: [
        makeProfile(),
        makeProfile({ id: PROFILE_ID_2, name: "Estudo" }),
      ],
    });
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(cfg);
    await renderApp();
    await waitFor(() => {
      expect(screen.getByTestId(`profile-chip-${PROFILE_ID}`)).toBeTruthy();
      expect(screen.getByTestId(`profile-chip-${PROFILE_ID_2}`)).toBeTruthy();
    });
  });

  it("changing the profile in the picker swaps which profile's tabs are shown", async () => {
    const cfg = makeConfig({
      profiles: [
        makeProfile({
          tabs: [
            {
              id: "t-active",
              name: "AbaAtivo",
              icon: null,
              order: 0,
              openMode: "reuseOrNewWindow",
              items: [{ kind: "url", value: "https://a.test" }],
            },
          ],
        }),
        makeProfile({
          id: PROFILE_ID_2,
          name: "Estudo",
          tabs: [
            {
              id: "t-other",
              name: "AbaOutro",
              icon: null,
              order: 0,
              openMode: "reuseOrNewWindow",
              items: [{ kind: "url", value: "https://b.test" }],
            },
          ],
        }),
      ],
    });
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(cfg);
    const user = userEvent.setup();
    await renderApp();
    await waitFor(() => {
      expect(screen.getByText("AbaAtivo")).toBeTruthy();
    });
    await user.click(screen.getByTestId(`profile-chip-${PROFILE_ID_2}`));
    await waitFor(() => {
      expect(screen.getByText("AbaOutro")).toBeTruthy();
      expect(screen.queryByText("AbaAtivo")).toBeNull();
    });
  });

  it("deleting a profile asks for confirm and calls ipc.deleteProfile when accepted", async () => {
    const cfg = makeConfig({
      profiles: [
        makeProfile(),
        makeProfile({ id: PROFILE_ID_2, name: "Estudo" }),
      ],
    });
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(cfg);
    (ipc.deleteProfile as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeConfig(),
    );
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    await renderApp();
    await waitFor(() => {
      expect(screen.getByTestId("profile-delete")).toBeTruthy();
    });
    // Seleciona o segundo perfil para mirar o delete nele.
    await user.click(screen.getByTestId(`profile-chip-${PROFILE_ID_2}`));
    await user.click(screen.getByTestId("profile-delete"));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(ipc.deleteProfile).toHaveBeenCalledWith(PROFILE_ID_2);
    confirmSpy.mockRestore();
  });

  it("deleting a profile is a no-op when confirm is canceled", async () => {
    const cfg = makeConfig({
      profiles: [
        makeProfile(),
        makeProfile({ id: PROFILE_ID_2, name: "Estudo" }),
      ],
    });
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(cfg);
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();
    await renderApp();
    await waitFor(() => {
      expect(screen.getByTestId("profile-delete")).toBeTruthy();
    });
    await user.click(screen.getByTestId("profile-delete"));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(ipc.deleteProfile).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("AppearanceSection shows the set-active button only when editing a non-active profile", async () => {
    const cfg = makeConfig({
      profiles: [
        makeProfile(),
        makeProfile({ id: PROFILE_ID_2, name: "Estudo" }),
      ],
    });
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(cfg);
    (ipc.setActiveProfile as ReturnType<typeof vi.fn>).mockResolvedValue(cfg);
    const user = userEvent.setup();
    await renderApp();
    await waitFor(() => {
      expect(screen.getByTestId("section-appearance")).toBeTruthy();
    });
    await user.click(screen.getByTestId("section-appearance"));
    // editando o ativo (default) → sem botão
    expect(screen.queryByTestId("set-active-profile")).toBeNull();
    // troca pro perfil inativo → botão aparece
    await user.click(screen.getByTestId(`profile-chip-${PROFILE_ID_2}`));
    const btn = await waitFor(() => screen.getByTestId("set-active-profile"));
    await user.click(btn);
    expect(ipc.setActiveProfile).toHaveBeenCalledWith(PROFILE_ID_2);
  });
});
