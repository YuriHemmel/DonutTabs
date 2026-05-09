import React from "react";
import { getLucideComponent } from "../core/lucideRegistry";

const LUCIDE_PREFIX = "lucide:";

function isImageRef(s: string): boolean {
  return (
    /^(data:|https?:|blob:|file:|asset:)/i.test(s) ||
    /^\/.*\.(png|jpg|jpeg|svg|gif|webp|ico)$/i.test(s)
  );
}

export interface IconDisplayProps {
  /** Resolves to one of: `lucide:Name`, image URL/data URL, emoji literal, null. */
  icon?: string | null;
  /** Fallback rendered as text when `icon` is missing or unresolved. */
  fallback?: string;
  /** Pixel size for both Lucide SVG and `<img>`. */
  size?: number;
}

/**
 * HTML-side counterpart de `IconRenderer` (que é SVG-only). Resolve um token
 * de ícone (`lucide:Name` / data URL / emoji literal) num elemento DOM
 * adequado pra usar em chips, listas, previews de inputs, etc.
 */
export const IconDisplay: React.FC<IconDisplayProps> = ({
  icon,
  fallback = "",
  size = 18,
}) => {
  if (icon && icon.startsWith(LUCIDE_PREFIX)) {
    const name = icon.slice(LUCIDE_PREFIX.length);
    const Cmp = getLucideComponent(name);
    if (Cmp) {
      return (
        <span
          aria-hidden="true"
          data-testid="icon-display-lucide"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: size,
            height: size,
            lineHeight: 1,
          }}
        >
          <Cmp size={size} color="currentColor" />
        </span>
      );
    }
    return <span aria-hidden="true">{fallback}</span>;
  }

  if (icon && isImageRef(icon)) {
    return (
      <img
        src={icon}
        alt=""
        width={size}
        height={size}
        style={{ objectFit: "contain" }}
      />
    );
  }

  return <span aria-hidden="true">{icon && icon.length > 0 ? icon : fallback}</span>;
};
