import React from "react";
import * as Lucide from "lucide-react";

const LUCIDE_PREFIX = "lucide:";

export interface IconRendererProps {
  /** Resolves to one of: `lucide:Name`, image URL/data URL, emoji literal, null. */
  icon?: string | null;
  /** Used when `icon` is missing or fails to resolve as a Lucide name. */
  fallback?: string;
  /** SVG sizing — passed straight to whichever leaf the renderer picks. */
  size?: number;
}

const lucideRegistry = Lucide as unknown as Record<string, unknown>;

function resolveLucideComponent(name: string) {
  const direct = lucideRegistry[name];
  if (typeof direct === "function" || typeof direct === "object") {
    return direct as React.ComponentType<{ size?: number; color?: string }>;
  }
  return null;
}

function isImageRef(s: string): boolean {
  return /^(data:|https?:|blob:|file:|asset:)/i.test(s) || /^\/.*\.(png|jpg|jpeg|svg|gif|webp|ico)$/i.test(s);
}

/**
 * Decides how to render a tab/profile icon string inside the donut SVG:
 *   "lucide:CoffeeIcon" → Lucide React component
 *   data:/http:/file:/asset: URL → SVG <image>
 *   any other text       → emoji-style <text>
 * When everything fails, falls back to `fallback` rendered as text.
 */
export const IconRenderer: React.FC<IconRendererProps> = ({
  icon,
  fallback = "",
  size = 22,
}) => {
  if (icon && icon.startsWith(LUCIDE_PREFIX)) {
    const name = icon.slice(LUCIDE_PREFIX.length);
    const Cmp = resolveLucideComponent(name);
    if (Cmp) {
      return (
        <foreignObject
          x={-size / 2}
          y={-size / 2}
          width={size}
          height={size}
          style={{ pointerEvents: "none", color: "#eaeaea" }}
        >
          <Cmp size={size} color="currentColor" />
        </foreignObject>
      );
    }
    return <text fontSize={size}>{fallback}</text>;
  }

  if (icon && isImageRef(icon)) {
    return (
      <image
        href={icon}
        x={-size / 2}
        y={-size / 2}
        width={size}
        height={size}
        preserveAspectRatio="xMidYMid meet"
      />
    );
  }

  const literal = icon ?? fallback;
  return <text fontSize={size}>{literal}</text>;
};
