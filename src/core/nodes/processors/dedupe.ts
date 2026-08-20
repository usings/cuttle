import type { ProcessorField } from "../types"
import { groupKey } from "./shared"
import type { ProcessorModule } from "./types"
import { fieldList } from "./validate"

/**
 * Two nodes with the same endpoint are the same node, however they were named.
 *
 * Exported because the interface has to name these fields when it summarises a rule that states none
 * of its own, and a second copy over there is how that summary came to disagree with what `apply`
 * actually groups on.
 */
export const DEDUPE_DEFAULT_FIELDS: readonly ProcessorField[] = ["type", "server", "port"]

export const dedupeProcessor: ProcessorModule<"dedupe"> = {
  type: "dedupe",
  params: ["fields"],

  parse(input, name) {
    return { type: "dedupe", fields: fieldList(input.fields, name) }
  },

  apply(nodes, processor) {
    // An empty `fields` array is silence rather than "no fields".
    const fields = processor.fields?.length ? processor.fields : DEDUPE_DEFAULT_FIELDS
    const seen = new Set<string>()
    return nodes.filter((node) => {
      const key = groupKey(node, fields)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  },
}
