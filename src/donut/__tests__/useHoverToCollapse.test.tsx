import { describe, it, expect, vi, type Mock } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  computeTrimLength,
  useHoverToCollapse,
  type HoveredForCollapse,
} from "../useHoverToCollapse";

/** Invoca o último updater capturado pelo mock de `trim`, passando
 *  `current` como o estado pós-batch hipotético, e devolve o `len`
 *  calculado. Necessário porque o hook agora chama `trim((c) => len)`
 *  em vez de `trim(len)` — o cálculo é lazy. */
function lastCalledLen(trim: Mock, current: string[]): number {
  const calls = trim.mock.calls;
  if (calls.length === 0) throw new Error("trim not called");
  const lastCall = calls[calls.length - 1];
  return (lastCall[0] as (c: string[]) => number)(current);
}

describe("computeTrimLength (pure)", () => {
  it("returns 0 when cursor is outside the donut", () => {
    expect(computeTrimLength(null, ["g"])).toBe(0);
  });

  it("returns 0 when no groups are expanded and cursor is on root", () => {
    expect(computeTrimLength({ ring: 0, tabId: "x" }, [])).toBe(0);
  });

  it("keeps the group at depth 0 when cursor is on its own slice (ring 0)", () => {
    expect(computeTrimLength({ ring: 0, tabId: "g" }, ["g"])).toBe(1);
  });

  it("collapses the group at depth 0 when cursor is on a sibling at ring 0", () => {
    expect(computeTrimLength({ ring: 0, tabId: "sibling" }, ["g"])).toBe(0);
  });

  it("keeps the group at depth 0 when cursor is in its children ring (ring 1)", () => {
    // Cursor em ring 1 (children ring) — ring > depth → group em depth 0 stays.
    expect(computeTrimLength({ ring: 1, tabId: "child" }, ["g"])).toBe(1);
  });

  it("keeps the group at depth 0 when cursor is on the '+' slice of the children ring (tabId null)", () => {
    expect(computeTrimLength({ ring: 1, tabId: null }, ["g"])).toBe(1);
  });

  it("collapses everything when cursor is on a root sibling and nested groups are expanded", () => {
    expect(
      computeTrimLength({ ring: 0, tabId: "sibling" }, ["g1", "g2"]),
    ).toBe(0);
  });

  it("keeps both nested groups when cursor is on the deepest ring", () => {
    expect(computeTrimLength({ ring: 2, tabId: "leaf" }, ["g1", "g2"])).toBe(2);
  });

  it("collapses only the deepest nested group when cursor is on a sibling of it (ring 1)", () => {
    expect(
      computeTrimLength({ ring: 1, tabId: "sibling-of-g2" }, ["g1", "g2"]),
    ).toBe(1);
  });

  it("keeps both nested groups when cursor is on the inner group's own slice at ring 1", () => {
    expect(computeTrimLength({ ring: 1, tabId: "g2" }, ["g1", "g2"])).toBe(2);
  });
});

type CollapseProps = {
  hovered: HoveredForCollapse | null;
  expandedGroupIds: string[];
};

type CollapsePropsWithEnabled = CollapseProps & { enabled: boolean };

describe("useHoverToCollapse", () => {
  it("does NOT call trim on the initial mount with hovered=null (no cursor yet — regression: was collapsing groups opened by click without prior mouseMove)", () => {
    const trim = vi.fn();
    renderHook(
      (props: CollapseProps) =>
        useHoverToCollapse({
          hovered: props.hovered,
          expandedGroupIds: props.expandedGroupIds,
          trim,
        }),
      {
        initialProps: {
          hovered: null,
          expandedGroupIds: ["g"],
        } as CollapseProps,
      },
    );
    expect(trim).not.toHaveBeenCalled();
  });

  it("calls trim when hover transitions and re-computes length on subsequent moves", () => {
    const trim = vi.fn();
    const { rerender } = renderHook(
      (props: CollapseProps) =>
        useHoverToCollapse({
          hovered: props.hovered,
          expandedGroupIds: props.expandedGroupIds,
          trim,
        }),
      {
        initialProps: {
          hovered: null,
          expandedGroupIds: [],
        } as CollapseProps,
      },
    );
    expect(trim).not.toHaveBeenCalled();

    rerender({ hovered: { ring: 0, tabId: "g" }, expandedGroupIds: ["g"] });
    // Computa contra o `current` pós-expand hipotético `["g"]` →
    // group em depth 0 fica (cursor está sobre ele) → len 1.
    expect(lastCalledLen(trim, ["g"])).toBe(1);

    rerender({
      hovered: { ring: 0, tabId: "sibling" },
      expandedGroupIds: ["g"],
    });
    // Cursor saiu pra sibling no mesmo ring → colapsa tudo daquele depth.
    expect(lastCalledLen(trim, ["g"])).toBe(0);

    rerender({ hovered: null, expandedGroupIds: [] });
    // Cursor fora do donut → tudo colapsa, independente do `current`.
    expect(lastCalledLen(trim, ["g"])).toBe(0);
  });

  it("does not call trim when the hover snapshot is value-equal across re-renders (different object ref, same ring+tabId)", () => {
    const trim = vi.fn();
    const { rerender } = renderHook(
      (props: CollapseProps) =>
        useHoverToCollapse({
          hovered: props.hovered,
          expandedGroupIds: props.expandedGroupIds,
          trim,
        }),
      {
        initialProps: {
          hovered: { ring: 0, tabId: "g" } as HoveredForCollapse | null,
          expandedGroupIds: ["g"],
        },
      },
    );
    expect(trim).toHaveBeenCalledTimes(1);
    // Re-render com mesmo ring+tabId mas objeto novo (simula re-memo upstream).
    rerender({ hovered: { ring: 0, tabId: "g" }, expandedGroupIds: ["g"] });
    expect(trim).toHaveBeenCalledTimes(1);
  });

  it("does not call trim while enabled = false (context menu / search overlay paused)", () => {
    const trim = vi.fn();
    const { rerender } = renderHook(
      (props: CollapsePropsWithEnabled) =>
        useHoverToCollapse({
          hovered: props.hovered,
          expandedGroupIds: props.expandedGroupIds,
          trim,
          enabled: props.enabled,
        }),
      {
        initialProps: {
          hovered: { ring: 0, tabId: "g" },
          expandedGroupIds: ["g"],
          enabled: false,
        } as CollapsePropsWithEnabled,
      },
    );
    expect(trim).not.toHaveBeenCalled();
    // Hover muda mas continua pausado — nada é chamado.
    rerender({
      hovered: { ring: 0, tabId: "sibling" },
      expandedGroupIds: ["g"],
      enabled: false,
    });
    expect(trim).not.toHaveBeenCalled();
    // Volta a habilitar — dispara o cálculo atual.
    rerender({
      hovered: { ring: 0, tabId: "sibling" },
      expandedGroupIds: ["g"],
      enabled: true,
    });
    expect(trim).toHaveBeenCalledTimes(1);
    expect(lastCalledLen(trim, ["g"])).toBe(0);
  });

  it("trim closure reads the `current` passed by the updater (not the prop `expandedGroupIds` from the stale render)", () => {
    // Garantia explícita do contrato anti-race: se o cálculo dependesse
    // do prop `expandedGroupIds` (snapshot pré-expand), o expand
    // concorrente seria anulado. O hook deve passar `current` pro
    // computeTrimLength — exatamente o que esse teste checa.
    const trim = vi.fn();
    renderHook(() =>
      useHoverToCollapse({
        hovered: { ring: 0, tabId: "g" },
        expandedGroupIds: [], // prop stale (simula pré-expand)
        trim,
      }),
    );
    // Invoca o updater com o estado pós-expand real (`["g"]`):
    expect(lastCalledLen(trim, ["g"])).toBe(1);
    // E com o estado vazio (sanity):
    expect(lastCalledLen(trim, [])).toBe(0);
  });
});
