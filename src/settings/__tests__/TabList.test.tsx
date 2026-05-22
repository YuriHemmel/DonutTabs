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
  kind: "leaf",
  children: [],
});

const group = (
  id: string,
  name: string,
  order: number,
  children: Tab[],
): Tab => ({
  id,
  name,
  icon: null,
  order,
  openMode: "reuseOrNewWindow",
  items: [],
  kind: "group",
  children,
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
        maxDepth={2}
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
        maxDepth={2}
      />,
    );
    const rowA = screen.getByTestId("tab-row-a");
    const rowB = screen.getByTestId("tab-row-b");
    expect(rowB.textContent).toContain("B");
    expect(rowA.textContent).toContain("A");
    expect(rowA.getAttribute("data-selected")).toBe("true");
    expect(rowB.getAttribute("data-selected")).toBe("false");
  });

  it("calls onSelect with the tab id and empty parentPath at root level", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    await renderWithI18n(
      <TabList
        tabs={[tab("a", "A", 0)]}
        selectedId={null}
        onSelect={onSelect}
        onAdd={() => {}}
        onReorder={() => {}}
        maxDepth={2}
      />,
    );
    await user.click(screen.getByText("A"));
    expect(onSelect).toHaveBeenCalledWith("a", []);
  });

  it("calls onAdd with empty parentPath and leaf kind when clicking the add button", async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    await renderWithI18n(
      <TabList
        tabs={[]}
        selectedId={null}
        onSelect={() => {}}
        onAdd={onAdd}
        onReorder={() => {}}
        maxDepth={2}
      />,
    );
    await user.click(screen.getByRole("button", { name: /adicionar aba/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith([], "leaf");
  });

  it("does not mark the add button as draggable", async () => {
    await renderWithI18n(
      <TabList
        tabs={[tab("a", "A", 0)]}
        selectedId={null}
        onSelect={() => {}}
        onAdd={() => {}}
        onReorder={() => {}}
        maxDepth={2}
      />,
    );
    const addBtn = screen.getByTestId("tab-add");
    expect(addBtn.getAttribute("draggable")).toBeNull();
  });

  it("dragging the first tab below the last emits onReorder with empty parentPath and the new order", async () => {
    const onReorder = vi.fn();
    await renderWithI18n(
      <TabList
        tabs={[tab("a", "A", 0), tab("b", "B", 1), tab("c", "C", 2)]}
        selectedId={null}
        onSelect={() => {}}
        onAdd={() => {}}
        onReorder={onReorder}
        maxDepth={2}
      />,
    );
    const rows = screen.getAllByTestId("tab-row-li");
    const [first, , last] = rows;
    mockRect(last, 60, 20);

    fireEvent.dragStart(first);
    fireEvent.dragOver(last, { clientY: 80 });
    fireEvent.drop(last);

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith([], ["b", "c", "a"]);
  });

  it("toggles group expansion on caret click without selecting the row", async () => {
    const child = tab("c1", "Child", 0);
    const g = group("g1", "Group", 0, [child]);
    const onSelect = vi.fn();
    await renderWithI18n(
      <TabList
        tabs={[g]}
        selectedId={null}
        onSelect={onSelect}
        onAdd={() => {}}
        onReorder={() => {}}
        maxDepth={2}
      />,
    );
    expect(screen.queryByTestId("tab-row-c1")).toBeNull();

    fireEvent.click(screen.getByTestId("tab-row-caret-g1"));

    expect(screen.getByTestId("tab-row-c1")).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("invokes onSelect with parentPath when child is clicked", async () => {
    const child = tab("c1", "Child", 0);
    const g = group("g1", "Group", 0, [child]);
    const onSelect = vi.fn();
    await renderWithI18n(
      <TabList
        tabs={[g]}
        selectedId={null}
        onSelect={onSelect}
        onAdd={() => {}}
        onReorder={() => {}}
        maxDepth={2}
      />,
    );
    fireEvent.click(screen.getByTestId("tab-row-caret-g1"));
    fireEvent.click(screen.getByTestId("tab-row-c1"));
    expect(onSelect).toHaveBeenCalledWith("c1", ["g1"]);
  });

  it("calls onAdd with parentPath when '+ Adicionar aba' inside group is clicked", async () => {
    const g = group("g1", "Group", 0, []);
    const onAdd = vi.fn();
    await renderWithI18n(
      <TabList
        tabs={[g]}
        selectedId={null}
        onSelect={() => {}}
        onAdd={onAdd}
        onReorder={() => {}}
        maxDepth={2}
      />,
    );
    fireEvent.click(screen.getByTestId("tab-row-caret-g1"));
    fireEvent.click(screen.getByTestId("group-add-leaf-g1"));
    expect(onAdd).toHaveBeenCalledWith(["g1"], "leaf");
  });

  it("hides '+ subgrupo' when adding it would exceed maxDepth", async () => {
    const grandchildGroup = group("gg1", "Sub", 0, []);
    const childGroup = group("cg1", "Mid", 0, [grandchildGroup]);
    await renderWithI18n(
      <TabList
        tabs={[childGroup]}
        selectedId={null}
        onSelect={() => {}}
        onAdd={() => {}}
        onReorder={() => {}}
        maxDepth={2}
      />,
    );
    fireEvent.click(screen.getByTestId("tab-row-caret-cg1"));
    // Inside cg1 (myDepth=1) o próximo nível seria 2 — atinge maxDepth=2
    // (limite 0..maxDepth-1). "+ subgrupo" some; "+ aba" continua.
    expect(screen.queryByTestId("group-add-group-cg1")).toBeNull();
    expect(screen.getByTestId("group-add-leaf-cg1")).toBeTruthy();
  });

  it("shows '+ subgrupo' inside a root group when maxDepth allows another level", async () => {
    const g = group("g1", "Group", 0, []);
    await renderWithI18n(
      <TabList
        tabs={[g]}
        selectedId={null}
        onSelect={() => {}}
        onAdd={() => {}}
        onReorder={() => {}}
        maxDepth={3}
      />,
    );
    fireEvent.click(screen.getByTestId("tab-row-caret-g1"));
    // myDepth = 1, canAddSubgroup = (1 < 3-1) = true → mostrado.
    expect(screen.getByTestId("group-add-group-g1")).toBeTruthy();
  });
});
