import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../core/i18n";

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
    checkForUpdates: vi.fn(),
    installUpdate: vi.fn(),
    getPendingUpdate: vi.fn(),
    setAutoCheckUpdates: vi.fn(),
  },
  CONFIG_CHANGED_EVENT: "config-changed",
  SETTINGS_INTENT_EVENT: "settings-intent",
  UPDATE_PROGRESS_EVENT: "update-progress",
}));

import { ipc, UPDATE_PROGRESS_EVENT } from "../../core/ipc";
import { UpdateCard } from "../UpdateCard";
import * as events from "@tauri-apps/api/event";

interface MockedEvents {
  __emit: (name: string, payload: unknown) => void;
  __reset: () => void;
}
const evMock = events as unknown as MockedEvents;

const renderCard = async (autoChecked = true) => {
  const i18n = await createI18n("pt-BR");
  const onAutoChange = vi.fn();
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <UpdateCard
        autoCheckUpdates={autoChecked}
        onAutoCheckUpdatesChange={onAutoChange}
      />
    </I18nextProvider>,
  );
  return { ...utils, onAutoChange };
};

describe("UpdateCard", () => {
  beforeEach(() => {
    vi.mocked(ipc.checkForUpdates).mockReset();
    vi.mocked(ipc.installUpdate).mockReset();
    vi.mocked(ipc.getPendingUpdate).mockReset();
    vi.mocked(ipc.setAutoCheckUpdates).mockReset();
    evMock.__reset();
  });

  it("hidrata com pending update do startup task", async () => {
    vi.mocked(ipc.getPendingUpdate).mockResolvedValue({
      version: "0.2.0",
      notes: null,
      date: null,
    });
    await renderCard();
    await waitFor(() => {
      expect(screen.getByTestId("update-available")).toBeTruthy();
    });
    expect(
      screen.getByText((c) => c.includes("0.2.0") && c.includes("disponível")),
    ).toBeTruthy();
  });

  it("checkNow atualiza estado pra upToDate quando não há update", async () => {
    vi.mocked(ipc.getPendingUpdate).mockResolvedValue(null);
    vi.mocked(ipc.checkForUpdates).mockResolvedValue(null);
    await renderCard();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("check-updates"));
    await waitFor(() => {
      expect(screen.getByTestId("up-to-date")).toBeTruthy();
    });
    expect(ipc.checkForUpdates).toHaveBeenCalledWith(true);
  });

  it("checkNow ignora gate e revela banner quando há update", async () => {
    vi.mocked(ipc.getPendingUpdate).mockResolvedValue(null);
    vi.mocked(ipc.checkForUpdates).mockResolvedValue({
      version: "0.3.0",
      notes: "fixes bugs",
      date: null,
    });
    await renderCard();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("check-updates"));
    await waitFor(() => {
      expect(screen.getByTestId("update-available")).toBeTruthy();
    });
  });

  it("install button dispara installUpdate e mostra progresso", async () => {
    vi.mocked(ipc.getPendingUpdate).mockResolvedValue({
      version: "0.2.0",
      notes: null,
      date: null,
    });
    let resolveInstall: () => void = () => {};
    vi.mocked(ipc.installUpdate).mockImplementation(
      () =>
        new Promise<void>((r) => {
          resolveInstall = r;
        }),
    );
    await renderCard();
    await waitFor(() => screen.getByTestId("update-available"));

    const user = userEvent.setup();
    await user.click(screen.getByTestId("install-update"));

    await waitFor(() => {
      expect(screen.getByTestId("update-downloading")).toBeTruthy();
    });

    evMock.__emit(UPDATE_PROGRESS_EVENT, { downloaded: 50, total: 100 });
    await waitFor(() => {
      expect(
        screen.getByText((c) => c.includes("50") && c.includes("Baixando")),
      ).toBeTruthy();
    });

    resolveInstall();
    await waitFor(() => {
      expect(screen.getByTestId("update-installing")).toBeTruthy();
    });
  });

  it("erros do checkForUpdates viram banner traduzido", async () => {
    vi.mocked(ipc.getPendingUpdate).mockResolvedValue(null);
    vi.mocked(ipc.checkForUpdates).mockRejectedValue({
      kind: "updater",
      message: {
        code: "updater_network_unavailable",
        context: {},
      },
    });
    await renderCard();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("check-updates"));
    await waitFor(() => {
      expect(screen.getByTestId("update-error")).toBeTruthy();
    });
    expect(
      screen.getByText(/Sem conexão para verificar atualizações/),
    ).toBeTruthy();
  });

  it("toggle autoCheck dispara callback do parent", async () => {
    vi.mocked(ipc.getPendingUpdate).mockResolvedValue(null);
    const { onAutoChange } = await renderCard(true);
    const user = userEvent.setup();
    const cb = screen.getByTestId(
      "auto-check-updates-toggle",
    ) as HTMLInputElement;
    expect(cb.checked).toBe(true);
    await user.click(cb);
    expect(onAutoChange).toHaveBeenCalledWith(false);
  });
});
