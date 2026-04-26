import React, { useEffect, useRef } from "react";

export interface SliceContextMenuItem {
  id: string;
  label: string;
  onSelect: () => void;
  variant?: "default" | "danger";
}

export interface SliceContextMenuProps {
  position: { x: number; y: number };
  items: SliceContextMenuItem[];
  onClose: () => void;
}

/**
 * Floating context menu rendered in the donut window. Closes on outside-click
 * and on `Escape`. Positioning is absolute relative to the donut SVG container;
 * caller passes coordinates in the same coordinate space.
 */
export const SliceContextMenu: React.FC<SliceContextMenuProps> = ({
  position,
  items,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (ref.current.contains(e.target as Node)) return;
      onClose();
    };
    window.addEventListener("keydown", onKey, { capture: true });
    window.addEventListener("mousedown", onPointerDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey, { capture: true });
      window.removeEventListener("mousedown", onPointerDown, { capture: true });
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      data-testid="slice-context-menu"
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        background: "#1b2436",
        border: "1px solid #3a4968",
        borderRadius: 6,
        padding: 4,
        minWidth: 160,
        boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
        zIndex: 1000,
        color: "#eaeaea",
        fontSize: 13,
        userSelect: "none",
      }}
      role="menu"
    >
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="menuitem"
          data-testid={`slice-context-menu-${it.id}`}
          onClick={() => {
            it.onSelect();
            onClose();
          }}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            padding: "6px 10px",
            background: "transparent",
            border: "none",
            color: it.variant === "danger" ? "#ff6b6b" : "#eaeaea",
            cursor: "pointer",
            borderRadius: 4,
            font: "inherit",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#2a3b5a";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
};
