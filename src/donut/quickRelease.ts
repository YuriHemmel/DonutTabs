import type { Config } from "../core/types/Config";
import type { DonutHoverTarget } from "./Donut";

export type QuickReleaseAction =
  | { type: "openTab"; tabId: string }
  | { type: "openSettings" }
  | { type: "hide" }
  | { type: "noop" };

/** Issue #71 — decide o que fazer ao soltar o atalho global com modo
 *  rápido ligado. Retorna `noop` quando o modo está desligado ou a config
 *  ainda não chegou: o release não dispara nada e o donut fica no fluxo
 *  click-to-open clássico. */
export function decideQuickRelease(
  cfg: Config | null,
  target: DonutHoverTarget,
): QuickReleaseAction {
  if (!cfg?.interaction.quickMode) return { type: "noop" };
  if (target?.kind === "leaf") return { type: "openTab", tabId: target.id };
  if (target?.kind === "gear") return { type: "openSettings" };
  return { type: "hide" };
}
