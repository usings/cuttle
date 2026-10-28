import type { CanonicalNode, Diagnostic } from "../types"
import { isDialablePort } from "../values"

function isBareHost(server: string) {
  if (server.includes("[") || server.includes("]")) return false
  if (!server.includes(":")) return true
  try {
    // A colon denotes an IPv6 literal, not an embedded port or arbitrary authority syntax.
    return new URL(`http://[${server}]/`).hostname.startsWith("[")
  } catch {
    return false
  }
}

/**
 * The single gate every node passes before any client sees it.
 *
 * After the rule chain on purpose: canonicalization guarantees the shape of what a parser produced,
 * but a rule that renames on a bad pattern or sorts on a missing field can hand the renderers a node
 * with an empty name or a `NaN` port. The parser-side checks are Parse Validation's.
 *
 * A failure is a warning rather than an error, matching how an unreadable input node is treated:
 * the rest of the subscription is still worth serving.
 */
export function validateCanonical(nodes: CanonicalNode[]) {
  const diagnostics: Diagnostic[] = []
  const kept = nodes.filter((node) => {
    const broken =
      typeof node.type !== "string" ||
      node.type.length === 0 ||
      typeof node.name !== "string" ||
      node.name.length === 0 ||
      typeof node.server !== "string" ||
      node.server.length === 0 ||
      // oxlint-disable-next-line no-control-regex -- A dialable host cannot carry control characters.
      /[\s\u0000-\u001f\u007f,=/?#@\\"'|]/.test(node.server) ||
      !isBareHost(node.server) ||
      !isDialablePort(node.port)
    if (!broken) return true
    diagnostics.push({
      level: "warning",
      stage: "canonical-validation",
      code: "invalid-canonical-node",
      message: `${String(node.name || node.server || node.type).replaceAll(/[\r\n]/g, " ")} is not a valid node (invalid type, name, server or port); skipped.`,
    })
    return false
  })
  return { nodes: kept, diagnostics }
}
