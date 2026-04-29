import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import type { ComponentProps } from "react";
import { createI18n } from "../../core/i18n";
import { AppPicker } from "../AppPicker";
import type { InstalledApp } from "../../core/types/InstalledApp";

const SAMPLE: InstalledApp[] = [
  { name: "Brave", path: "/Applications/Brave.app" },
  { name: "Firefox", path: "/Applications/Firefox.app" },
  { name: "VSCode", path: "/usr/local/bin/code" },
];

type Props = ComponentProps<typeof AppPicker>;

async function renderPicker(overrides: Partial<Props> = {}) {
  const i18n = await createI18n("pt-BR");
  const merged: Props = {
    open: true,
    onSelect: vi.fn(),
    onClose: vi.fn(),
    fetcher: () => Promise.resolve(SAMPLE),
    ...overrides,
  };
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <AppPicker {...merged} />
    </I18nextProvider>,
  );
  return { ...utils, props: merged };
}

describe("AppPicker", () => {
  it("renders nothing when closed", async () => {
    await renderPicker({ open: false });
    expect(screen.queryByTestId("app-picker-overlay")).toBeNull();
  });

  it("renders loading state on open and switches to loaded", async () => {
    let resolveFn: (apps: InstalledApp[]) => void = () => {};
    const fetcher = () =>
      new Promise<InstalledApp[]>((resolve) => {
        resolveFn = resolve;
      });
    await renderPicker({ fetcher });
    expect(screen.getByTestId("app-picker-loading")).toBeTruthy();
    resolveFn(SAMPLE);
    await waitFor(() => {
      expect(screen.queryByTestId("app-picker-loading")).toBeNull();
    });
    expect(screen.getByTestId("app-picker-row-0")).toBeTruthy();
  });

  it("renders error state when fetcher rejects", async () => {
    const fetcher = () => Promise.reject(new Error("boom"));
    await renderPicker({ fetcher });
    await waitFor(() => {
      expect(screen.getByTestId("app-picker-error")).toBeTruthy();
    });
  });

  it("filters by substring on name and path", async () => {
    const user = userEvent.setup();
    await renderPicker();
    await waitFor(() => {
      expect(screen.getByTestId("app-picker-row-0")).toBeTruthy();
    });
    await user.type(screen.getByTestId("app-picker-search"), "fire");
    expect(screen.getByTestId("app-picker-row-0").textContent).toContain("Firefox");
    expect(screen.queryByTestId("app-picker-row-1")).toBeNull();
  });

  it("Enter on highlighted row calls onSelect with app name + onClose", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    await renderPicker({ onSelect, onClose });
    await waitFor(() =>
      expect(screen.getByTestId("app-picker-row-0")).toBeTruthy(),
    );
    fireEvent.keyDown(screen.getByTestId("app-picker-overlay"), {
      key: "ArrowDown",
    });
    fireEvent.keyDown(screen.getByTestId("app-picker-overlay"), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("Firefox");
    expect(onClose).toHaveBeenCalled();
  });

  it("ArrowDown wraps around at last row", async () => {
    await renderPicker();
    await waitFor(() =>
      expect(screen.getByTestId("app-picker-row-0")).toBeTruthy(),
    );
    const overlay = screen.getByTestId("app-picker-overlay");
    expect(
      screen.getByTestId("app-picker-row-0").getAttribute("aria-selected"),
    ).toBe("true");
    fireEvent.keyDown(overlay, { key: "ArrowDown" });
    fireEvent.keyDown(overlay, { key: "ArrowDown" });
    fireEvent.keyDown(overlay, { key: "ArrowDown" });
    expect(
      screen.getByTestId("app-picker-row-0").getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("Escape calls onClose", async () => {
    const onClose = vi.fn();
    await renderPicker({ onClose });
    await waitFor(() =>
      expect(screen.getByTestId("app-picker-row-0")).toBeTruthy(),
    );
    fireEvent.keyDown(screen.getByTestId("app-picker-overlay"), {
      key: "Escape",
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking a row dispatches onSelect with the row name + onClose", async () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    await renderPicker({ onSelect, onClose });
    await waitFor(() =>
      expect(screen.getByTestId("app-picker-row-2")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("app-picker-row-2"));
    expect(onSelect).toHaveBeenCalledWith("VSCode");
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking the cancel button calls onClose", async () => {
    const onClose = vi.fn();
    await renderPicker({ onClose });
    await waitFor(() =>
      expect(screen.getByTestId("app-picker-row-0")).toBeTruthy(),
    );
    fireEvent.click(screen.getByTestId("app-picker-cancel"));
    expect(onClose).toHaveBeenCalled();
  });

  it("clicking the backdrop calls onClose", async () => {
    const onClose = vi.fn();
    await renderPicker({ onClose });
    await waitFor(() =>
      expect(screen.getByTestId("app-picker-row-0")).toBeTruthy(),
    );
    fireEvent.mouseDown(screen.getByTestId("app-picker-overlay"));
    expect(onClose).toHaveBeenCalled();
  });

  it("refresh button re-invokes the fetcher", async () => {
    const fetcher = vi.fn().mockResolvedValue(SAMPLE);
    await renderPicker({ fetcher });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId("app-picker-refresh"));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  });

  it("renders empty state when filter has no matches", async () => {
    const user = userEvent.setup();
    await renderPicker();
    await waitFor(() =>
      expect(screen.getByTestId("app-picker-row-0")).toBeTruthy(),
    );
    await user.type(screen.getByTestId("app-picker-search"), "zzznothing");
    expect(screen.getByTestId("app-picker-empty")).toBeTruthy();
  });
});
