import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { Donut } from "../Donut";
import type { Tab } from "../../core/types/Tab";

function makeTab(id: string, name: string, order = 0): Tab {
  return {
    id,
    name,
    icon: null,
    order,
    openMode: "reuseOrNewWindow",
    items: [{ kind: "url", value: "https://example.com", openWith: null, monitor: null , incognito: false}],
    kind: "leaf",
    children: [],
    focusIfOpen: false,
  };
}

const baseProps = {
  size: 400,
  itemsPerPage: 6,
  wheelDirection: "standard" as const,
  onSelect: () => {},
};

describe("Donut", () => {
  it("renders one slice per tab plus a trailing '+' slice", () => {
    const tabs = [makeTab("1", "A", 0), makeTab("2", "B", 1), makeTab("3", "C", 2)];
    const { container } = render(<Donut {...baseProps} tabs={tabs} />);
    const paths = container.querySelectorAll('[data-testid="donut-slice"]');
    expect(paths.length).toBe(4);
  });

  it("renders a single '+' slice when no tabs are registered", () => {
    const { container } = render(<Donut {...baseProps} tabs={[]} />);
    const paths = container.querySelectorAll('[data-testid="donut-slice"]');
    expect(paths.length).toBe(1);
  });

  it("clicking '+' inside an expanded sub-ring fires intent with the parent group path (no duplicate id)", () => {
    const groupTab: Tab = {
      id: "g1",
      name: "Group",
      icon: null,
      order: 0,
      openMode: "reuseOrNewWindow",
      items: [],
      kind: "group",
      children: [],
      focusIfOpen: false,
    };
    const onOpenSettings = vi.fn();
    const { container } = render(
      <Donut {...baseProps} tabs={[groupTab]} onOpenSettings={onOpenSettings} />,
    );
    // Root: 1 group + 1 plus = 2 slices.
    let slices = container.querySelectorAll('[data-testid="donut-slice"]');
    expect(slices).toHaveLength(2);
    fireEvent.click(slices[0]);
    // After expand: root (2) + ring 1 (just plus = 1) = 3.
    slices = container.querySelectorAll('[data-testid="donut-slice"]');
    expect(slices).toHaveLength(3);
    // Last slice = plus in ring 1.
    fireEvent.click(slices[2]);
    expect(onOpenSettings).toHaveBeenCalledWith("new-tab-in-group:g1");
  });

  it("clicking a group slice in the outermost permitted ring is a no-op (MAX_RINGS=2)", () => {
    // Issue #39 — MAX_RINGS = 2 (root + 1 sub). Click em group dentro do
    // ring 1 não expande ring 2 (não há ring 2). Nem o group abre, nem o
    // onSelect é chamado (groups não são tabs).
    const inner: Tab = {
      id: "g2",
      name: "Inner",
      icon: null,
      order: 0,
      openMode: "reuseOrNewWindow",
      items: [],
      kind: "group",
      children: [],
      focusIfOpen: false,
    };
    const outer: Tab = {
      id: "g1",
      name: "Outer",
      icon: null,
      order: 0,
      openMode: "reuseOrNewWindow",
      items: [],
      kind: "group",
      children: [inner],
      focusIfOpen: false,
    };
    const onOpenSettings = vi.fn();
    const onSelect = vi.fn();
    const { container } = render(
      <Donut
        {...baseProps}
        tabs={[outer]}
        onSelect={onSelect}
        onOpenSettings={onOpenSettings}
      />,
    );
    let slices = container.querySelectorAll('[data-testid="donut-slice"]');
    fireEvent.click(slices[0]);
    slices = container.querySelectorAll('[data-testid="donut-slice"]');
    // Root (group g1 + plus = 2) + ring 1 (group g2 + plus = 2) = 4.
    expect(slices).toHaveLength(4);
    // Click no group g2 (ring 1, slice 2) — no-op.
    fireEvent.click(slices[2]);
    slices = container.querySelectorAll('[data-testid="donut-slice"]');
    expect(slices).toHaveLength(4);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("clicking the '+' slice calls onOpenSettings with 'new-tab'", () => {
    const onOpenSettings = vi.fn();
    const onSelect = vi.fn();
    const { container } = render(
      <Donut {...baseProps} tabs={[]} onSelect={onSelect} onOpenSettings={onOpenSettings} />,
    );
    const plusSlice = container.querySelector(
      '[data-testid="donut-slice"]',
    ) as SVGPathElement;
    fireEvent.click(plusSlice);
    expect(onOpenSettings).toHaveBeenCalledWith("new-tab");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("clicking a tab slice calls onSelect with the tab id", () => {
    const onOpenSettings = vi.fn();
    const onSelect = vi.fn();
    const { container } = render(
      <Donut
        {...baseProps}
        tabs={[makeTab("abc", "A", 0)]}
        onSelect={onSelect}
        onOpenSettings={onOpenSettings}
      />,
    );
    const slices = container.querySelectorAll('[data-testid="donut-slice"]');
    fireEvent.click(slices[0]);
    expect(onSelect).toHaveBeenCalledWith("abc");
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it("does not render a gear hit area when onOpenSettings is not provided", () => {
    const { container } = render(<Donut {...baseProps} tabs={[]} />);
    expect(container.querySelector('[data-testid="gear-hit"]')).toBeNull();
  });

  it("calls onOpenSettings when clicking the gear hit area", () => {
    const onOpenSettings = vi.fn();
    const { container } = render(
      <Donut {...baseProps} tabs={[]} onOpenSettings={onOpenSettings} />,
    );
    const hit = container.querySelector('[data-testid="gear-hit"]') as SVGRectElement;
    expect(hit).not.toBeNull();
    fireEvent.click(hit);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("renders only the current page's slices (page 1 of 2 with 7 tabs)", () => {
    const tabs = Array.from({ length: 7 }, (_, i) => makeTab(`t${i}`, `T${i}`, i));
    const { container } = render(<Donut {...baseProps} tabs={tabs} />);
    // Página 1: 6 fatias de tab, sem +
    expect(
      container.querySelectorAll('[data-testid="donut-slice"]'),
    ).toHaveLength(6);
  });

  it("wheel-down advances to next page; wheel-up returns", () => {
    const tabs = Array.from({ length: 7 }, (_, i) => makeTab(`t${i}`, `T${i}`, i));
    const { container } = render(<Donut {...baseProps} tabs={tabs} />);
    const svg = container.querySelector("svg") as SVGSVGElement;

    fireEvent.wheel(svg, { deltaY: 30 });
    // Página 2: 1 tab + "+" = 2 fatias
    expect(
      container.querySelectorAll('[data-testid="donut-slice"]'),
    ).toHaveLength(2);

    fireEvent.wheel(svg, { deltaY: -30 });
    expect(
      container.querySelectorAll('[data-testid="donut-slice"]'),
    ).toHaveLength(6);
  });

  it("inverted wheelDirection reverses navigation", () => {
    const tabs = Array.from({ length: 7 }, (_, i) => makeTab(`t${i}`, `T${i}`, i));
    const { container } = render(
      <Donut {...baseProps} wheelDirection="inverted" tabs={tabs} />,
    );
    const svg = container.querySelector("svg") as SVGSVGElement;
    // wheel-down em inverted = volta uma página → tenta sair de 0, fica em 0
    fireEvent.wheel(svg, { deltaY: 30 });
    expect(
      container.querySelectorAll('[data-testid="donut-slice"]'),
    ).toHaveLength(6);
    // wheel-up em inverted = avança
    fireEvent.wheel(svg, { deltaY: -30 });
    expect(
      container.querySelectorAll('[data-testid="donut-slice"]'),
    ).toHaveLength(2);
  });

  it("clicking a pagination dot navigates to that page", () => {
    const tabs = Array.from({ length: 7 }, (_, i) => makeTab(`t${i}`, `T${i}`, i));
    const { container } = render(<Donut {...baseProps} tabs={tabs} />);
    const dot1 = container.querySelector(
      '[data-testid="pagination-dot-1"]',
    ) as SVGCircleElement;
    fireEvent.click(dot1);
    expect(
      container.querySelectorAll('[data-testid="donut-slice"]'),
    ).toHaveLength(2);
  });

  it("does not render dots when there is only one page", () => {
    const { container } = render(<Donut {...baseProps} tabs={[]} />);
    expect(container.querySelector('[data-testid="pagination-dots"]')).toBeNull();
  });

  it("does not render the profile switcher hit area when profiles props are absent", () => {
    const { container } = render(<Donut {...baseProps} tabs={[]} />);
    expect(
      container.querySelector('[data-testid="profile-switcher-hit"]'),
    ).toBeNull();
  });

  it("clicking the profile switcher hit area enters profiles mode", () => {
    const profiles = [
      {
        id: "a",
        name: "A",
        icon: null,
        shortcut: "Ctrl+Space",
        theme: "dark",
        tabs: [],
      },
      {
        id: "b",
        name: "B",
        icon: null,
        shortcut: "Ctrl+Alt+B",
        theme: "dark",
        tabs: [],
      },
    ] as never;
    const { container } = render(
      <Donut
        {...baseProps}
        tabs={[]}
        profiles={profiles}
        activeProfileId="a"
        onSelectProfile={() => {}}
      />,
    );
    const hit = container.querySelector(
      '[data-testid="profile-switcher-hit"]',
    ) as SVGRectElement;
    expect(hit).not.toBeNull();
    fireEvent.click(hit);
    expect(
      container.querySelector('[data-testid="profile-switcher"]'),
    ).not.toBeNull();
  });

  describe("search overlay integration", () => {
    function dispatchKey(combo: { key: string; ctrl?: boolean }) {
      const ev = new KeyboardEvent("keydown", {
        key: combo.key,
        ctrlKey: !!combo.ctrl,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        window.dispatchEvent(ev);
      });
    }

    it("matching searchShortcut opens the overlay", () => {
      const tabs = [makeTab("a", "Trabalho", 0), makeTab("b", "Pessoal", 1)];
      const { container } = render(
        <Donut {...baseProps} tabs={tabs} searchShortcut="Ctrl+F" />,
      );
      expect(container.querySelector('[data-testid="search-overlay"]')).toBeNull();
      dispatchKey({ key: "f", ctrl: true });
      expect(
        container.querySelector('[data-testid="search-overlay"]'),
      ).not.toBeNull();
    });

    it("non-matching key does not open the overlay", () => {
      const tabs = [makeTab("a", "A", 0)];
      const { container } = render(
        <Donut {...baseProps} tabs={tabs} searchShortcut="Ctrl+F" />,
      );
      dispatchKey({ key: "g", ctrl: true });
      expect(container.querySelector('[data-testid="search-overlay"]')).toBeNull();
    });

    it("does nothing when searchShortcut prop is omitted", () => {
      const tabs = [makeTab("a", "A", 0)];
      const { container } = render(<Donut {...baseProps} tabs={tabs} />);
      dispatchKey({ key: "f", ctrl: true });
      expect(container.querySelector('[data-testid="search-overlay"]')).toBeNull();
    });

    it("does not open overlay while in profiles mode", () => {
      const profiles = [
        {
          id: "a",
          name: "A",
          icon: null,
          shortcut: "Ctrl+Space",
          theme: "dark",
          tabs: [],
        },
      ] as never;
      const { container } = render(
        <Donut
          {...baseProps}
          tabs={[]}
          searchShortcut="Ctrl+F"
          profiles={profiles}
          activeProfileId="a"
          onSelectProfile={() => {}}
        />,
      );
      // Enter profiles mode
      fireEvent.click(
        container.querySelector(
          '[data-testid="profile-switcher-hit"]',
        ) as SVGRectElement,
      );
      dispatchKey({ key: "f", ctrl: true });
      expect(container.querySelector('[data-testid="search-overlay"]')).toBeNull();
    });

    it("wheel pagination is suppressed while overlay is open", () => {
      const tabs = Array.from({ length: 7 }, (_, i) =>
        makeTab(`t${i}`, `T${i}`, i),
      );
      const { container } = render(
        <Donut {...baseProps} tabs={tabs} searchShortcut="Ctrl+F" />,
      );
      const svg = container.querySelector("svg") as SVGSVGElement;
      dispatchKey({ key: "f", ctrl: true });
      expect(
        container.querySelector('[data-testid="search-overlay"]'),
      ).not.toBeNull();
      // Page 1 has 6 slices. Wheel must NOT advance to page 2 (which would be 2 slices).
      fireEvent.wheel(svg, { deltaY: 30 });
      expect(
        container.querySelectorAll('[data-testid="donut-slice"]'),
      ).toHaveLength(6);
    });
  });

  it("selecting a profile in switcher mode calls onSelectProfile and returns to tabs mode", () => {
    const onSelectProfile = vi.fn();
    const profiles = [
      {
        id: "a",
        name: "A",
        icon: null,
        shortcut: "Ctrl+Space",
        theme: "dark",
        tabs: [],
      },
      {
        id: "b",
        name: "B",
        icon: null,
        shortcut: "Ctrl+Alt+B",
        theme: "dark",
        tabs: [],
      },
    ] as never;
    const { container } = render(
      <Donut
        {...baseProps}
        tabs={[]}
        profiles={profiles}
        activeProfileId="a"
        onSelectProfile={onSelectProfile}
      />,
    );
    fireEvent.click(
      container.querySelector(
        '[data-testid="profile-switcher-hit"]',
      ) as SVGRectElement,
    );
    const slices = container.querySelectorAll('[data-testid="donut-slice"]');
    fireEvent.click(slices[1]); // segundo perfil
    expect(onSelectProfile).toHaveBeenCalledWith("b");
    // voltou ao modo abas (não mostra mais profile-switcher)
    expect(
      container.querySelector('[data-testid="profile-switcher"]'),
    ).toBeNull();
  });
});
