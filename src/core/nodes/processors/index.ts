import type { CanonicalNode, Diagnostic, NodeProcessor } from "../types"
import { asRecord } from "../values"
import { dedupeProcessor } from "./dedupe"
import { filterProcessor } from "./filter"
import { filterUselessProcessor } from "./filter-useless"
import { flagProcessor } from "./flag"
import { handleDuplicatesProcessor } from "./handle-duplicates"
import { renameProcessor } from "./rename"
import { setOptionsProcessor } from "./set-options"
import { sortProcessor } from "./sort"
import type { AnyProcessorModule } from "./types"
import { fail, onlyKeys } from "./validate"

export { DEDUPE_DEFAULT_FIELDS } from "./dedupe"
export { PROCESSOR_FIELDS } from "./validate"
export { SET_OPTIONS } from "./set-options"

/** A chain longer than this is a mistake rather than a configuration. */
const MAX_PROCESSORS = 32

const MODULES: AnyProcessorModule[] = [
  filterProcessor,
  renameProcessor,
  sortProcessor,
  dedupeProcessor,
  handleDuplicatesProcessor,
  filterUselessProcessor,
  flagProcessor,
  setOptionsProcessor,
]

const BY_TYPE = new Map(MODULES.map((module) => [module.type, module] as const))

/**
 * Validates a whole chain, for every caller — the management API checking what was sent, the store
 * checking what it read back — so what it accepts is a compatibility surface, not an input filter.
 */
export function parseProcessors(value: unknown, name = "processors"): NodeProcessor[] {
  if (!Array.isArray(value)) fail(`${name} must be an array.`)
  if (value.length > MAX_PROCESSORS) fail(`${name} must not exceed ${MAX_PROCESSORS} entries.`)
  return value.map((entry, index) => {
    const label = `${name}[${index}]`
    const input = asRecord(entry) ?? fail(`${label} must be an object.`)
    const module = BY_TYPE.get(input.type as NodeProcessor["type"])
    if (!module) fail(`${label}.type is not supported.`)
    // Here rather than in each rule: a definition may only carry the fields its own rule declares, and
    // the rule already declares them as `params`. A stray key is a typo, not intent.
    onlyKeys(input, ["type", ...module.params], label)
    return module.parse(input, label)
  })
}

/**
 * Runs a chain over a node list, in order. A rule that throws is reported and skipped rather than
 * failing the delivery: the nodes are still worth serving, and the diagnostic names what was dropped.
 */
export function processNodes(nodes: CanonicalNode[], processors: NodeProcessor[] = []) {
  let output = nodes.map((node) => structuredClone(node))
  const diagnostics: Diagnostic[] = []

  if (processors.length > MAX_PROCESSORS) {
    diagnostics.push({
      level: "error",
      stage: "process",
      code: "too-many-processors",
      message: `No more than ${MAX_PROCESSORS} processors are allowed; the rest were ignored.`,
    })
  }

  for (const [index, processor] of processors.slice(0, MAX_PROCESSORS).entries()) {
    const module = BY_TYPE.get(processor.type)
    if (!module) {
      diagnostics.push({
        level: "error",
        stage: "process",
        code: "invalid-processor",
        message: `Processor #${index + 1} has an unsupported type.`,
      })
      continue
    }
    try {
      output = module.apply(output, processor)
    } catch (error) {
      diagnostics.push({
        level: "error",
        stage: "process",
        code: "invalid-processor",
        message: `Processor #${index + 1} is invalid: ${error instanceof Error ? error.message : "processing failed"}`,
      })
    }
  }

  return { nodes: output, diagnostics }
}
