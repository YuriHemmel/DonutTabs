import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { createI18n } from "../../core/i18n";
import { TabSearchOverlay } from "../TabSearchOverlay";
import type { Tab } from "../../core/types/Tab";

function tab(id: string, name: string, icon: string | null = null): Tab {
  return {
    id,
    name,
    icon,
    order: 0,
    openMode: "reuseOrNewWindow",
    items: [],
    kind: "leaf",
    children: [],
    focusIfOpen: false,
  } as Tab;
}

function group(id: string, name: string, children: Tab[]): Tab {
  return {
    id,
    name,
    icon: null,
    order: 0,
    openMode: "reuseOrNewWindow",
    items: [],
    kind: "group",
    children,
    focusIfOpen: false,
  } as Tab;
}

async function renderOverlay(
  tabs: Tab[],
  onSelect = vi.fn(),
  onClose = vi.fn(),
) {
  const i18n = await createI18n("pt-BR");
  const utils = render(
    <I18nextProvider i18n={i18n}>
      <TabSearchOverlay tabs={tabs} onSelect={onSelect} onClose={onClose} />
    </I18nextProvider>,
  );
  return { ...utils, onSelect, onClose };
}

const SAMPLE: Tab[] = [
  tab("a", "Trabalho"),
  tab("b", "Pessoal"),
  tab("c", "Estudos"),
];

describe("TabSearchOverlay", () => {
  it("renders the input and one row per tab on mount", async () => {
    await renderOverlay(SAMPLE);
    expect(screen.getByTestId("search-input")).toBeTruthy();
    expect(screen.getByTestId("search-row-0")).toBeTruthy();
    expect(screen.getByTestId("search-row-1")).toBeTruthy();
    expect(screen.getByTestId("search-row-2")).toBeTruthy();
  });

  it("filters rows by substring as the user types", async () => {
    const user = userEvent.setup();
    await renderOverlay(SAMPLE);
    await user.type(screen.getByTestId("search-input"), "trab");
    expect(screen.getByTestId("search-row-0").textContent).toContain("Trabalho");
    expect(screen.queryByTestId("search-row-1")).toBeNull();
  });

  it("ArrowDown moves the selection (with wrap-around)", async () => {
    await renderOverlay(SAMPLE);
    expect(
      screen.getByTestId("search-row-0").getAttribute("aria-selected"),
    ).toBe("true");
    fireEvent.keyDown(screen.getByTestId("search-overlay"), {
      key: "ArrowDown",
    });
    expect(
      screen.getByTestId("search-row-1").getAttribute("aria-selected"),
    ).toBe("true");
    fireEvent.keyDown(screen.getByTestId("search-overlay"), {
      key: "ArrowDown",
    });
    fireEvent.keyDown(screen.getByTestId("search-overlay"), {
      key: "ArrowDown",
    });
    expect(
      screen.getByTestId("search-row-0").getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("Enter on the highlighted row calls onSelect with that tab id", async () => {
    const { onSelect } = await renderOverlay(SAMPLE);
    fireEvent.keyDown(screen.getByTestId("search-overlay"), { key: "ArrowDown" });
    fireEvent.keyDown(screen.getByTestId("search-overlay"), { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("Escape closes the overlay", async () => {
    const { onClose } = await renderOverlay(SAMPLE);
    fireEvent.keyDown(screen.getByTestId("search-overlay"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Enter with no results is a no-op", async () => {
    const user = userEvent.setup();
    const { onSelect } = await renderOverlay(SAMPLE);
    await user.type(screen.getByTestId("search-input"), "xyzzy");
    expect(screen.getByTestId("search-empty")).toBeTruthy();
    fireEvent.keyDown(screen.getByTestId("search-overlay"), { key: "Enter" });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("clicking a row dispatches onSelect", async () => {
    const { onSelect } = await renderOverlay(SAMPLE);
    fireEvent.click(screen.getByTestId("search-row-2"));
    expect(onSelect).toHaveBeenCalledWith("c");
  });

  it("hovering a row updates the selection", async () => {
    await renderOverlay(SAMPLE);
    fireEvent.mouseEnter(screen.getByTestId("search-row-2"));
    expect(
      screen.getByTestId("search-row-2").getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("clicking the backdrop closes the overlay", async () => {
    const { onClose } = await renderOverlay(SAMPLE);
    fireEvent.mouseDown(screen.getByTestId("search-overlay"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("dialog exposes aria-modal=true for screen readers", async () => {
    await renderOverlay(SAMPLE);
    expect(
      screen.getByTestId("search-overlay").getAttribute("aria-modal"),
    ).toBe("true");
  });

  describe("group drill-in", () => {
    const NESTED: Tab[] = [
      tab("leaf-root", "Trabalho"),
      group("g1", "Estudos", [
        tab("rust", "Rust"),
        tab("react", "React"),
        group("g2", "Cursos", [tab("udemy", "Udemy")]),
      ]),
    ];

    it("group rows render a badge marker", async () => {
      await renderOverlay(NESTED);
      // Order matches NESTED: row-0 = leaf, row-1 = group.
      expect(screen.queryByTestId("search-row-group-badge-0")).toBeNull();
      expect(screen.getByTestId("search-row-group-badge-1")).toBeTruthy();
    });

    it("Enter on a group drills in instead of calling onSelect", async () => {
      const { onSelect } = await renderOverlay(NESTED);
      fireEvent.keyDown(screen.getByTestId("search-overlay"), { key: "ArrowDown" });
      fireEvent.keyDown(screen.getByTestId("search-overlay"), { key: "Enter" });
      expect(onSelect).not.toHaveBeenCalled();
      expect(screen.getByTestId("search-breadcrumb")).toBeTruthy();
      expect(screen.getByTestId("search-row-0").textContent).toContain("Rust");
      expect(screen.getByTestId("search-row-1").textContent).toContain("React");
      expect(screen.getByTestId("search-row-2").textContent).toContain("Cursos");
    });

    it("clicking a group row drills in", async () => {
      const { onSelect } = await renderOverlay(NESTED);
      fireEvent.click(screen.getByTestId("search-row-1"));
      expect(onSelect).not.toHaveBeenCalled();
      expect(screen.getByTestId("search-breadcrumb")).toBeTruthy();
    });

    it("after drilling, selecting a leaf calls onSelect with its id", async () => {
      const { onSelect } = await renderOverlay(NESTED);
      fireEvent.click(screen.getByTestId("search-row-1")); // enter "Estudos"
      fireEvent.click(screen.getByTestId("search-row-0")); // pick "Rust"
      expect(onSelect).toHaveBeenCalledWith("rust");
    });

    it("drilling resets the query and selection", async () => {
      const user = userEvent.setup();
      await renderOverlay(NESTED);
      await user.type(screen.getByTestId("search-input"), "estud");
      // Only "Estudos" matches; row 0 is the group.
      fireEvent.keyDown(screen.getByTestId("search-overlay"), { key: "Enter" });
      const input = screen.getByTestId("search-input") as HTMLInputElement;
      expect(input.value).toBe("");
      expect(
        screen.getByTestId("search-row-0").getAttribute("aria-selected"),
      ).toBe("true");
    });

    it("Escape pops one level when inside a group instead of closing", async () => {
      const { onClose } = await renderOverlay(NESTED);
      fireEvent.click(screen.getByTestId("search-row-1")); // enter "Estudos"
      fireEvent.keyDown(screen.getByTestId("search-overlay"), { key: "Escape" });
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.queryByTestId("search-breadcrumb")).toBeNull();
      // Back at root: "Trabalho" + "Estudos".
      expect(screen.getByTestId("search-row-0").textContent).toContain("Trabalho");
      expect(screen.getByTestId("search-row-1").textContent).toContain("Estudos");
    });

    it("Escape at root still closes the overlay", async () => {
      const { onClose } = await renderOverlay(NESTED);
      fireEvent.keyDown(screen.getByTestId("search-overlay"), { key: "Escape" });
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("breadcrumb root segment jumps back to the top of the tree", async () => {
      await renderOverlay(NESTED);
      fireEvent.click(screen.getByTestId("search-row-1")); // root → Estudos
      fireEvent.click(screen.getByTestId("search-row-2")); // Estudos → Cursos
      expect(screen.getByTestId("search-breadcrumb-0").textContent).toContain(
        "Estudos",
      );
      expect(screen.getByTestId("search-breadcrumb-1").textContent).toContain(
        "Cursos",
      );
      fireEvent.click(screen.getByTestId("search-breadcrumb-root"));
      expect(screen.queryByTestId("search-breadcrumb")).toBeNull();
      expect(screen.getByTestId("search-row-0").textContent).toContain("Trabalho");
    });

    it("breadcrumb intermediate segment truncates the path", async () => {
      await renderOverlay(NESTED);
      fireEvent.click(screen.getByTestId("search-row-1")); // → Estudos
      fireEvent.click(screen.getByTestId("search-row-2")); // → Cursos
      // breadcrumb-0 = Estudos (clickable), breadcrumb-1 = Cursos (current span)
      fireEvent.click(screen.getByTestId("search-breadcrumb-0"));
      // Now at Estudos level — children: Rust, React, Cursos.
      expect(screen.getByTestId("search-row-0").textContent).toContain("Rust");
      expect(screen.getByTestId("search-row-2").textContent).toContain("Cursos");
    });
  });
});
