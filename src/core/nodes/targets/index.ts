import { clashTarget } from "./clash"
import { egernTarget } from "./egern"
import { jsonTarget } from "./json"
import { loonTarget } from "./loon"
import { mihomoTarget } from "./mihomo"
import { quantumultXTarget } from "./quantumult-x"
import { shadowrocketTarget } from "./shadowrocket"
import { singBoxTarget } from "./sing-box"
import { stashTarget } from "./stash"
import { surfboardTarget } from "./surfboard"
import { surgeTarget } from "./surge"
import { surgeMacTarget } from "./surge-mac"
import type { Target } from "./types"
import { uriTarget } from "./uri"
import { v2rayTarget } from "./v2ray"
import { xrayTarget } from "./xray"

/**
 * Every client this core can write, and the only list of them. The order is the one the API states a
 * rejected `target` against, so it is part of that error message: do not rearrange.
 */
const TARGETS = [
  jsonTarget,
  uriTarget,
  mihomoTarget,
  clashTarget,
  singBoxTarget,
  xrayTarget,
  quantumultXTarget,
  surgeTarget,
  surgeMacTarget,
  egernTarget,
  stashTarget,
  loonTarget,
  shadowrocketTarget,
  surfboardTarget,
  v2rayTarget,
]

export type TargetId = (typeof TARGETS)[number]["id"]

export const TARGET_IDS = TARGETS.map((target) => target.id) as TargetId[]

const BY_ID = new Map(TARGETS.map((target) => [target.id, target] as const))

export function targetDefinition(id: TargetId) {
  const target = BY_ID.get(id)
  if (!target) throw new Error(`Missing target definition for ${id}`)
  return target as Target<TargetId>
}

/** The clients a user picks between, in the order the interface offers them. */
export function selectableTargets() {
  return TARGETS.filter((target) => target.selectable !== false)
}

export function targetLabel(id: TargetId) {
  return BY_ID.get(id)?.label ?? id
}
