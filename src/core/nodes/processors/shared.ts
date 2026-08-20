import { ValidationError } from "@/core/errors"
import type { CanonicalNode, ProcessorField } from "../types"

/**
 * The flag characters a rule's pattern may carry, and the two readings of that one alphabet: the
 * validator refuses a stated flags string that is not all of them, and `regularExpression` strips
 * anything else back out at apply time. Written once because they have to agree — a letter allowed by
 * one and stripped by the other is a pattern that validates and then matches differently.
 */
const REGEXP_FLAG_CHARACTERS = "dgimsuvy"
export const VALID_REGEXP_FLAGS = new RegExp(`^[${REGEXP_FLAG_CHARACTERS}]*$`)
const UNSUPPORTED_REGEXP_FLAG = new RegExp(`[^${REGEXP_FLAG_CHARACTERS}]`, "g")

/**
 * How long a rule's pattern may be. Read by the validator, which refuses a longer one at the edge, and
 * again by `regularExpression`, which is also reachable from a stored definition the validator of the
 * day let through.
 *
 * A definition failure, not a source-size failure: this is a domain constraint on one field of a rule
 * definition, not a request-body size limit — 413 would tell a caller to shrink the request when what
 * needs to shrink is the pattern. The genuine 2 MiB caps are in `core/nodes/pipeline/input.ts`
 * and `subscriptions/source-resolver.ts`.
 */
export const MAX_PATTERN_LENGTH = 256

/**
 * Compiles a pattern for use against a node list.
 *
 * No default of its own: `filter` tests a pattern and `rename` replaces with it, so the two want
 * different flags when a rule states none — and a third default hidden in this signature is a
 * pattern that behaves one way here and another at the call site that forgot to pass anything.
 */
export function regularExpression(pattern: string, flags: string) {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    throw new ValidationError(
      `A regular expression must not exceed ${MAX_PATTERN_LENGTH} characters.`,
    )
  }
  const safeFlags = [...new Set(flags.replaceAll(UNSUPPORTED_REGEXP_FLAG, ""))].join("")
  return new RegExp(pattern, safeFlags)
}

/**
 * Whether a pattern matches, with `lastIndex` cleared first.
 *
 * A `g` or `y` pattern carries its position between calls, so scanning a node list one node at a time
 * with the same compiled expression would test from wherever the last node left off — skipping
 * alternate nodes. Both rules that test a pattern per node go through here rather than each
 * remembering the reset.
 */
export function matches(expression: RegExp, value: string) {
  expression.lastIndex = 0
  return expression.test(value)
}

export function fieldValue(node: CanonicalNode, field: ProcessorField) {
  return String(node[field] ?? "")
}

/**
 * What makes two nodes the same node for the rule asking. Shared by `dedupe` and
 * `handle-duplicates`, which differ in what they do about a repeat rather than in what counts as one;
 * `\u0000` cannot occur in a canonical field, so no pair of values can join into the same key.
 */
export function groupKey(node: CanonicalNode, fields: readonly ProcessorField[]) {
  return fields.map((field) => fieldValue(node, field)).join("\u0000")
}

/**
 * The locale the sort rule collates in, stated rather than inherited.
 *
 * `localeCompare` with no locale takes the runtime's, and the runtime is a developer's machine in a
 * test, a Worker on Cloudflare's edge in production, and whatever CI happens to set in between —
 * which sort a subscriber received would depend on where the compile ran. The three do not merely
 * differ in the tail: under `en` every Chinese name sorts after every Latin one, and under `zh`
 * before, so a list is not shuffled but inverted.
 *
 * `zh` because that is what these names are: proxy names are overwhelmingly Chinese place names, and
 * `zh` orders them by pinyin, which is the order the operator reading them expects. It is also the
 * order this project's own machines were already producing, so nothing on screen moves.
 */
const COLLATION = "zh"

/** Numeric-aware and case-insensitive, so `HK 2` sorts after `HK 1` rather than after `HK 10`. */
export function compare(left: string, right: string) {
  return left.localeCompare(right, COLLATION, { numeric: true, sensitivity: "base" })
}

/** Keeps a sort stable: equal keys fall back to the order the nodes arrived in. */
export function stableSort(
  nodes: CanonicalNode[],
  rank: (left: CanonicalNode, right: CanonicalNode) => number,
) {
  return nodes
    .map((node, originalIndex) => ({ node, originalIndex }))
    .toSorted(
      (left, right) => rank(left.node, right.node) || left.originalIndex - right.originalIndex,
    )
    .map(({ node }) => node)
}
