import React from "react";

export interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "data-testid"?: string;
}

const TRACK_WIDTH = 36;
const TRACK_HEIGHT = 20;
const THUMB_SIZE = 16;
const THUMB_MARGIN = (TRACK_HEIGHT - THUMB_SIZE) / 2;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - THUMB_MARGIN * 2;

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  disabled,
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "data-testid": testId,
}) => {
  const handleClick = () => {
    if (disabled) return;
    onChange(!checked);
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onChange(!checked);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      data-testid={testId}
      disabled={disabled}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      style={{
        position: "relative",
        width: TRACK_WIDTH,
        height: TRACK_HEIGHT,
        flexShrink: 0,
        padding: 0,
        border: `1px solid ${checked ? "var(--selected-border)" : "var(--input-border)"}`,
        borderRadius: TRACK_HEIGHT,
        background: checked ? "var(--accent-bg)" : "var(--input-bg)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "background 120ms ease, border-color 120ms ease",
        display: "inline-block",
        verticalAlign: "middle",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          top: THUMB_MARGIN,
          left: THUMB_MARGIN,
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          borderRadius: "50%",
          background: checked ? "var(--accent-fg)" : "var(--muted)",
          transform: `translateX(${checked ? THUMB_TRAVEL : 0}px)`,
          transition: "transform 120ms ease, background 120ms ease",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.3)",
        }}
      />
    </button>
  );
};
