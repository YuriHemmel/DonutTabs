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
    listScriptRuns: vi.fn(),
    getScriptRun: vi.fn(),
    clearScriptRuns: vi.fn(),
    cancelScriptRun: vi.fn(),
  },
  SCRIPT_RUN_STARTED_EVENT: "script-run-started",
  SCRIPT_RUN_OUTPUT_EVENT: "script-run-output",
  SCRIPT_RUN_FINISHED_EVENT: "script-run-finished",
}));

import { ipc } from "../../core/ipc";
import { HistorySection } from "../HistorySection";
import * as events from "@tauri-apps/api/event";

interface MockedEvents {
  __emit: (name: string, payload: unknown) => void;
  __reset: () => void;
}
const evMock = events as unknown as MockedEvents;

const sampleSummary = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: "11111111-1111-1111-1111-111111111111",
  profileId: "22222222-2222-2222-2222-222222222222",
  tabId: "33333333-3333-3333-3333-333333333333",
  command: "echo hi",
  startedAt: 1_700_000_000_000,
  finishedAt: 1_700_000_001_000,
  exitCode: 0,
  status: "succeeded" as const,
  truncated: false,
  ...overrides,
});

const sampleRun = (overrides: Partial<Record<string, unknown>> = {}) => ({
  ...sampleSummary(),
  itemIndex: 0,
  stdout: "hi\n",
  stderr: "",
  ...overrides,
});

const renderHistory = async (enabled = true) => {
  const i18n = await createI18n("pt-BR");
  return render(
    <I18nextProvider i18n={i18n}>
      <HistorySection enabled={enabled} />
    </I18nextProvider>,
  );
};

describe("HistorySection", () => {
  beforeEach(() => {
    vi.mocked(ipc.listScriptRuns).mockReset();
    vi.mocked(ipc.getScriptRun).mockReset();
    vi.mocked(ipc.clearScriptRuns).mockReset();
    vi.mocked(ipc.cancelScriptRun).mockReset();
    evMock.__reset();
  });

  it("mostra mensagem dedicada quando captura está desligada", async () => {
    await renderHistory(false);
    expect(screen.getByTestId("history-disabled")).toBeTruthy();
  });

  it("hidrata a lista via listScriptRuns no mount", async () => {
    vi.mocked(ipc.listScriptRuns).mockResolvedValue([
      sampleSummary({ id: "a", command: "ls" }),
      sampleSummary({ id: "b", command: "pwd" }),
    ]);
    await renderHistory();
    await waitFor(() => {
      expect(screen.getByTestId("history-row-a")).toBeTruthy();
    });
    expect(screen.getByTestId("history-row-b")).toBeTruthy();
  });

  it("mostra empty quando lista vem vazia", async () => {
    vi.mocked(ipc.listScriptRuns).mockResolvedValue([]);
    await renderHistory();
    await waitFor(() => {
      expect(screen.getAllByText(/Nenhum script executado ainda/).length).toBeGreaterThan(0);
    });
  });

  it("click numa row carrega detail via getScriptRun", async () => {
    vi.mocked(ipc.listScriptRuns).mockResolvedValue([
      sampleSummary({ id: "a", command: "ls" }),
    ]);
    vi.mocked(ipc.getScriptRun).mockResolvedValue(
      sampleRun({ id: "a", stdout: "file1\nfile2\n" }),
    );
    await renderHistory();
    await waitFor(() => screen.getByTestId("history-row-a"));
    const user = userEvent.setup();
    await user.click(screen.getByTestId("history-row-a"));
    await waitFor(() => {
      expect(screen.getByTestId("history-stdout")).toBeTruthy();
    });
    expect(screen.getByTestId("history-stdout").textContent).toContain("file1");
  });

  it("evento STARTED prepende run na lista", async () => {
    vi.mocked(ipc.listScriptRuns).mockResolvedValue([]);
    await renderHistory();
    await waitFor(() => screen.getAllByText(/Nenhum script/).length > 0);
    evMock.__emit("script-run-started", sampleSummary({ id: "live", command: "running" }));
    await waitFor(() => {
      expect(screen.getByTestId("history-row-live")).toBeTruthy();
    });
  });

  it("evento OUTPUT acrescenta chunk ao stdout do detail aberto", async () => {
    vi.mocked(ipc.listScriptRuns).mockResolvedValue([
      sampleSummary({ id: "live", command: "tail -f", status: "running" }),
    ]);
    vi.mocked(ipc.getScriptRun).mockResolvedValue(
      sampleRun({ id: "live", stdout: "line1\n", status: "running" }),
    );
    await renderHistory();
    await waitFor(() => screen.getByTestId("history-row-live"));
    const user = userEvent.setup();
    await user.click(screen.getByTestId("history-row-live"));
    await waitFor(() => screen.getByTestId("history-stdout"));
    evMock.__emit("script-run-output", {
      runId: "live",
      stream: "stdout",
      chunk: "line2\n",
    });
    await waitFor(() => {
      expect(screen.getByTestId("history-stdout").textContent).toContain("line2");
    });
  });

  it("botão Cancel chama cancelScriptRun em runs em curso", async () => {
    vi.mocked(ipc.listScriptRuns).mockResolvedValue([
      sampleSummary({ id: "live", command: "sleep 30", status: "running" }),
    ]);
    vi.mocked(ipc.getScriptRun).mockResolvedValue(
      sampleRun({ id: "live", status: "running" }),
    );
    vi.mocked(ipc.cancelScriptRun).mockResolvedValue(true);
    await renderHistory();
    await waitFor(() => screen.getByTestId("history-row-live"));
    const user = userEvent.setup();
    await user.click(screen.getByTestId("history-row-live"));
    await waitFor(() => screen.getByTestId("history-cancel"));
    await user.click(screen.getByTestId("history-cancel"));
    expect(ipc.cancelScriptRun).toHaveBeenCalledWith("live");
  });

  it("clearAll desabilitado quando lista vazia", async () => {
    vi.mocked(ipc.listScriptRuns).mockResolvedValue([]);
    await renderHistory();
    await waitFor(() => screen.getByTestId("history-clear"));
    const btn = screen.getByTestId("history-clear") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("truncated banner aparece quando run.truncated é true", async () => {
    vi.mocked(ipc.listScriptRuns).mockResolvedValue([
      sampleSummary({ id: "big" }),
    ]);
    vi.mocked(ipc.getScriptRun).mockResolvedValue(
      sampleRun({ id: "big", truncated: true }),
    );
    await renderHistory();
    await waitFor(() => screen.getByTestId("history-row-big"));
    const user = userEvent.setup();
    await user.click(screen.getByTestId("history-row-big"));
    await waitFor(() => {
      expect(screen.getByTestId("history-truncated")).toBeTruthy();
    });
  });
});
