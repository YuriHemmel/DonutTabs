import React from "react";
import { useTranslation } from "react-i18next";

export type Section = "tabs" | "appearance" | "shortcut";

const SECTIONS: Section[] = ["tabs", "appearance", "shortcut"];

export interface SectionTabsProps {
  active: Section;
  onChange: (section: Section) => void;
}

export const SectionTabs: React.FC<SectionTabsProps> = ({ active, onChange }) => {
  const { t } = useTranslation();
  return (
    <nav
      role="tablist"
      style={{
        display: "flex",
        gap: 4,
        padding: "12px 16px",
        borderBottom: "1px solid var(--border, #23304d)",
        background: "var(--panel, #0c1020)",
      }}
    >
      {SECTIONS.map((s) => {
        const selected = active === s;
        return (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={selected}
            data-testid={`section-${s}`}
            onClick={() => onChange(s)}
            style={{
              background: selected ? "#253e6b" : "transparent",
              color: "#dde",
              border: "1px solid " + (selected ? "#3e63a8" : "transparent"),
              borderRadius: 6,
              padding: "6px 14px",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            {t(`settings.sections.${s}`)}
          </button>
        );
      })}
    </nav>
  );
};
