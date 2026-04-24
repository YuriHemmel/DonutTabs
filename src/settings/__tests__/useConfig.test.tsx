import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useConfig } from "../useConfig";

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
  },
  CONFIG_CHANGED_EVENT: "config-changed",
  SETTINGS_INTENT_EVENT: "settings-intent",
}));

import { ipc } from "../../core/ipc";
import * as events from "@tauri-apps/api/event";

const makeConfig = (overrides: Partial<{ tabs: unknown[] }> = {}) => ({
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
  ...overrides,
});

describe("useConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (events as unknown as { __reset: () => void }).__reset();
  });

  it("loads config on mount", async () => {
    const cfg = makeConfig();
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(cfg);
    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.config).toEqual(cfg));
  });

  it("applies config-changed event updates", async () => {
    const initial = makeConfig();
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(initial);
    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.config).toEqual(initial));

    const updated = makeConfig({ tabs: [{ id: "x" } as unknown] });
    act(() => {
      (events as unknown as { __emit: (n: string, p: unknown) => void }).__emit(
        "config-changed",
        updated,
      );
    });
    await waitFor(() => expect(result.current.config).toEqual(updated));
  });

  it("saveTab delegates to ipc and returns the new config", async () => {
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(makeConfig());
    const updated = makeConfig({ tabs: [{ id: "n" } as unknown] });
    (ipc.saveTab as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.config).not.toBeNull());

    const tab = {
      id: "n",
      name: "N",
      icon: null,
      order: 0,
      openMode: "newTab",
      items: [],
    } as never;
    const returned = await act(() => result.current.saveTab(tab));
    expect(returned).toEqual(updated);
    expect(ipc.saveTab).toHaveBeenCalledWith(tab);
  });

  it("deleteTab delegates to ipc", async () => {
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(makeConfig());
    const updated = makeConfig();
    (ipc.deleteTab as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.config).not.toBeNull());

    await act(() => result.current.deleteTab("some-id"));
    expect(ipc.deleteTab).toHaveBeenCalledWith("some-id");
  });

  it("setShortcut delegates to ipc and applies the new snapshot", async () => {
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(makeConfig());
    const updated = { ...makeConfig(), shortcut: "CommandOrControl+Alt+D" };
    (ipc.setShortcut as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.config).not.toBeNull());

    await act(() => result.current.setShortcut("CommandOrControl+Alt+D"));
    expect(ipc.setShortcut).toHaveBeenCalledWith("CommandOrControl+Alt+D");
    expect(result.current.config?.shortcut).toBe("CommandOrControl+Alt+D");
  });

  it("setTheme delegates to ipc", async () => {
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(makeConfig());
    (ipc.setTheme as ReturnType<typeof vi.fn>).mockResolvedValue(makeConfig());

    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.config).not.toBeNull());

    await act(() => result.current.setTheme("light"));
    expect(ipc.setTheme).toHaveBeenCalledWith("light");
  });

  it("setLanguage delegates to ipc", async () => {
    (ipc.getConfig as ReturnType<typeof vi.fn>).mockResolvedValue(makeConfig());
    (ipc.setLanguage as ReturnType<typeof vi.fn>).mockResolvedValue(makeConfig());

    const { result } = renderHook(() => useConfig());
    await waitFor(() => expect(result.current.config).not.toBeNull());

    await act(() => result.current.setLanguage("en"));
    expect(ipc.setLanguage).toHaveBeenCalledWith("en");
  });
});
