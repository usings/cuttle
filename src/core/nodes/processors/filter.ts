import { fieldValue, matches, regularExpression } from "./shared"
import type { ProcessorModule } from "./types"
import { fail, processorField, regexp } from "./validate"

/** Keeps the nodes whose field matches, or drops them when `keep` is false. */
export const filterProcessor: ProcessorModule<"filter"> = {
  type: "filter",
  params: ["field", "pattern", "keep", "flags"],

  parse(input, name) {
    const expression = regexp(input.pattern, input.flags, name)
    const field = processorField(input.field, `${name}.field`, "name")
    // A port is a number, and matching one by regular expression has never meant what people expect.
    if (field === "port") fail(`${name}.field does not support port.`)
    if (input.keep != null && typeof input.keep !== "boolean")
      fail(`${name}.keep must be a boolean.`)
    return {
      type: "filter",
      field,
      pattern: expression.pattern,
      flags: expression.flags,
      keep: input.keep as boolean | undefined,
    }
  },

  apply(nodes, processor) {
    // `i` and not `g`: this only asks whether a name matches, and a global pattern would carry its
    // position from one node to the next — which `matches` clears, but there is nothing to gain here.
    const expression = regularExpression(processor.pattern, processor.flags ?? "i")
    const field = processor.field ?? "name"
    const keep = processor.keep !== false
    return nodes.filter((node) => matches(expression, fieldValue(node, field)) === keep)
  },
}
