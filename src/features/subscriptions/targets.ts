import { targetLabel } from "@/core/nodes"
import type { TargetId } from "@/core/nodes"

/**
 * The clients this interface offers, in the order it offers them — grouped the way a person looks
 * for one, which is not the order the API lists them in. The names come from the target registry, so
 * a client is named in exactly one place, and a test keeps this list and the registry from drifting.
 */
const TARGET_DISPLAY_ORDER: TargetId[] = [
  "uri",
  "quantumult-x",
  "shadowrocket",
  "surge",
  "surge-mac",
  "surfboard",
  "loon",
  "mihomo",
  "clash",
  "stash",
  "egern",
  "v2ray",
  "xray",
  "sing-box",
]

export const TARGET_OPTIONS: Array<{ label: string; value: TargetId }> = TARGET_DISPLAY_ORDER.map(
  (value) => ({ label: targetLabel(value), value }),
)

/** What both the workbench and the editor start on, so reordering the picker moves neither alone. */
export const DEFAULT_TARGET = TARGET_OPTIONS[0].value
