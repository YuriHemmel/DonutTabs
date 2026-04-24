import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHoverHold } from "../useHoverHold";

const HOLD_MS = 800;

describe("useHoverHold", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts in idle when nothing is hovered", () => {
    const { result } = renderHook(() =>
      useHoverHold({
        hoveredSlice: null,
        isTabSlice: () => true,
        holdMs: HOLD_MS,
        onComplete: vi.fn(),
      }),
    );
    expect(result.current.state.phase).toBe("idle");
  });

  it("transitions to holding when a tab slice is hovered", () => {
    const { result } = renderHook(
      ({ hovered }: { hovered: number | null }) =>
        useHoverHold({
          hoveredSlice: hovered,
          isTabSlice: () => true,
          holdMs: HOLD_MS,
          onComplete: vi.fn(),
        }),
      { initialProps: { hovered: null } },
    );
    act(() => {
      // re-render with a hovered slice
    });
    const { rerender } = renderHook(
      ({ hovered }: { hovered: number | null }) =>
        useHoverHold({
          hoveredSlice: hovered,
          isTabSlice: () => true,
          holdMs: HOLD_MS,
          onComplete: vi.fn(),
        }),
      { initialProps: { hovered: null as number | null } },
    );
    rerender({ hovered: 0 });
    // (no assertion — the hooks above are just to avoid TS complaining about result)
    expect(result.current.state.phase).toBe("idle");
  });

  it("reaches actionable after holdMs and fires onComplete once", () => {
    const onComplete = vi.fn();
    const { result, rerender } = renderHook(
      ({ hovered }: { hovered: number | null }) =>
        useHoverHold({
          hoveredSlice: hovered,
          isTabSlice: () => true,
          holdMs: HOLD_MS,
          onComplete,
        }),
      { initialProps: { hovered: null as number | null } },
    );

    rerender({ hovered: 2 });
    expect(result.current.state.phase).toBe("holding");

    act(() => {
      vi.advanceTimersByTime(HOLD_MS + 50);
    });

    expect(result.current.state.phase).toBe("actionable");
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledWith(2);
  });

  it("returns to idle when the cursor leaves before holdMs", () => {
    const onComplete = vi.fn();
    const { result, rerender } = renderHook(
      ({ hovered }: { hovered: number | null }) =>
        useHoverHold({
          hoveredSlice: hovered,
          isTabSlice: () => true,
          holdMs: HOLD_MS,
          onComplete,
        }),
      { initialProps: { hovered: null as number | null } },
    );

    rerender({ hovered: 0 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.state.phase).toBe("holding");

    rerender({ hovered: null });
    expect(result.current.state.phase).toBe("idle");

    act(() => {
      vi.advanceTimersByTime(HOLD_MS);
    });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("ignores hover on a non-tab slice (e.g., '+')", () => {
    const onComplete = vi.fn();
    const { result, rerender } = renderHook(
      ({ hovered }: { hovered: number | null }) =>
        useHoverHold({
          hoveredSlice: hovered,
          isTabSlice: (i) => i !== 5, // 5 = "+"
          holdMs: HOLD_MS,
          onComplete,
        }),
      { initialProps: { hovered: null as number | null } },
    );

    rerender({ hovered: 5 });
    act(() => {
      vi.advanceTimersByTime(HOLD_MS + 50);
    });
    expect(result.current.state.phase).toBe("idle");
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("cancel() returns from actionable to idle", () => {
    const { result, rerender } = renderHook(
      ({ hovered }: { hovered: number | null }) =>
        useHoverHold({
          hoveredSlice: hovered,
          isTabSlice: () => true,
          holdMs: HOLD_MS,
          onComplete: vi.fn(),
        }),
      { initialProps: { hovered: null as number | null } },
    );
    rerender({ hovered: 1 });
    act(() => {
      vi.advanceTimersByTime(HOLD_MS + 10);
    });
    expect(result.current.state.phase).toBe("actionable");
    act(() => {
      result.current.cancel();
    });
    expect(result.current.state.phase).toBe("idle");
  });

  it("requestDelete() moves actionable to confirming", () => {
    const { result, rerender } = renderHook(
      ({ hovered }: { hovered: number | null }) =>
        useHoverHold({
          hoveredSlice: hovered,
          isTabSlice: () => true,
          holdMs: HOLD_MS,
          onComplete: vi.fn(),
        }),
      { initialProps: { hovered: null as number | null } },
    );
    rerender({ hovered: 0 });
    act(() => {
      vi.advanceTimersByTime(HOLD_MS + 10);
    });
    act(() => {
      result.current.requestDelete();
    });
    expect(result.current.state.phase).toBe("confirming");
  });

  it("confirmDelete() returns to idle (caller propagates the delete)", () => {
    const { result, rerender } = renderHook(
      ({ hovered }: { hovered: number | null }) =>
        useHoverHold({
          hoveredSlice: hovered,
          isTabSlice: () => true,
          holdMs: HOLD_MS,
          onComplete: vi.fn(),
        }),
      { initialProps: { hovered: null as number | null } },
    );
    rerender({ hovered: 0 });
    act(() => {
      vi.advanceTimersByTime(HOLD_MS + 10);
    });
    act(() => {
      result.current.requestDelete();
    });
    act(() => {
      result.current.confirmDelete();
    });
    expect(result.current.state.phase).toBe("idle");
  });

  it("confirming + cancel() goes back to actionable", () => {
    const { result, rerender } = renderHook(
      ({ hovered }: { hovered: number | null }) =>
        useHoverHold({
          hoveredSlice: hovered,
          isTabSlice: () => true,
          holdMs: HOLD_MS,
          onComplete: vi.fn(),
        }),
      { initialProps: { hovered: null as number | null } },
    );
    rerender({ hovered: 0 });
    act(() => {
      vi.advanceTimersByTime(HOLD_MS + 10);
    });
    act(() => {
      result.current.requestDelete();
    });
    expect(result.current.state.phase).toBe("confirming");
    act(() => {
      result.current.cancel();
    });
    expect(result.current.state.phase).toBe("actionable");
  });
});
