import type { CanonicalNode } from "../types"
import type { RenderUnit, Target, TargetSpec } from "./types"

/**
 * The one place a target's own unit type is erased for the registry.
 *
 * The cast is here so it is nowhere else: inside a target's own file `renderNode` and `assemble` agree
 * on that client's concrete unit type and need no assertion, while the registry holds them all under
 * one contract. It also folds `Unit | Unit[] | null` down to `Unit[] | null`, so `pipeline/render.ts`
 * faces one shape instead of three.
 */
export function defineTarget<Id extends string, Unit extends RenderUnit>(
  spec: TargetSpec<Id, Unit>,
): Target<Id> {
  return {
    ...spec,
    renderNode(node: CanonicalNode) {
      const rendered = spec.renderNode(node)
      if (rendered === null) return null
      return Array.isArray(rendered) ? rendered : [rendered]
    },
  } as unknown as Target<Id>
}
