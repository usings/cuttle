import type { CanonicalNode } from "../../types"

/** Fields starting with `_` are the core's own bookkeeping and never reach a client's config. */
export function publicNode(node: CanonicalNode) {
  return Object.fromEntries(
    Object.entries(node).filter(([key, value]) => !key.startsWith("_") && value !== undefined),
  ) as CanonicalNode
}
