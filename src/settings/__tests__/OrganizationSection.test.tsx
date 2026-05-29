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
        onMoveTab={vi.fn()}
        onSwapTabs={vi.fn()}
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
        onMoveTab={vi.fn()}
        onSwapTabs={vi.fn()}
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
        onMoveTab={vi.fn()}
        onSwapTabs={vi.fn()}
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
        onMoveTab={vi.fn()}
        onSwapTabs={vi.fn()}
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
        onMoveTab={vi.fn()}
        onSwapTabs={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("org-empty")).toBeNull();
  });

  // ---------- Issue #109: cross-ring drag (move tab between levels) ----------

  const SIZE = 240;
  // Raio médio entre inner (0.22) e outer (0.46) ratios → garante hit dentro
  // do anel ao mirar o centro de uma fatia.
  const MID = SIZE * 0.34;

  function mockRect(testId: string, left: number, top: number) {
    const el = screen.getByTestId(testId);
    el.getBoundingClientRect = () =>
      ({
        left,
        top,
        right: left + SIZE,
        bottom: top + SIZE,
        width: SIZE,
        height: SIZE,
        x: left,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;
    return el;
  }

  /** Ponto (clientX/clientY) no centro angular da fatia `slot` de um donut
   *  posicionado em (left, top), com `total` fatias. Slot 0 = topo (12h). */
  function slicePoint(left: number, top: number, slot: number, total: number) {
    const step = (Math.PI * 2) / total;
    const angle = -Math.PI / 2 + step * slot;
    return {
      clientX: left + SIZE / 2 + MID * Math.cos(angle),
      clientY: top + SIZE / 2 + MID * Math.sin(angle),
    };
  }

  it("moves a root tab into a group's '+' (append to end of level)", async () => {
    const onMoveTab = vi.fn();
    const onReorderTabs = vi.fn();
    const tabs = [
      leaf("t0", "Tab 0", 0),
      group("g1", "Grupo", 1, [leaf("c0", "Child 0", 0)]),
    ];
    await renderWithI18n(
      <OrganizationSection
        profile={profile(tabs)}
        itemsPerPage={6}
        onSetItemsPerPage={vi.fn()}
        onReorderTabs={onReorderTabs}
        onMoveTab={onMoveTab}
        onSwapTabs={vi.fn()}
      />,
    );

    // Root donut em (0,0); group donut em (300,0).
    mockRect("org-donut-root-0", 0, 0);
    mockRect("org-donut-group:g1-0", 300, 0);

    // Inicia o arrasto na fatia t0 do root.
    fireEvent.pointerDown(screen.getByTestId("org-donut-root-0-slice-t0"), {
      clientX: 120,
      clientY: 40,
    });
    // Solta sobre o "+" do group (children=[c0] → total 2, "+" = slot 1).
    const drop = slicePoint(300, 0, 1, 2);
    fireEvent.pointerUp(window, drop);

    expect(onReorderTabs).not.toHaveBeenCalled();
    // "+" → append no fim do nível de destino (nº de filhos = 1).
    expect(onMoveTab).toHaveBeenCalledWith("t0", [], ["g1"], 1);
  });

  it("swaps a group child with a root tab on cross-ring drop onto a tab", async () => {
    const onMoveTab = vi.fn();
    const onSwapTabs = vi.fn();
    const tabs = [
      ...Array.from({ length: 6 }, (_, i) => leaf(`t${i}`, `T${i}`, i)),
      group("g1", "Grupo", 6, [leaf("c0", "Child 0", 0)]),
      group("g2", "Grupo 2", 7, []),
    ];
    await renderWithI18n(
      <OrganizationSection
        profile={profile(tabs)}
        itemsPerPage={6}
        onSetItemsPerPage={vi.fn()}
        onReorderTabs={vi.fn()}
        onMoveTab={onMoveTab}
        onSwapTabs={onSwapTabs}
      />,
    );
    // root: 8 itens → page1 [t0..t5], page2 [g1, g2] + "+".
    mockRect("org-donut-root-0", 0, 0);
    mockRect("org-donut-root-1", 0, 300);
    mockRect("org-donut-group:g1-0", 400, 0);

    fireEvent.pointerDown(screen.getByTestId("org-donut-group:g1-0-slice-c0"), {
      clientX: 520,
      clientY: 40,
    });
    // Solta SOBRE g2 (página 2, total 3, slot 1) → troca c0 e g2 de nível.
    const drop = slicePoint(0, 300, 1, 3);
    fireEvent.pointerUp(window, drop);

    expect(onMoveTab).not.toHaveBeenCalled();
    expect(onSwapTabs).toHaveBeenCalledWith("c0", ["g1"], "g2", []);
  });

  it("moves a tab onto the root's 2nd-page '+' → append to end of root", async () => {
    const onMoveTab = vi.fn();
    const onSwapTabs = vi.fn();
    const tabs = [
      ...Array.from({ length: 6 }, (_, i) => leaf(`t${i}`, `T${i}`, i)),
      group("g1", "Grupo", 6, [leaf("c0", "Child 0", 0)]),
      group("g2", "Grupo 2", 7, []),
    ];
    await renderWithI18n(
      <OrganizationSection
        profile={profile(tabs)}
        itemsPerPage={6}
        onSetItemsPerPage={vi.fn()}
        onReorderTabs={vi.fn()}
        onMoveTab={onMoveTab}
        onSwapTabs={onSwapTabs}
      />,
    );
    mockRect("org-donut-root-0", 0, 0);
    mockRect("org-donut-root-1", 0, 300);
    mockRect("org-donut-group:g1-0", 400, 0);

    fireEvent.pointerDown(screen.getByTestId("org-donut-group:g1-0-slice-c0"), {
      clientX: 520,
      clientY: 40,
    });
    // Solta no "+" da página 2 (total 3, slot 2) → append no fim da raiz
    // (índice 8, depois de g1 e g2).
    const drop = slicePoint(0, 300, 2, 3);
    fireEvent.pointerUp(window, drop);

    expect(onSwapTabs).not.toHaveBeenCalled();
    expect(onMoveTab).toHaveBeenCalledWith("c0", ["g1"], [], 8);
  });

  it("swaps a root tab with a group child on cross-ring drop onto a child", async () => {
    const onMoveTab = vi.fn();
    const onSwapTabs = vi.fn();
    const tabs = [
      leaf("t0", "Tab 0", 0),
      group("g1", "Grupo", 1, [leaf("c0", "Child 0", 0), leaf("c1", "Child 1", 1)]),
    ];
    await renderWithI18n(
      <OrganizationSection
        profile={profile(tabs)}
        itemsPerPage={6}
        onSetItemsPerPage={vi.fn()}
        onReorderTabs={vi.fn()}
        onMoveTab={onMoveTab}
        onSwapTabs={onSwapTabs}
      />,
    );

    mockRect("org-donut-root-0", 0, 0);
    mockRect("org-donut-group:g1-0", 300, 0);

    fireEvent.pointerDown(screen.getByTestId("org-donut-root-0-slice-t0"), {
      clientX: 120,
      clientY: 40,
    });
    // group: children [c0, c1] + "+" → total 3. Slot 1 = c1 → troca t0 ↔ c1.
    const drop = slicePoint(300, 0, 1, 3);
    fireEvent.pointerUp(window, drop);

    expect(onMoveTab).not.toHaveBeenCalled();
    expect(onSwapTabs).toHaveBeenCalledWith("t0", [], "c1", ["g1"]);
  });

  it("still reorders within the same ring (no move) on same-ring drop", async () => {
    const onMoveTab = vi.fn();
    const onReorderTabs = vi.fn();
    const tabs = [
      leaf("t0", "Tab 0", 0),
      leaf("t1", "Tab 1", 1),
      leaf("t2", "Tab 2", 2),
    ];
    await renderWithI18n(
      <OrganizationSection
        profile={profile(tabs)}
        itemsPerPage={6}
        onSetItemsPerPage={vi.fn()}
        onReorderTabs={onReorderTabs}
        onMoveTab={onMoveTab}
        onSwapTabs={vi.fn()}
      />,
    );

    mockRect("org-donut-root-0", 0, 0);

    fireEvent.pointerDown(screen.getByTestId("org-donut-root-0-slice-t0"), {
      clientX: 120,
      clientY: 40,
    });
    // root: [t0, t1, t2] + "+" → total 4. Slot 1 = t1 → swap t0/t1.
    const drop = slicePoint(0, 0, 1, 4);
    fireEvent.pointerUp(window, drop);

    expect(onMoveTab).not.toHaveBeenCalled();
    expect(onReorderTabs).toHaveBeenCalledWith("p1", ["t1", "t0", "t2"], undefined);
  });

  it("does not move a group into a sub-ring (groups stay at root)", async () => {
    const onMoveTab = vi.fn();
    const onReorderTabs = vi.fn();
    const onSwapTabs = vi.fn();
    const tabs = [
      leaf("t0", "Tab 0", 0),
      group("g1", "Grupo", 1, [leaf("c0", "Child 0", 0)]),
    ];
    await renderWithI18n(
      <OrganizationSection
        profile={profile(tabs)}
        itemsPerPage={6}
        onSetItemsPerPage={vi.fn()}
        onReorderTabs={onReorderTabs}
        onMoveTab={onMoveTab}
        onSwapTabs={onSwapTabs}
      />,
    );

    mockRect("org-donut-root-0", 0, 0);
    mockRect("org-donut-group:g1-0", 300, 0);

    // Arrasta o GRUPO g1 (root: [t0, g1] + "+" → total 3, slot 1 = g1).
    fireEvent.pointerDown(screen.getByTestId("org-donut-root-0-slice-g1"), {
      clientX: 120,
      clientY: 200,
    });
    const drop = slicePoint(300, 0, 1, 2);
    fireEvent.pointerUp(window, drop);

    expect(onMoveTab).not.toHaveBeenCalled();
    expect(onReorderTabs).not.toHaveBeenCalled();
    expect(onSwapTabs).not.toHaveBeenCalled();
  });
});
