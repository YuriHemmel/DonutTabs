import { describe, it, expect } from "vitest";
import { decideQuickRelease } from "../quickRelease";
import type { Config } from "../../core/types/Config";

function makeConfig(quickMode: boolean): Config {
  // Apenas os campos lidos por `decideQuickRelease` precisam ser
  // realistas. Os demais são preenchidos com valores neutros pra satisfazer
  // o tipo gerado pelo ts-rs sem nos amarrar ao schema completo nesta
  // suíte de unit tests.
  return {
    version: 2,
    activeProfileId: "p",
    profiles: [],
    appearance: { language: "auto" },
    interaction: {
      spawnPosition: "cursor",
      selectionMode: "clickOrRelease",
      hoverHoldMs: 1200,
      searchShortcut: "CommandOrControl+F",
      sliceGapEnabled: true,
      quickMode,
    },
    pagination: { itemsPerPage: 6, wheelDirection: "standard" },
    system: {
      autostart: false,
      autoCheckUpdates: true,
      scriptHistoryEnabled: true,
    },
  } as unknown as Config;
}

describe("decideQuickRelease", () => {
  it("returns noop when config is null (boot race: release before hydration)", () => {
    expect(decideQuickRelease(null, { kind: "leaf", id: "t1" })).toEqual({
      type: "noop",
    });
  });

  it("returns noop when quickMode is disabled (release does nothing in click-to-open mode)", () => {
    expect(
      decideQuickRelease(makeConfig(false), { kind: "leaf", id: "t1" }),
    ).toEqual({ type: "noop" });
  });

  it("opens the leaf tab under the cursor when quickMode is on", () => {
    expect(
      decideQuickRelease(makeConfig(true), { kind: "leaf", id: "t1" }),
    ).toEqual({ type: "openTab", tabId: "t1" });
  });

  it("opens settings when cursor is on the gear", () => {
    expect(decideQuickRelease(makeConfig(true), { kind: "gear" })).toEqual({
      type: "openSettings",
    });
  });

  it("hides the donut when cursor is on a group (no leaf to open)", () => {
    expect(
      decideQuickRelease(makeConfig(true), { kind: "group", id: "g1" }),
    ).toEqual({ type: "hide" });
  });

  it("hides the donut when cursor is on no target (outside slices)", () => {
    expect(decideQuickRelease(makeConfig(true), null)).toEqual({
      type: "hide",
    });
  });
});
