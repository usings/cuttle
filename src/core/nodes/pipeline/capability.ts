import type { TargetCapability } from "../targets/types"
import type { CanonicalNode } from "../types"

/**
 * Whether a client can carry this node at all; the renderer decides how to spell what is left.
 *
 * Per-protocol options override the target-wide transport default. TLS requirements describe what
 * the output can express, not whether a remote server works. A refusal must precede serialization
 * so an unsupported security property cannot be silently discarded.
 */
export function capabilityIssue(capability: TargetCapability, node: CanonicalNode): string | null {
  if (capability.protocols !== "all" && !capability.protocols.includes(node.type)) {
    return "The protocol is unsupported."
  }
  if (capability.accepts && !capability.accepts(node))
    return "The protocol options are unsupported."
  const options = capability.protocolOptions?.[node.type]
  const network = String(node.network || "tcp")
  const transports = options?.transports ?? capability.transports
  if (transports && transports !== "all" && !transports.includes(network)) {
    return "The transport cannot be represented for this protocol."
  }
  if (options?.tls === "unsupported" && (node.tls || node["reality-opts"])) {
    return "TLS cannot be represented for this protocol."
  }
  if (options?.tls === "required" && node.tls === false) {
    return "This protocol requires TLS in the output format."
  }
  if (options?.reality === false && node["reality-opts"]) {
    return "Reality cannot be represented for this protocol."
  }
  return null
}
