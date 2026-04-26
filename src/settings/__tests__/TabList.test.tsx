import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

const mockRect = (el: HTMLElement, top: number, height: number) => {
  el.getBoundingClientRect = () =>
    ({
      top,
      height,
      left: 0,
      right: 0,
      bottom: top + height,
      width: 0,
      x: 0,
      y: top,
      toJSON: () => "",
    }) as DOMRect;
};

describe("TabList", () => {
  it("renders empty state when there are no tabs", async () => {
    await renderWithI18n(
      <TabList
        tabs={[]}
        selectedId={null}
        onSelect={() => {}}
        onAdd={() => {}}
        onReorder={() => {}}
      />,
    );
    expect(screen.getByText(/nenhuma aba cadastrada/i)).toBeTruthy();
  });

  it("renders tabs sorted by order and highlights the selected one", async () => {
    const t0 = tab("a", "A", 1);
    const t1 = tab("b", "B", 0);
    await renderWithI18n(
      <TabList
        tabs={[t0, t1]}
        selectedId="a"
        onSelect={() => {}}
        onAdd={() => {}}
        onReorder={() => {}}
      />,
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
        onReorder={() => {}}
      />,
    );
    await user.click(screen.getByText("A"));
    expect(onSelect).toHaveBeenCalledWith("a");
  });

  it("calls onAdd when clicking the add button", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    await renderWithI18n(
      <TabList
        tabs={[]}
        selectedId={null}
        onSelect={() => {}}
        onAdd={onAdd}
        onReorder={() => {}}
      />,
    );
    await user.click(screen.getByRole("button", { name: /adicionar aba/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it("does not mark the add button as draggable", async () => {
    await renderWithI18n(
      <TabList
        tabs={[tab("a", "A", 0)]}
        selectedId={null}
        onSelect={() => {}}
        onAdd={() => {}}
        onReorder={() => {}}
      />,
    );
    const addBtn = screen.getByTestId("tab-add");
    expect(addBtn.getAttribute("draggable")).toBeNull();
  });

  it("dragging the first tab below the last emits onReorder with the new order", async () => {
    const onReorder = vi.fn();
    await renderWithI18n(
      <TabList
        tabs={[tab("a", "A", 0), tab("b", "B", 1), tab("c", "C", 2)]}
        selectedId={null}
        onSelect={() => {}}
        onAdd={() => {}}
        onReorder={onReorder}
      />,
    );
    const rows = screen.getAllByTestId("tab-row-li");
    const [first, , last] = rows;
    mockRect(last, 60, 20);

    fireEvent.dragStart(first);
    fireEvent.dragOver(last, { clientY: 80 });
    fireEvent.drop(last);

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(["b", "c", "a"]);
  });
});
