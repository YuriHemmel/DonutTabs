import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
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
  },
  CONFIG_CHANGED_EVENT: "config-changed",
  SETTINGS_INTENT_EVENT: "settings-intent",
}));

import { ipc } from "../../core/ipc";
import * as events from "@tauri-apps/api/event";

const makeConfig = () => ({
  version: 1,
  shortcut: "CommandOrControl+Shift+Space",
  appearance: { theme: "dark", language: "auto" },
  interaction: {
    spawnPosition: "cursor",
    selectionMode: "clickOrRelease",
    hoverHoldMs: 800,
  },
  pagination: { itemsPerPage: 6, wheelDirection: "standard" },
  system: { autostart: false },
  tabs: [],
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
    // começa no select-prompt
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
});
