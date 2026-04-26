import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ipc } from "../core/ipc";

interface FaviconState {
  src: string | null;
  loading: boolean;
  error: boolean;
}

interface CacheEntry {
  src: string;
  ts: number;
}

// Mirrors the Rust disk cache TTL (favicon::TTL = 7 days). Capping the
// in-memory entry at the same age guarantees that a long-running session
// (donut left open for more than a week) eventually re-asks Rust, which
// then re-checks disk staleness and refetches if needed. Without the TTL
// the frontend would serve stale `convertFileSrc` URLs forever.
const MEMORY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const memoryCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string | null>>();

function getFresh(url: string): string | undefined {
  const entry = memoryCache.get(url);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > MEMORY_TTL_MS) {
    memoryCache.delete(url);
    return undefined;
  }
  return entry.src;
}

async function loadOnce(url: string): Promise<string | null> {
  const cached = getFresh(url);
  if (cached !== undefined) return cached;
  const existing = inflight.get(url);
  if (existing) return existing;
  const p = ipc
    .fetchFavicon(url)
    .then((r) => {
      const src = convertFileSrc(r.localPath);
      memoryCache.set(url, { src, ts: Date.now() });
      return src;
    })
    .catch(() => null)
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

/** Resolves a favicon for `url`. Skips when null. Memoizes by URL with TTL. */
export function useFavicon(url: string | null): FaviconState {
  const initialSrc = url ? getFresh(url) ?? null : null;
  const [state, setState] = useState<FaviconState>({
    src: initialSrc,
    loading: !!url && initialSrc === null,
    error: false,
  });

  useEffect(() => {
    if (!url) {
      setState({ src: null, loading: false, error: false });
      return;
    }
    const cached = getFresh(url);
    if (cached !== undefined) {
      setState({ src: cached, loading: false, error: false });
      return;
    }
    let cancelled = false;
    setState({ src: null, loading: true, error: false });
    loadOnce(url).then((src) => {
      if (cancelled) return;
      setState({ src, loading: false, error: src === null });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}

/** Test helper. */
export function __resetFaviconCacheForTests() {
  memoryCache.clear();
  inflight.clear();
}
