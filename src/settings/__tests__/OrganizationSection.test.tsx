import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../core/i18n";
import { OrganizationSection } from "../OrganizationSection";
import type { Profile } from "../../core/types/Profile";
import type { Tab } from "../../core/types/Tab";
import type { ReactElement } from "react";

async function renderWithI18n(ui: ReactElement) {
  const i18n = await createI18n("pt-BR");
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

const leaf = (id: string, name: string, order: number): Tab => ({
  id,
  name,
  icon: null,
  order,
  openMode: "reuseOrNewWindow",
  items: [],
  kind: "leaf",
  children: [],
  focusIfOpen: false,
});

const group = (id: string, name: string, order: number, children: Tab[]): Tab => ({
  id,
  name,
  icon: null,
  order,
  openMode: "reuseOrNewWindow",
  items: [],
  kind: "group",
  children,
  focusIfOpen: false,
});

const profile = (tabs: Tab[]): Profile => ({
  id: "p1",
  name: "Padrão",
  icon: null,
  shortcut: "CommandOrControl+Space",
  theme: "dark",
  tabs,
  allowScripts: false,
  themeOverrides: null,
});

describe("OrganizationSection", () => {
  it("renders one root donut per page (7 tabs / ipp 6 → 2 pages)", async () => {
    const tabs = Array.from({ length: 7 }, (_, i) => leaf(`t${i}`, `Tab ${i}`, i));
    await renderWithI18n(
      <OrganizationSection
        profile={profile(tabs)}
        itemsPerPage={6}
        onSetItemsPerPage={vi.fn()}
        onReorderTabs={vi.fn()}
      />,
    );
    expect(screen.getByTestId("org-donut-root-0")).toBeTruthy();
    expect(screen.getByTestId("org-donut-root-1")).toBeTruthy();
    expect(screen.queryByTestId("org-donut-root-2")).toBeNull();
  });

  it("renders a separate ring with header and its own donuts for each group", async () => {
    const children = Array.from({ length: 3 }, (_, i) => leaf(`c${i}`, `Child ${i}`, i));
    const tabs = [leaf("t0", "Tab 0", 0), group("g1", "Trabalho", 1, children)];
    await renderWithI18n(
      <OrganizationSection
        profile={profile(tabs)}
        itemsPerPage={6}
        onSetItemsPerPage={vi.fn()}
        onReorderTabs={vi.fn()}
      />,
    );
    expect(screen.getByTestId("org-ring-root")).toBeTruthy();
    expect(screen.getByTestId("org-ring-group:g1")).toBeTruthy();
    expect(screen.getByTestId("org-group-header-g1")).toBeTruthy();
    // 3 children + "+" fit in one page.
    expect(screen.getByTestId("org-donut-group:g1-0")).toBeTruthy();
    expect(screen.queryByTestId("org-donut-group:g1-1")).toBeNull();
  });

  it("calls onSetItemsPerPage when the items-per-page select changes", async () => {
    const onSet = vi.fn();
    await renderWithI18n(
      <OrganizationSection
        profile={profile([leaf("t0", "A", 0)])}
        itemsPerPage={6}
        onSetItemsPerPage={onSet}
        onReorderTabs={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId("org-items-per-page"), {
      target: { value: "4" },
    });
    expect(onSet).toHaveBeenCalledWith(4);
  });

  it("shows the empty hint when the profile has no tabs", async () => {
    await renderWithI18n(
      <OrganizationSection
        profile={profile([])}
        itemsPerPage={6}
        onSetItemsPerPage={vi.fn()}
        onReorderTabs={vi.fn()}
      />,
    );
    expect(screen.getByTestId("org-empty")).toBeTruthy();
  });

  it("does not show the empty hint when there are tabs", async () => {
    await renderWithI18n(
      <OrganizationSection
        profile={profile([leaf("t0", "A", 0)])}
        itemsPerPage={6}
        onSetItemsPerPage={vi.fn()}
        onReorderTabs={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("org-empty")).toBeNull();
  });
});
