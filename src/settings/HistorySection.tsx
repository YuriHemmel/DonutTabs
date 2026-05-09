import React from "react";
import { useTranslation } from "react-i18next";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  ipc,
  SCRIPT_RUN_FINISHED_EVENT,
  SCRIPT_RUN_OUTPUT_EVENT,
  SCRIPT_RUN_STARTED_EVENT,
  type ScriptOutputPayload,
} from "../core/ipc";
import type { ScriptRun } from "../core/types/ScriptRun";
import type { ScriptRunSummary } from "../core/types/ScriptRunSummary";
import type { ScriptStatus } from "../core/types/ScriptStatus";
import { translateAppError } from "../core/errors";

export interface HistorySectionProps {
  enabled: boolean;
}

const STATUS_COLOR: Record<ScriptStatus, string> = {
  running: "#3b82f6",
  succeeded: "#10b981",
  failed: "#ef4444",
  interrupted: "#f59e0b",
  cancelled: "#6b7280",
};

function statusKey(status: ScriptStatus): string {
  return `settings.history.status.${status}`;
}

function formatTime(millis: number | null): string {
  if (millis == null) return "—";
  return new Date(millis).toLocaleString();
}

function formatDuration(start: number, end: number | null): string {
  if (end == null) return "—";
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export const HistorySection: React.FC<HistorySectionProps> = ({ enabled }) => {
  const { t } = useTranslation();
  const [runs, setRuns] = React.useState<ScriptRunSummary[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<ScriptRun | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  // Listeners ficam montados pra vida do componente — `selectedId` lido via ref
  // dentro dos handlers para evitar re-mount de listen() em cada seleção
  // (janela de unlisten/listen perde events de OUTPUT mid-stream).
  const selectedIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const refreshList = React.useCallback(async () => {
    try {
      const list = await ipc.listScriptRuns();
      setRuns(list);
      if (selectedIdRef.current && !list.find((r) => r.id === selectedIdRef.current)) {
        setSelectedId(null);
        setDetail(null);
      }
    } catch (err) {
      setError(translateAppError(err, t));
    }
  }, [t]);

  React.useEffect(() => {
    void refreshList();
    const unlistens: Promise<UnlistenFn>[] = [
      listen<ScriptRunSummary>(SCRIPT_RUN_STARTED_EVENT, (e) => {
        setRuns((prev) => [e.payload, ...prev.filter((r) => r.id !== e.payload.id)]);
      }),
      listen<ScriptRunSummary>(SCRIPT_RUN_FINISHED_EVENT, (e) => {
        // Payload pode ser `{ cleared: true }` (clear all) — re-fetch e sai.
        const payload = e.payload as ScriptRunSummary | { cleared?: boolean };
        if ("cleared" in payload && payload.cleared) {
          setRuns([]);
          setSelectedId(null);
          setDetail(null);
          return;
        }
        const summary = payload as ScriptRunSummary;
        setRuns((prev) =>
          prev.map((r) => (r.id === summary.id ? summary : r)),
        );
        // Se a run finalizada está aberta no detail, refresca o detail.
        if (selectedIdRef.current === summary.id) {
          void ipc.getScriptRun(summary.id).then((run) => {
            if (run) setDetail(run);
          });
        }
      }),
      listen<ScriptOutputPayload>(SCRIPT_RUN_OUTPUT_EVENT, (e) => {
        if (selectedIdRef.current !== e.payload.runId) return;
        setDetail((prev) => {
          if (!prev || prev.id !== e.payload.runId) return prev;
          if (e.payload.stream === "stdout") {
            return { ...prev, stdout: prev.stdout + e.payload.chunk };
          }
          return { ...prev, stderr: prev.stderr + e.payload.chunk };
        });
      }),
    ];
    return () => {
      unlistens.forEach((p) => void p.then((fn) => fn()));
    };
  }, [refreshList]);

  const selectRun = React.useCallback(
    async (id: string) => {
      setSelectedId(id);
      try {
        const run = await ipc.getScriptRun(id);
        setDetail(run);
      } catch (err) {
        setError(translateAppError(err, t));
      }
    },
    [t],
  );

  const handleClear = React.useCallback(async () => {
    if (runs.length === 0) return;
    const ok = window.confirm(
      t("settings.history.clearConfirm", { count: runs.length }),
    );
    if (!ok) return;
    try {
      await ipc.clearScriptRuns();
      setRuns([]);
      setSelectedId(null);
      setDetail(null);
    } catch (err) {
      setError(translateAppError(err, t));
    }
  }, [runs.length, t]);

  const handleCancel = React.useCallback(async () => {
    if (!detail || detail.status !== "running") return;
    try {
      await ipc.cancelScriptRun(detail.id);
    } catch (err) {
      setError(translateAppError(err, t));
    }
  }, [detail, t]);

  const handleCopy = React.useCallback(async () => {
    if (!detail) return;
    const text = `# ${detail.command}\n\n## stdout\n${detail.stdout}\n\n## stderr\n${detail.stderr}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // navigator.clipboard pode falhar em ambientes sem permissão; ignora.
    }
  }, [detail]);

  if (!enabled) {
    return (
      <section
        data-testid="history-disabled"
        style={{ flex: 1, padding: 24, color: "var(--muted)" }}
      >
        {t("settings.history.disabled")}
      </section>
    );
  }

  return (
    <section
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <h2 style={{ margin: 0 }}>{t("settings.history.heading")}</h2>
        <button
          type="button"
          data-testid="history-clear"
          onClick={handleClear}
          disabled={runs.length === 0}
          style={{
            background: "transparent",
            color: "var(--fg)",
            border: "1px solid var(--ghost-border)",
            borderRadius: 4,
            padding: "6px 12px",
            cursor: runs.length === 0 ? "not-allowed" : "pointer",
            font: "inherit",
            opacity: runs.length === 0 ? 0.5 : 1,
          }}
        >
          {t("settings.history.clearAll")}
        </button>
      </header>

      {error && (
        <div
          data-testid="history-error"
          style={{ padding: "8px 24px", color: "var(--danger-fg, crimson)" }}
        >
          {error}
        </div>
      )}

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div
          data-testid="history-list"
          style={{
            width: "40%",
            minWidth: 280,
            borderRight: "1px solid var(--border)",
            overflow: "auto",
          }}
        >
          {runs.length === 0 ? (
            <div style={{ padding: 24, color: "var(--muted)" }}>
              {t("settings.history.empty")}
            </div>
          ) : (
            runs.map((r) => {
              const isSelected = selectedId === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  data-testid={`history-row-${r.id}`}
                  onClick={() => void selectRun(r.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: isSelected ? "var(--selected-bg)" : "transparent",
                    color: "var(--fg)",
                    border: 0,
                    borderBottom: "1px solid var(--border)",
                    padding: "10px 16px",
                    cursor: "pointer",
                    font: "inherit",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        background: STATUS_COLOR[r.status],
                        flexShrink: 0,
                      }}
                    />
                    <strong
                      style={{
                        fontFamily: "monospace",
                        fontSize: 12,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {r.command}
                    </strong>
                  </div>
                  <small style={{ color: "var(--muted)", fontSize: 11 }}>
                    {t(statusKey(r.status))} · {formatTime(r.startedAt)}
                  </small>
                </button>
              );
            })
          )}
        </div>

        <div
          data-testid="history-detail"
          style={{ flex: 1, overflow: "auto", padding: 24 }}
        >
          {!detail ? (
            <div style={{ color: "var(--muted)" }}>
              {t("settings.history.empty")}
            </div>
          ) : (
            <DetailPanel
              run={detail}
              onCancel={handleCancel}
              onCopy={handleCopy}
            />
          )}
        </div>
      </div>
    </section>
  );
};

interface DetailPanelProps {
  run: ScriptRun;
  onCancel: () => void;
  onCopy: () => void;
}

const DetailPanel: React.FC<DetailPanelProps> = ({ run, onCancel, onCopy }) => {
  const { t } = useTranslation();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <header
        style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}
      >
        <span
          style={{
            display: "inline-block",
            background: STATUS_COLOR[run.status],
            color: "white",
            borderRadius: 4,
            padding: "2px 8px",
            fontSize: 12,
          }}
        >
          {t(statusKey(run.status))}
        </span>
        <code
          style={{
            background: "var(--input-bg)",
            padding: "4px 8px",
            borderRadius: 4,
            fontSize: 12,
            wordBreak: "break-all",
          }}
        >
          {run.command}
        </code>
        {run.status === "running" && (
          <button
            type="button"
            data-testid="history-cancel"
            onClick={onCancel}
            style={{
              marginLeft: "auto",
              background: "var(--danger-bg, #ef4444)",
              color: "white",
              border: 0,
              borderRadius: 4,
              padding: "6px 12px",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            {t("settings.history.detail.cancel")}
          </button>
        )}
        <button
          type="button"
          data-testid="history-copy"
          onClick={onCopy}
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
          {t("settings.history.detail.copy")}
        </button>
      </header>

      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "max-content 1fr",
          gap: "4px 16px",
          margin: 0,
          fontSize: 12,
        }}
      >
        <dt style={{ color: "var(--muted)" }}>
          {t("settings.history.detail.startedAt")}
        </dt>
        <dd style={{ margin: 0 }}>{formatTime(run.startedAt)}</dd>
        <dt style={{ color: "var(--muted)" }}>
          {t("settings.history.detail.finishedAt")}
        </dt>
        <dd style={{ margin: 0 }}>{formatTime(run.finishedAt)}</dd>
        <dt style={{ color: "var(--muted)" }}>
          {t("settings.history.detail.duration")}
        </dt>
        <dd style={{ margin: 0 }}>{formatDuration(run.startedAt, run.finishedAt)}</dd>
        <dt style={{ color: "var(--muted)" }}>
          {t("settings.history.detail.exitCode")}
        </dt>
        <dd style={{ margin: 0 }}>{run.exitCode ?? "—"}</dd>
      </dl>

      {run.truncated && (
        <div
          data-testid="history-truncated"
          style={{
            background: "var(--input-bg)",
            border: "1px solid #f59e0b",
            borderRadius: 4,
            padding: 12,
            fontSize: 12,
            color: "#f59e0b",
          }}
        >
          {t("settings.history.detail.truncated")}
        </div>
      )}

      <details open={run.stdout.length > 0}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>
          {t("settings.history.detail.stdout")}
        </summary>
        <pre
          data-testid="history-stdout"
          style={{
            background: "var(--input-bg)",
            padding: 12,
            borderRadius: 4,
            margin: "8px 0 0 0",
            maxHeight: 400,
            overflow: "auto",
            fontSize: 12,
            whiteSpace: "pre-wrap",
          }}
        >
          {run.stdout || "(vazio)"}
        </pre>
      </details>

      <details open={run.stderr.length > 0}>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>
          {t("settings.history.detail.stderr")}
        </summary>
        <pre
          data-testid="history-stderr"
          style={{
            background: "var(--input-bg)",
            padding: 12,
            borderRadius: 4,
            margin: "8px 0 0 0",
            maxHeight: 400,
            overflow: "auto",
            fontSize: 12,
            whiteSpace: "pre-wrap",
            color: "#ef4444",
          }}
        >
          {run.stderr || "(vazio)"}
        </pre>
      </details>
    </div>
  );
};
