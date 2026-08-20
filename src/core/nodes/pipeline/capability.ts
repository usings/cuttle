import type { CanonicalNode } from "../types"

/**
 * What a client can carry at all, before any question of how it is spelled. The lists are the coarse
 * answer; `accepts` is for what they cannot say — a cipher, a protocol version, a plugin.
 */
export interface TargetCapability {
  protocols: readonly string[] | "all"
  transports?: readonly string[] | "all"
  accepts?: (node: CanonicalNode) => boolean
}

/**
 * Whether a client can carry this node at all; the renderer decides how to spell what is left.
 *
 * The only reading of the three fields above: the `"all"` sentinel, a missing `transports` list and
 * the `tcp` default live here rather than at the call sites, so no renderer can check the protocol
 * list and forget what `accepts` had to say.
 */
export function acceptsNode(capability: TargetCapability, node: CanonicalNode) {
  if (capability.protocols !== "all" && !capability.protocols.includes(node.type)) return false
  if (capability.accepts && !capability.accepts(node)) return false
  const network = String(node.network || "tcp")
  return (
    capability.transports === "all" ||
    !capability.transports ||
    capability.transports.includes(network)
  )
}
