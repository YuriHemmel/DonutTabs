import React from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import {
  ipc,
  UPDATE_PROGRESS_EVENT,
  type UpdateProgress,
} from "../core/ipc";
import type { UpdateSummary } from "../core/types/UpdateSummary";
import { translateAppError } from "../core/errors";

export interface UpdateCardProps {
  autoCheckUpdates: boolean;
  onAutoCheckUpdatesChange: (enabled: boolean) => void;
}

type State =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "upToDate" }
  | { kind: "available"; summary: UpdateSummary }
  | { kind: "downloading"; summary: UpdateSummary; percent: number | null }
  | { kind: "installing"; summary: UpdateSummary }
  | { kind: "error"; message: string };

export const UpdateCard: React.FC<UpdateCardProps> = ({
  autoCheckUpdates,
  onAutoCheckUpdatesChange,
}) => {
  const { t } = useTranslation();
  const [state, setState] = React.useState<State>({ kind: "idle" });

  // Hidrata do AppState.pending_update — task de startup pode ter
  // populado antes do Settings ser aberto. Sem chamada de rede.
  React.useEffect(() => {
    let cancelled = false;
    ipc
      .getPendingUpdate()
      .then((s) => {
        if (cancelled) return;
        if (s) {
          setState({ kind: "available", summary: s });
        }
      })
      .catch(() => {
        // Falha aqui é silenciosa — user dispara via "Verificar agora".
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCheck = React.useCallback(async () => {
    setState({ kind: "checking" });
    try {
      const summary = await ipc.checkForUpdates(true);
      if (summary) {
        setState({ kind: "available", summary });
      } else {
        setState({ kind: "upToDate" });
      }
    } catch (err) {
      setState({ kind: "error", message: translateAppError(err, t) });
    }
  }, [t]);

  const handleInstall = React.useCallback(async () => {
    if (state.kind !== "available") return;
    const summary = state.summary;
    setState({ kind: "downloading", summary, percent: null });
    let unlisten: (() => void) | null = null;
    try {
      unlisten = await listen<UpdateProgress>(UPDATE_PROGRESS_EVENT, (e) => {
        const { downloaded, total } = e.payload;
        const pct =
          total != null && total > 0
            ? Math.min(100, Math.floor((downloaded / total) * 100))
            : null;
        setState((prev) => {
          if (prev.kind !== "downloading") return prev;
          return { ...prev, percent: pct };
        });
      });
      await ipc.installUpdate();
      // Plugin reinicia o app — código abaixo raramente roda. Se rodar,
      // significa que o install retornou sem relaunch (ex.: macOS sem
      // notarização) — mostra estado terminal.
      setState({ kind: "installing", summary });
    } catch (err) {
      setState({ kind: "error", message: translateAppError(err, t) });
    } finally {
      if (unlisten) unlisten();
    }
  }, [state, t]);

  const appVersion = state.kind === "available" ? state.summary.version : null;

  return (
    <div
      data-testid="update-card"
      style={{
        marginTop: 12,
        paddingTop: 12,
        borderTop: "1px solid var(--input-border)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <strong>{t("settings.system.update.heading")}</strong>

      <label
        style={{ display: "flex", gap: 6, alignItems: "center", padding: 4 }}
      >
        <input
          type="checkbox"
          data-testid="auto-check-updates-toggle"
          checked={autoCheckUpdates}
          onChange={(e) => onAutoCheckUpdatesChange(e.target.checked)}
        />
        {t("settings.system.update.autoCheckLabel")}
      </label>
      <small style={{ color: "var(--muted)", paddingLeft: 26 }}>
        {t("settings.system.update.autoCheckHint")}
      </small>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          data-testid="check-updates"
          onClick={handleCheck}
          disabled={
            state.kind === "checking" ||
            state.kind === "downloading" ||
            state.kind === "installing"
          }
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
          {state.kind === "checking"
            ? t("settings.system.update.checking")
            : t("settings.system.update.checkNow")}
        </button>
        {state.kind === "upToDate" && (
          <span data-testid="up-to-date" style={{ color: "var(--muted)" }}>
            {t("settings.system.update.upToDate")}
          </span>
        )}
      </div>

      {state.kind === "available" && (
        <div
          data-testid="update-available"
          style={{
            background: "var(--input-bg)",
            border: "1px solid var(--accent-bg)",
            borderRadius: 4,
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <strong>
            {t("settings.system.update.available", { version: appVersion })}
          </strong>
          {state.summary.notes && (
            <details>
              <summary style={{ cursor: "pointer" }}>
                {t("settings.system.update.releaseNotes")}
              </summary>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  margin: "8px 0 0 0",
                  fontSize: 12,
                }}
              >
                {state.summary.notes}
              </pre>
            </details>
          )}
          <button
            type="button"
            data-testid="install-update"
            onClick={handleInstall}
            style={{
              alignSelf: "flex-start",
              background: "var(--accent-bg)",
              color: "var(--accent-fg)",
              border: 0,
              borderRadius: 4,
              padding: "8px 16px",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            {t("settings.system.update.installNow")}
          </button>
        </div>
      )}

      {state.kind === "downloading" && (
        <div data-testid="update-downloading" style={{ color: "var(--muted)" }}>
          {state.percent != null
            ? t("settings.system.update.downloading", { progress: state.percent })
            : t("settings.system.update.downloading", { progress: 0 })}
        </div>
      )}

      {state.kind === "installing" && (
        <div data-testid="update-installing" style={{ color: "var(--muted)" }}>
          {t("settings.system.update.installing", { progress: 100 })}
        </div>
      )}

      {state.kind === "error" && (
        <div
          data-testid="update-error"
          style={{ color: "var(--danger-fg, crimson)" }}
        >
          {state.message}
        </div>
      )}
    </div>
  );
};
