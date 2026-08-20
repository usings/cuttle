import type { ProcessorField } from "../types"
import { groupKey } from "./shared"
import type { ProcessorModule } from "./types"
import { fieldList, oneOf, text } from "./validate"

/**
 * What to do about nodes a client cannot tell apart. Numbering them keeps every node reachable;
 * deleting keeps only the first. Names are the default, because that is what a client keys on.
 */
export const handleDuplicatesProcessor: ProcessorModule<"handle-duplicates"> = {
  type: "handle-duplicates",
  params: ["action", "fields", "separator", "position"],

  parse(input, name) {
    // Checked in this order, and the object built in the other: a definition with more than one thing
    // wrong reports the same field it always did, and stores its keys in the same order.
    const fields = fieldList(input.fields, name)
    const action = oneOf(
      input.action,
      ["rename", "delete"] as const,
      `${name}.action`,
      "must be rename or delete.",
    )
    const position = oneOf(
      input.position,
      ["front", "back"] as const,
      `${name}.position`,
      "must be front or back.",
    )
    const separator =
      input.separator == null ? undefined : text(input.separator, `${name}.separator`, 16, true)
    return { type: "handle-duplicates", fields, action, separator, position }
  },

  apply(nodes, processor) {
    const fields: ProcessorField[] = processor.fields?.length ? [...processor.fields] : ["name"]
    const separator = processor.separator ?? "-"
    const counts = new Map<string, number>()
    for (const node of nodes) {
      const key = groupKey(node, fields)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }
    const seen = new Map<string, number>()
    return nodes.flatMap((node) => {
      const key = groupKey(node, fields)
      const duplicateIndex = (seen.get(key) ?? 0) + 1
      seen.set(key, duplicateIndex)
      if (processor.action === "delete" && duplicateIndex > 1) return []
      // A node with no duplicate keeps the name it has: numbering a unique node reads as an error.
      if (processor.action !== "delete" && (counts.get(key) ?? 0) > 1) {
        return [
          {
            ...node,
            name:
              processor.position === "front"
                ? `${duplicateIndex}${separator}${node.name}`
                : `${node.name}${separator}${duplicateIndex}`,
          },
        ]
      }
      return [node]
    })
  },
}
