import type { DraftNode } from "../types"
import { asRecord } from "../values"

/**
 * Reads a proxy the way the Clash family and the canonical model write one: an object that names its
 * own `type`, `server` and `port`.
 *
 * All this does is decide whether an entry is that shape; the entry travels on exactly as the
 * document wrote it, and every normalization it needs is `pipeline/canonicalize.ts`'s.
 *
 * A `type` key is the shape signal, not a completeness one: `structured.ts` reads `null` here to
 * decide whether to try the Egern shape instead, because an Egern proxy is the one shape that carries
 * no usable `type` — its protocol is the key it hangs under. Once a `type` is present this parser
 * owns the entry, even one missing `server` or `port`; whether that is enough to canonicalize is
 * Parse Validation's question.
 */
export function readStructuredProxy(value: unknown): DraftNode | null {
  const input = asRecord(value)
  if (!input) return null
  // On the coerced value, not on `typeof` and not on key presence: `type: 5` is a canonical entry
  // whose type reads as "5", while `type: ""` and a missing key are both Egern candidates. A `typeof`
  // test would send `type: 5` down the Egern path and out through the raw fallback with a number
  // where a string is declared.
  if (String(input.type ?? "").length === 0) return null
  return input
}
