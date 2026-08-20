import { asRecord } from "../values"
import type { ProcessorModule } from "./types"
import { fail } from "./validate"

/**
 * The switches this rule can force, and the only ones its definition accepts. Exported because
 * `NodeProcessor`'s own member is derived from it rather than restating the three names, and because
 * the interface has to offer exactly these and no others.
 */
export const SET_OPTIONS = ["udp", "tfo", "skip-cert-verify"] as const

/** Forces a switch on every node, for a source that states none of them. */
export const setOptionsProcessor: ProcessorModule<"set-options"> = {
  type: "set-options",
  params: ["values"],

  parse(input, name) {
    const values = asRecord(input.values) ?? fail(`${name}.values must be an object.`)
    if (
      Object.keys(values).some((key) => !SET_OPTIONS.includes(key as (typeof SET_OPTIONS)[number]))
    ) {
      fail(`${name}.values has an unsupported field.`)
    }
    for (const [key, option] of Object.entries(values)) {
      if (typeof option !== "boolean") fail(`${name}.values.${key} must be a boolean.`)
    }
    return { type: "set-options", values }
  },

  apply: (nodes, processor) => nodes.map((node) => ({ ...node, ...processor.values })),
}
