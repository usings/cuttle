import { regularExpression } from "./shared"
import type { ProcessorModule } from "./types"
import { regexp, text } from "./validate"

/** Rewrites node names. A replacement that would empty a name leaves the original standing. */
export const renameProcessor: ProcessorModule<"rename"> = {
  type: "rename",
  params: ["pattern", "replacement", "flags"],

  parse(input, name) {
    const expression = regexp(input.pattern, input.flags, name)
    return {
      type: "rename",
      pattern: expression.pattern,
      flags: expression.flags,
      replacement: text(input.replacement, `${name}.replacement`, 512, true),
    }
  },

  apply(nodes, processor) {
    // `g`, unlike `filter`'s default: a rename that states no flags is expected to rewrite every
    // occurrence in the name, not only the first one.
    const expression = regularExpression(processor.pattern, processor.flags ?? "gi")
    return nodes.map((node) => ({
      ...node,
      name: node.name.replace(expression, processor.replacement).trim() || node.name,
    }))
  },
}
