import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../core/i18n";
import { TabList } from "../TabList";
import type { Tab } from "../../core/types/Tab";
import type { ReactElement } from "react";

async function renderWithI18n(ui: ReactElement) {
  const i18n = await createI18n("pt-BR");
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

const tab = (id: string, name: string, order: number): Tab => ({
  id,
  name,
  icon: null,
  order,
  openMode: "reuseOrNewWindow",
  items: [],
});

describe("TabList", () => {
  it("renders empty state when there are no tabs", async () => {
    await renderWithI18n(
      <TabList tabs={[]} selectedId={null} onSelect={() => {}} onAdd={() => {}} />,
    );
    expect(screen.getByText(/nenhuma aba cadastrada/i)).toBeTruthy();
  });

  it("renders tabs sorted by order and highlights the selected one", async () => {
    const t0 = tab("a", "A", 1);
    const t1 = tab("b", "B", 0);
    await renderWithI18n(
      <TabList tabs={[t0, t1]} selectedId="a" onSelect={() => {}} onAdd={() => {}} />,
    );
    const rows = screen
      .getAllByRole("button")
      .filter((b) => b.getAttribute("data-testid") === "tab-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("B");
    expect(rows[1].textContent).toContain("A");
    expect(rows[1].getAttribute("data-selected")).toBe("true");
  });

  it("calls onSelect with the tab id on click", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    await renderWithI18n(
      <TabList
        tabs={[tab("a", "A", 0)]}
        selectedId={null}
        onSelect={onSelect}
        onAdd={() => {}}
      />,
    );
    await user.click(screen.getByText("A"));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("calls onAdd when clicking the add button", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    await renderWithI18n(
      <TabList tabs={[]} selectedId={null} onSelect={() => {}} onAdd={onAdd} />,
    );
    await user.click(screen.getByRole("button", { name: /adicionar aba/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});
