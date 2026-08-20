import { compare, fieldValue, stableSort } from "./shared"
import type { ProcessorModule } from "./types"
import { oneOf, processorField } from "./validate"

export const sortProcessor: ProcessorModule<"sort"> = {
  type: "sort",
  params: ["field", "order"],

  parse(input, name) {
    return {
      type: "sort",
      field: processorField(input.field, `${name}.field`, "name"),
      order: oneOf(input.order, ["asc", "desc"] as const, `${name}.order`, "must be asc or desc."),
    }
  },

  apply(nodes, processor) {
    const field = processor.field ?? "name"
    const direction = processor.order === "desc" ? -1 : 1
    return stableSort(
      nodes,
      (left, right) => direction * compare(fieldValue(left, field), fieldValue(right, field)),
    )
  },
}
