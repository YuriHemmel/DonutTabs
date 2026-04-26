import React, { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LUCIDE_NAMES, getLucideComponent } from "../core/lucideRegistry";

const EMOJI_PRESETS: ReadonlyArray<string> = [
  "☕", "📚", "💼", "🎮", "🎵", "🎬", "🛒", "✉️", "📅",
  "🗂️", "📦", "🏠", "🌐", "💻", "🖥️", "📱", "🛠️", "🔒",
  "🔑", "❤️", "⭐", "🚀", "🌙", "☀️", "🔥", "💡", "🍕",
  "🍺", "✈️", "🚗", "🏆", "🎁",
];

export interface IconPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (icon: string) => void;
}

type Tab = "emoji" | "lucide";

export const IconPicker: React.FC<IconPickerProps> = ({
  open,
  onClose,
  onSelect,
}) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("emoji");
  const [search, setSearch] = useState("");
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () =>
      window.removeEventListener("keydown", onKey, { capture: true });
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return LUCIDE_NAMES;
    return LUCIDE_NAMES.filter((n) => n.toLowerCase().includes(q));
  }, [search]);

  if (!open) return null;

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  };
  const dialogStyle: React.CSSProperties = {
    background: "var(--panel)",
    color: "var(--fg)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 16,
    width: 480,
    maxHeight: "80vh",
    display: "flex",
    flexDirection: "column",
    gap: 12,
    boxShadow: "0 12px 40px rgba(0,0,0,0.45)",
  };

  return (
    <div
      style={overlayStyle}
      onMouseDown={(e) => {
        if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
          onClose();
        }
      }}
      data-testid="icon-picker-overlay"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-label={t("settings.icon.modalTitle")}
        style={dialogStyle}
      >
        <header style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <strong style={{ flex: 1 }}>{t("settings.icon.modalTitle")}</strong>
          <button
            type="button"
            onClick={onClose}
            data-testid="icon-picker-close"
            style={{
              background: "transparent",
              color: "var(--fg)",
              border: "1px solid var(--ghost-border)",
              borderRadius: 4,
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            {t("donut.toastDismiss")}
          </button>
        </header>

        <div role="tablist" style={{ display: "flex", gap: 4 }}>
          {(["emoji", "lucide"] as const).map((t2) => (
            <button
              key={t2}
              type="button"
              role="tab"
              aria-selected={tab === t2}
              data-testid={`icon-picker-tab-${t2}`}
              onClick={() => setTab(t2)}
              style={{
                background:
                  tab === t2 ? "var(--accent-bg)" : "transparent",
                color: tab === t2 ? "var(--accent-fg)" : "var(--fg)",
                border: "1px solid var(--ghost-border)",
                borderRadius: 4,
                padding: "4px 12px",
                cursor: "pointer",
                font: "inherit",
              }}
            >
              {t2 === "emoji"
                ? t("settings.icon.tabEmoji")
                : t("settings.icon.tabLucide")}
            </button>
          ))}
        </div>

        {tab === "lucide" && (
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("settings.icon.searchPlaceholder")}
            data-testid="icon-picker-search"
            style={{
              background: "var(--input-bg)",
              color: "var(--fg)",
              border: "1px solid var(--input-border)",
              borderRadius: 4,
              padding: "6px 8px",
              font: "inherit",
            }}
          />
        )}

        <div
          style={{
            overflow: "auto",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(48px, 1fr))",
            gap: 6,
            maxHeight: 360,
          }}
          data-testid="icon-picker-grid"
        >
          {tab === "emoji"
            ? EMOJI_PRESETS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    onSelect(e);
                    onClose();
                  }}
                  data-testid={`icon-picker-emoji-${e}`}
                  style={iconCellStyle}
                >
                  <span style={{ fontSize: 22 }}>{e}</span>
                </button>
              ))
            : filtered.map((name) => {
                const Cmp = getLucideComponent(name);
                if (!Cmp) return null;
                return (
                  <button
                    key={name}
                    type="button"
                    title={name}
                    onClick={() => {
                      onSelect(`lucide:${name}`);
                      onClose();
                    }}
                    data-testid={`icon-picker-lucide-${name}`}
                    style={iconCellStyle}
                  >
                    <Cmp size={20} color="currentColor" />
                  </button>
                );
              })}
        </div>
      </div>
    </div>
  );
};

const iconCellStyle: React.CSSProperties = {
  aspectRatio: "1 / 1",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "var(--input-bg)",
  color: "var(--fg)",
  border: "1px solid var(--ghost-border)",
  borderRadius: 4,
  cursor: "pointer",
  padding: 4,
};
