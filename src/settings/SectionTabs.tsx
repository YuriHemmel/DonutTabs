import React from "react";
import { useTranslation } from "react-i18next";

export type Section =
  | "tabs"
  | "profiles"
  | "appearance"
  | "shortcut"
  | "system"
  | "history"
  | "about";

const ALL_SECTIONS: Section[] = [
  "tabs",
  "profiles",
  "appearance",
  "shortcut",
  "system",
  "history",
  "about",
];

export interface SectionTabsProps {
  active: Section;
  onChange: (section: Section) => void;
  /** Issue #54 (rev) — quando `false`, esconde a aba "Histórico" da nav.
   *  Default `true` mantém compatibilidade com testes que não passam o flag. */
  showHistory?: boolean;
}

export const SectionTabs: React.FC<SectionTabsProps> = ({
  active,
  onChange,
  showHistory = true,
}) => {
  const { t } = useTranslation();
  const sections = showHistory
    ? ALL_SECTIONS
    : ALL_SECTIONS.filter((s) => s !== "history");
  return (
    <nav
      role="tablist"
      style={{
        display: "flex",
        gap: 4,
        padding: "12px 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--panel)",
      }}
    >
      {sections.map((s) => {
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
              background: selected ? "var(--selected-bg)" : "transparent",
              color: "var(--fg)",
              border:
                "1px solid " + (selected ? "var(--selected-border)" : "transparent"),
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
