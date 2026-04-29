import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ipc } from "../core/ipc";
import { translateAppError } from "../core/errors";
import type { InstalledApp } from "../core/types/InstalledApp";

export interface AppPickerProps {
  open: boolean;
  onSelect: (name: string) => void;
  onClose: () => void;
  /** Plano 17 — injetável para testes (substitui `ipc.listInstalledApps`). */
  fetcher?: () => Promise<InstalledApp[]>;
}

type State =
  | { status: "loading" }
  | { status: "loaded"; apps: InstalledApp[] }
  | { status: "error"; message: string };

/**
 * Plano 17 — modal HTML que lista apps instalados detectados pelo SO. Abre
 * via prop `open`, busca uma única vez via `ipc.listInstalledApps()` (ou
 * `fetcher` injetado nos testes). Filtragem in-memory por substring case-
 * insensitive em `name`/`path`. Teclado ↑/↓/Enter/Esc.
 */
export const AppPicker: React.FC<AppPickerProps> = ({
  open,
  onSelect,
  onClose,
  fetcher,
}) => {
  const { t } = useTranslation();
  const [state, setState] = useState<State>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const apps = await (fetcher ? fetcher() : ipc.listInstalledApps());
      setState({ status: "loaded", apps });
    } catch (err) {
      setState({
        status: "error",
        message: t("settings.appPicker.errorFetch", {
          reason: translateAppError(err, t),
        }),
      });
    }
  }, [fetcher, t]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    void load();
  }, [open, load]);

  useEffect(() => {
    // Foca apenas na abertura — re-focar em cada transição de state roubaria
    // o foco do user que clicou em uma row durante a transição loading→loaded.
    if (open) inputRef.current?.focus();
  }, [open]);

  const filtered = useMemo(() => {
    if (state.status !== "loaded") return [] as InstalledApp[];
    const q = query.trim().toLowerCase();
    if (q.length === 0) return state.apps;
    return state.apps.filter(
      (a) =>
        a.name.toLowerCase().includes(q) || a.path.toLowerCase().includes(q),
    );
  }, [state, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    if (state.status !== "loaded" || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % filtered.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const picked = filtered[selectedIndex];
      if (picked) {
        onSelect(picked.value);
        onClose();
      }
    }
  };

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!open) return null;

  return (
    <div
      data-testid="app-picker-overlay"
      role="dialog"
      aria-modal="true"
      onKeyDown={handleKeyDown}
      onMouseDown={handleBackdropMouseDown}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "grid",
        placeItems: "center",
        zIndex: 9999,
      }}
    >
      <div
        style={{
          width: 480,
          maxWidth: "90vw",
          maxHeight: "80vh",
          background: "var(--panel)",
          color: "var(--fg)",
          border: "1px solid var(--input-border)",
          borderRadius: 8,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          overflow: "hidden",
        }}
      >
        <header
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <h3 style={{ margin: 0, flex: 1, fontSize: 14 }}>
            {t("settings.appPicker.title")}
          </h3>
          <button
            type="button"
            data-testid="app-picker-refresh"
            onClick={() => void load()}
            style={{
              background: "transparent",
              color: "var(--fg)",
              border: "1px solid var(--ghost-border)",
              borderRadius: 4,
              padding: "4px 8px",
              cursor: "pointer",
              font: "inherit",
              fontSize: 12,
            }}
          >
            {t("settings.appPicker.refresh")}
          </button>
        </header>

        <input
          ref={inputRef}
          data-testid="app-picker-search"
          type="text"
          aria-label={t("settings.appPicker.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("settings.appPicker.searchPlaceholder")}
          style={{
            background: "var(--input-bg)",
            color: "var(--fg)",
            border: "1px solid var(--input-border)",
            borderRadius: 4,
            padding: "6px 8px",
            font: "inherit",
          }}
        />

        <div
          style={{
            flex: 1,
            overflowY: "auto",
            border: "1px solid var(--input-border)",
            borderRadius: 4,
          }}
        >
          {state.status === "loading" && (
            <div
              data-testid="app-picker-loading"
              style={{ padding: 12, color: "var(--muted)" }}
            >
              {t("settings.appPicker.loading")}
            </div>
          )}
          {state.status === "error" && (
            <div
              data-testid="app-picker-error"
              role="alert"
              style={{ padding: 12, color: "var(--danger-fg)" }}
            >
              {state.message}
            </div>
          )}
          {state.status === "loaded" && filtered.length === 0 && (
            <div
              data-testid="app-picker-empty"
              style={{ padding: 12, color: "var(--muted)" }}
            >
              {t("settings.appPicker.empty")}
            </div>
          )}
          {state.status === "loaded" && filtered.length > 0 && (
            <ul
              role="listbox"
              style={{
                listStyle: "none",
                margin: 0,
                padding: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {filtered.map((app, i) => {
                const selected = i === selectedIndex;
                return (
                  <li
                    key={`${app.name}-${app.path}`}
                    role="option"
                    aria-selected={selected}
                    data-testid={`app-picker-row-${i}`}
                    onMouseEnter={() => setSelectedIndex(i)}
                    onClick={() => {
                      onSelect(app.value);
                      onClose();
                    }}
                    style={{
                      padding: "6px 10px",
                      background: selected ? "var(--selected-bg)" : "transparent",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                    }}
                  >
                    <span style={{ fontWeight: selected ? 600 : 400 }}>{app.name}</span>
                    <small
                      style={{
                        color: "var(--muted)",
                        fontSize: 11,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {app.path}
                    </small>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            data-testid="app-picker-cancel"
            onClick={onClose}
            style={{
              background: "transparent",
              color: "var(--fg)",
              border: "1px solid var(--ghost-border)",
              borderRadius: 4,
              padding: "6px 12px",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            {t("settings.appPicker.cancel")}
          </button>
        </footer>
      </div>
    </div>
  );
};
