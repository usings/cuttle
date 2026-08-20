import { FORMATS } from "../formats"
import type { ParseOutput, PreparedSource } from "../formats/types"

/**
 * The first format that recognises the source reads it; the registry order is the detection rule.
 * Why that order, in `formats/index.ts`.
 */
export function parseSource(input: PreparedSource): ParseOutput {
  for (const format of FORMATS) {
    const output = format.parse(input)
    if (output) return output
  }
  // Unreachable: the line format accepts every input. Kept so the loop has no implicit fall-through.
  return { format: "mixed", drafts: [], diagnostics: [] }
}
