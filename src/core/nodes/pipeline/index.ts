import { ValidationError } from "@/core/errors"
import { processNodes } from "../processors"
import { targetDefinition } from "../targets"
import type { CompileRequest, CompileResult, InspectResult } from "../types"
import { validateCanonical } from "./canonical-validation"
import { canonicalize } from "./canonicalize"
import { MAX_SOURCE_SIZE, prepareInput } from "./input"
import { parseSource } from "./parse"
import { validateDrafts } from "./parse-validation"
import { renderDocument } from "./render"

export { MAX_SOURCE_SIZE }

/**
 * Parses each source independently, merges its canonical nodes in source order, and reports
 * their format (mixed when formats differ). Diagnostics retain source-local line numbers.
 * Nothing here fetches, stores or renders: it is the same
 * function in a browser and in a Worker.
 */
export function inspectNodeList(source: string | string[]): InspectResult {
  const sources = Array.isArray(source) ? source : [source]
  const encoder = new TextEncoder()
  let size = 0
  const results = sources.map((text) => {
    if (typeof text !== "string") throw new ValidationError("source must be a string")
    size += encoder.encode(text).byteLength
    if (size > MAX_SOURCE_SIZE) {
      throw new ValidationError("Combined subscription content must not exceed 2 MiB")
    }
    const parsed = parseSource(prepareInput(text))
    const validated = validateDrafts(parsed.drafts)
    return {
      nodes: validated.drafts.map((entry) => canonicalize(entry.value)),
      detectedFormat: parsed.format,
      diagnostics: [...parsed.diagnostics, ...validated.diagnostics],
    }
  })
  const formats = new Set(results.map((result) => result.detectedFormat))
  return {
    nodes: results.flatMap((result) => result.nodes),
    detectedFormat: formats.size === 1 ? results[0].detectedFormat : "mixed",
    diagnostics: results.flatMap((result, sourceIndex) =>
      result.diagnostics.map((diagnostic) =>
        sources.length > 1 ? { ...diagnostic, sourceIndex } : diagnostic,
      ),
    ),
  }
}

/** Parse, process, render: the whole pipeline, and the one call a node list is compiled by. */
export function compileNodeList(request: CompileRequest): CompileResult {
  const inspected = inspectNodeList(request.source)
  const processed = processNodes(inspected.nodes, request.processors)
  // After the rule chain, not before it — see `canonical-validation.ts`.
  const validated = validateCanonical(processed.nodes)
  const definition = targetDefinition(request.target)
  const rendered = renderDocument(validated.nodes, definition)
  return {
    ...inspected,
    nodes: validated.nodes,
    content: rendered.content,
    contentType: definition.contentType,
    fileExtension: definition.fileExtension,
    renderedNodes: rendered.renderedNodes,
    diagnostics: [
      ...inspected.diagnostics,
      ...processed.diagnostics,
      ...validated.diagnostics,
      ...rendered.diagnostics,
    ],
  }
}
