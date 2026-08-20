/**
 * The leaf of core/nodes: targets / formats / processors all depend on it. Both its imports point
 * back at modules that depend on this one — `./targets` derives `TargetId` from a list built here,
 * and `ProcessorField` is derived from the very array the validator checks against. Cycles legal
 * only because both directions erase, so nothing here may acquire a value import.
 */

import type { SET_OPTIONS } from "./processors/set-options"
import type { PROCESSOR_FIELDS } from "./processors/validate"
import type { TargetId } from "./targets"

type DiagnosticLevel = "warning" | "error"

/**
 * The step a diagnostic came from. The pipeline is a fixed sequence of these, so a node that did not
 * reach the output can be traced to the one step that dropped it — which is why only the steps that
 * can drop one are listed.
 *
 * `input` and the three gates in `subscriptions/document-validation` fail by throwing: they end the
 * request rather than describe one node's fate, and need no vocabulary here. `canonicalize` and `wrap`
 * have no failure at all. Rendering has two, and names the reason rather than the step: `capability`
 * when the client's declared lists say it cannot carry the node, `target-validation` when the renderer
 * had the node and found no way to spell it (see `pipeline/render.ts`).
 *
 * `parse` and `parse-validation` are one question — "this entry is not a usable node" — at two levels
 * of knowledge. A format that can phrase completeness in its own protocol's terms, and point at a more
 * useful ordinal, answers it itself and reports `parse`; everything else falls to the generic check.
 */
export type Stage =
  | "parse"
  | "parse-validation"
  | "process"
  | "canonical-validation"
  | "capability"
  | "target-validation"

export interface Diagnostic {
  level: DiagnosticLevel
  stage: Stage
  code: string
  message: string
  line?: number
}

/** What a parser produces: shaped like a node, but not yet guaranteed to be one. */
export type DraftNode = Record<string, unknown>

export interface DraftEntry {
  value: DraftNode
  /** Line formats only; used to locate the diagnostic. */
  line?: number
  /** The draft's ordinal within its format's own output, for formats that have no line. */
  index?: number
}

export interface CanonicalNode {
  type: string
  name: string
  server: string
  port: number
  udp?: boolean
  tls?: boolean
  [key: string]: unknown
}

export interface InspectResult {
  nodes: CanonicalNode[]
  detectedFormat: string
  diagnostics: Diagnostic[]
}

/**
 * Derived from the validator's own list rather than restated: the union and the array are the same
 * claim about which fields a rule may name, and a field added to one alone is a definition the types
 * accept and `processorField` refuses at run time.
 */
export type ProcessorField = (typeof PROCESSOR_FIELDS)[number]

/** Derived from `set-options`'s own list, for the same reason `ProcessorField` is. */
export type SetOption = (typeof SET_OPTIONS)[number]

export type NodeProcessor =
  | {
      type: "filter"
      field?: Exclude<ProcessorField, "port">
      pattern: string
      keep?: boolean
      flags?: string
    }
  | { type: "rename"; pattern: string; replacement: string; flags?: string }
  | { type: "sort"; field?: ProcessorField; order?: "asc" | "desc" }
  | { type: "dedupe"; fields?: ProcessorField[] }
  | {
      type: "handle-duplicates"
      action?: "rename" | "delete"
      fields?: ProcessorField[]
      separator?: string
      position?: "front" | "back"
    }
  | { type: "filter-useless" }
  | { type: "flag"; mode: "add" | "remove" }
  | {
      type: "set-options"
      values: Partial<Record<SetOption, boolean>>
    }

export interface CompileRequest {
  source: string
  target: TargetId
  processors?: NodeProcessor[]
}

export interface CompileResult extends InspectResult {
  content: string
  contentType: string
  fileExtension: string
  /**
   * The nodes that survived target-specific validation and were actually serialized — a subset of
   * `nodes`, which is everything parsing, the rule chain and canonical validation produced before the
   * client had a say. The two differ whenever a client cannot carry something, so anything describing
   * the output reads this one.
   */
  renderedNodes: CanonicalNode[]
}
