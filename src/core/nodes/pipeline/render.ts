import type { RenderUnit, Target } from "../targets/types"
import type { CanonicalNode, Diagnostic, Stage } from "../types"
import { acceptsNode } from "./capability"

function renamed(node: CanonicalNode, name: string) {
  return name === node.name ? node : { ...node, name }
}

/**
 * A client keys its policies by proxy name, so two nodes called the same thing leave one of them
 * unreachable — and sing-box refuses to load a configuration with a duplicate tag at all. The second
 * occurrence onwards is numbered rather than dropped.
 *
 * Numbered over the whole list before anything is refused: a node the client cannot carry still
 * consumes its name, and dropping it from the count would renumber every node after it.
 */
function uniqueNames(nodes: CanonicalNode[], target: Target) {
  const counts = new Map<string, number>()
  const taken = new Set<string>()
  return nodes.map((node) => {
    let count = counts.get(node.name) ?? 0
    let candidate: CanonicalNode
    let occupied: string[]
    // Counting per name does not guarantee uniqueness, which is what `uniqueNames` promises: `A`,
    // `A`, `A 2` numbers the second `A` to `A 2` and hands the third a name already spoken for. So
    // the search only ends on a name nothing has taken.
    //
    // What a name takes is not only itself. A target that derives further names from it (sing-box's
    // `${name}_shadowtls`) occupies those too, and one that transforms it on the way out (the line
    // formats' `policyName`) occupies the transformed form instead of the original — both collide
    // with names per-name counting cannot see. Every candidate is therefore tested, and reserved, as
    // the whole set, read off the *renamed* node so the reservation matches what `renderNode` will
    // mint from the name this node ends up with.
    do {
      count += 1
      candidate = renamed(node, count === 1 ? node.name : `${node.name} ${count}`)
      occupied = [
        target.renderedName?.(candidate) ?? candidate.name,
        ...(target.derivedNames?.(candidate) ?? []),
      ]
    } while (occupied.some((name) => taken.has(name)))
    counts.set(node.name, count)
    for (const name of occupied) taken.add(name)
    return candidate
  })
}

/**
 * A diagnostic reaches logs and the interface, where a value holding a line separator would forge a
 * second entry. Every field a refusal interpolates carries remote input — a name from a URI fragment
 * or a YAML `name:`, a type from whatever the source called the protocol — so all of them go through
 * here, not only the one that happened to be noticed.
 */
function scrubbed(value: unknown) {
  return String(value).replaceAll(/[\r\n]/g, " ")
}

/**
 * A node can fail to appear for two reasons: the capability lists say the client cannot carry it at
 * all, or the renderer found it could not be spelled. That is the difference between "this client
 * does not do WireGuard" and "this client does TUIC, but not version 4", so the message and the
 * stage both say which.
 *
 * `network` is read with `||` rather than `??`: an empty string is not a transport name, and a node
 * carrying one still runs over TCP.
 */
function refusal(
  node: CanonicalNode,
  target: Target,
  stage: Extract<Stage, "capability" | "target-validation">,
): Diagnostic {
  const name = scrubbed(node.name)
  const type = scrubbed(node.type)
  const network = scrubbed(node.network || "tcp")
  return {
    level: "warning",
    stage,
    code: stage === "capability" ? "capability-refused" : "render-refused",
    message:
      stage === "capability"
        ? `${name} (${type}/${network}) cannot be carried by ${target.id}; skipped.`
        : `${name} (${type}/${network}) has no ${target.id} spelling; skipped.`,
  }
}

/**
 * Capability Check, Target Node Render and Target Node Validation, in that order and for every
 * client the same way. The gate is here rather than in something a target has to remember to call,
 * so it applies to every client in the registry — including the next one added, which is the point.
 *
 * `renderedNodes` is the node list rather than a count because nothing downstream can re-derive it: a
 * node can clear the capability lists and still have no line the renderer can write it on, so this is
 * the only place that knows which ones came out — carrying the names the document gave them.
 */
export function renderDocument(nodes: CanonicalNode[], target: Target) {
  const diagnostics: Diagnostic[] = []
  const renderedNodes: CanonicalNode[] = []
  const units: RenderUnit[] = []

  for (const node of target.uniqueNames ? uniqueNames(nodes, target) : nodes) {
    if (!acceptsNode(target, node)) {
      diagnostics.push(refusal(node, target, "capability"))
      continue
    }
    const rendered = target.renderNode(node)
    if (rendered === null || rendered.length === 0) {
      diagnostics.push(refusal(node, target, "target-validation"))
      continue
    }
    // The renamed node, not the one that arrived: a caller reading this back wants the name the
    // proxy actually carries in the document.
    renderedNodes.push(node)
    units.push(...rendered)
  }

  return { content: target.assemble(units), diagnostics, renderedNodes }
}
