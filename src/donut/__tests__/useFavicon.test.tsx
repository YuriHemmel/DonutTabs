import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useFavicon, __resetFaviconCacheForTests } from "../useFavicon";

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: (p: string) => `asset://${p}`,
}));

const fetchMock = vi.fn();
vi.mock("../../core/ipc", () => ({
  ipc: {
    fetchFavicon: (...args: unknown[]) => fetchMock(...args),
  },
}));

describe("useFavicon", () => {
  beforeEach(() => {
    __resetFaviconCacheForTests();
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns null state when url is null", () => {
    const { result } = renderHook(() => useFavicon(null));
    expect(result.current.src).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("memoizes by URL across hook instances", async () => {
    fetchMock.mockResolvedValue({ localPath: "/tmp/x.bin", mime: "image/png" });
    const a = renderHook(() => useFavicon("https://example.com/"));
    await waitFor(() => expect(a.result.current.src).toBe("asset:///tmp/x.bin"));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const b = renderHook(() => useFavicon("https://example.com/"));
    expect(b.result.current.src).toBe("asset:///tmp/x.bin");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("evicts stale entries past MEMORY_TTL_MS and refetches", async () => {
    const realNow = Date.now;
    let now = 1_000_000_000_000;
    Date.now = () => now;
    try {
      fetchMock.mockResolvedValueOnce({
        localPath: "/tmp/v1.bin",
        mime: "image/png",
      });
      const first = renderHook(() => useFavicon("https://example.com/"));
      await waitFor(() => expect(first.result.current.src).toBe("asset:///tmp/v1.bin"));
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // 8 days later — entry should be considered stale.
      now += 8 * 24 * 60 * 60 * 1000;
      fetchMock.mockResolvedValueOnce({
        localPath: "/tmp/v2.bin",
        mime: "image/png",
      });
      const second = renderHook(() => useFavicon("https://example.com/"));
      await waitFor(() => expect(second.result.current.src).toBe("asset:///tmp/v2.bin"));
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      Date.now = realNow;
    }
  });

  it("returns null and error=true when the IPC call fails", async () => {
    fetchMock.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderHook(() => useFavicon("https://broken.test/"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.src).toBeNull();
    expect(result.current.error).toBe(true);
  });
});
