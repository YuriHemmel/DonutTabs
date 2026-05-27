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
  };
});

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(),
}));

vi.mock("../../core/ipc", () => ({
  ipc: {
    checkForUpdates: vi.fn(),
    installUpdate: vi.fn(),
    getPendingUpdate: vi.fn().mockResolvedValue(null),
    setAutoCheckUpdates: vi.fn(),
  },
  CONFIG_CHANGED_EVENT: "config-changed",
  SETTINGS_INTENT_EVENT: "settings-intent",
  UPDATE_PROGRESS_EVENT: "update-progress",
}));

import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { AboutSection } from "../AboutSection";

const renderSection = async (autoCheck = true) => {
  const i18n = await createI18n("pt-BR");
  const onChange = vi.fn();
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <AboutSection
        autoCheckUpdates={autoCheck}
        onAutoCheckUpdatesChange={onChange}
      />
    </I18nextProvider>,
  );
  return { ...utils, onChange };
};

describe("AboutSection", () => {
  beforeEach(() => {
    vi.mocked(getVersion).mockReset();
    vi.mocked(openUrl).mockReset();
  });

  it("renders app name, description and author", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.1.0");
    await renderSection();
    expect(screen.getByText("DonutTabs")).toBeTruthy();
    expect(screen.getByText(/sites, apps e arquivos favoritos/i)).toBeTruthy();
    expect(screen.getByText(/Yuri Hemmel/)).toBeTruthy();
  });

  it("loads and displays the runtime version", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.2.3");
    await renderSection();
    await waitFor(() => {
      expect(screen.getByTestId("about-version").textContent).toContain("1.2.3");
    });
  });

  it("shows a placeholder while the version is resolving", async () => {
    vi.mocked(getVersion).mockReturnValue(new Promise(() => {}));
    await renderSection();
    expect(screen.getByTestId("about-version").textContent).toBe("…");
  });

  it("opens the repository URL via openUrl when the repo link is clicked", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.1.0");
    vi.mocked(openUrl).mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderSection();
    await user.click(screen.getByTestId("about-repo-link"));
    expect(openUrl).toHaveBeenCalledWith("https://github.com/YuriHemmel/DonutTabs");
  });

  it("opens the Ko-fi URL via openUrl when the support button is clicked", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.1.0");
    vi.mocked(openUrl).mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderSection();
    await user.click(screen.getByTestId("about-kofi-button"));
    expect(openUrl).toHaveBeenCalledWith("https://ko-fi.com/yurihm");
  });

  it("embeds the UpdateCard with the auto-check toggle reflecting the prop", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.1.0");
    await renderSection(true);
    await waitFor(() => {
      expect(screen.getByTestId("update-card")).toBeTruthy();
    });
    const cb = screen.getByTestId("auto-check-updates-toggle");
    expect(cb.getAttribute("aria-checked")).toBe("true");
  });

  it("propagates auto-check toggle changes to the callback", async () => {
    vi.mocked(getVersion).mockResolvedValue("1.1.0");
    const user = userEvent.setup();
    const { onChange } = await renderSection(true);
    await user.click(screen.getByTestId("auto-check-updates-toggle"));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
