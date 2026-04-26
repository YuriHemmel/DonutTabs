import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ipc } from "../core/ipc";

interface FaviconState {
  src: string | null;
  loading: boolean;
  error: boolean;
}

const memoryCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

async function loadOnce(url: string): Promise<string | null> {
  const cached = memoryCache.get(url);
  if (cached !== undefined) return cached;
  const existing = inflight.get(url);
  if (existing) return existing;
  const p = ipc
    .fetchFavicon(url)
    .then((r) => {
      const src = convertFileSrc(r.localPath);
      memoryCache.set(url, src);
      return src;
    })
    .catch(() => null)
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

/** Resolves a favicon for `url`. Skips when null. Memoizes by URL. */
export function useFavicon(url: string | null): FaviconState {
  const [state, setState] = useState<FaviconState>({
    src: url ? memoryCache.get(url) ?? null : null,
    loading: !!url && !memoryCache.has(url),
    error: false,
  });

  useEffect(() => {
    if (!url) {
      setState({ src: null, loading: false, error: false });
      return;
    }
    const cached = memoryCache.get(url);
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
