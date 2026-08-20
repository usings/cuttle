import { processNodes } from "../processors"
import { targetDefinition } from "../targets"
import type { CompileRequest, CompileResult, InspectResult } from "../types"
import { validateCanonical } from "./canonical-validation"
import { canonicalize } from "./canonicalize"
import { prepareInput } from "./input"
import { parseSource } from "./parse"
import { validateDrafts } from "./parse-validation"
import { renderDocument } from "./render"

export { MAX_SOURCE_SIZE } from "./input"

/**
 * Reads source text into the canonical node model, whatever format it arrived in, and reports
 * which format that turned out to be. Nothing here fetches, stores or renders: it is the same
 * function in a browser and in a Worker.
 */
export function inspectNodeList(source: string): InspectResult {
  const prepared = prepareInput(source)
  const parsed = parseSource(prepared)
  const validated = validateDrafts(parsed.drafts)
  return {
    nodes: validated.drafts.map((entry) => canonicalize(entry.value)),
    detectedFormat: parsed.format,
    diagnostics: [...parsed.diagnostics, ...validated.diagnostics],
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
