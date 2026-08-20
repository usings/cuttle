import { ValidationError } from "@/core/errors"
import type { CompileResult, Diagnostic, TargetId } from "@/core/nodes"

// Caps a D1 artifact write at 64 chunks in one batch.
export const MAX_DOCUMENT_SIZE = 64 * 128 * 1024

function describeEmptyResult(parsedCount: number, target: TargetId, diagnostics: Diagnostic[]) {
  if (parsedCount === 0) {
    const rejectedByCanonicalValidation = diagnostics.some(
      (diagnostic) => diagnostic.stage === "canonical-validation",
    )
    if (rejectedByCanonicalValidation) {
      return `The nodes parsed from the source failed validation, so nothing can be written for ${target}.`
    }
    return `The source holds no parsable node, so nothing can be written for ${target}.`
  }
  const [first] = diagnostics
  const example = first ? ` For example: ${first.message}` : ""
  const counted = `${parsedCount} ${parsedCount === 1 ? "node" : "nodes"}`
  return `None of the source's ${counted} can be written for ${target}.${example}`
}

export function validateDocument(compiled: CompileResult, target: TargetId) {
  if (compiled.renderedNodes.length === 0) {
    throw new ValidationError(
      describeEmptyResult(compiled.nodes.length, target, compiled.diagnostics),
    )
  }
  // A nonzero rendered count with a blank document is an invariant violation.
  if (compiled.content.trim().length === 0) {
    throw new Error(`${target} rendered an empty document even though nodes were serialized.`)
  }
  if (new TextEncoder().encode(compiled.content).byteLength > MAX_DOCUMENT_SIZE) {
    throw new ValidationError("The compiled subscription document must not exceed 8 MiB.")
  }
}
