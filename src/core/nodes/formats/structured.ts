import type { DraftEntry } from "../types"
import { asRecord } from "../values"
import { parseEgernProxy } from "./platform-lines"
import { readStructuredProxy } from "./proxy-object"
import type { SourceFormat } from "./types"

/**
 * Where a document of this shape keeps its proxies, whichever of the two spellings it uses.
 *
 * No skip list for the `direct`/`block`/`selector` outbounds a sing-box or Xray config carries: one
 * of those names *is* a `type`, and an `outbounds` array holding any entry with a `type` is claimed
 * by `formats/sing-box.ts` before this reader is offered the source. Only an `outbounds` list where
 * no entry names a type or a protocol arrives here, and there is nothing in one for such a list to
 * skip. What the entries are is `readStructuredProxy`'s question; the array's shape is this one's.
 */
function proxyEntries(value: unknown) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== "object") return null
  const record = value as Record<string, unknown>
  if (Array.isArray(record.proxies)) return record.proxies
  // A `null` or a bare string among the outbounds is not an entry anyone can read as a proxy, and
  // counting it would number every diagnostic after it against the wrong element.
  if (Array.isArray(record.outbounds)) {
    return record.outbounds.filter((item) => item && typeof item === "object")
  }
  return null
}

/**
 * JSON and YAML documents: Clash-family proxy lists, Egern proxy lists and the canonical model
 * itself. A sing-box, Xray or V2Ray configuration is caught earlier, by `formats/sing-box.ts`,
 * `formats/xray.ts` and `formats/v2ray.ts` — none of them ever reach this reader.
 *
 * The format is named by what the entries turned out to be, not by how the document parsed.
 *
 * Every entry becomes a draft, complete or not: this parser only tells a canonical-shaped entry from
 * an Egern-shaped one. Whether an entry is complete enough to canonicalize is Parse Validation's.
 */
export const structuredFormat: SourceFormat = {
  id: "structured",
  parse: ({ text, document }) => {
    const value = document()
    if (value === null) return null

    const entries = proxyEntries(value)
    if (!entries) return null

    let egern = false
    const drafts: DraftEntry[] = entries.map((item, index) => {
      const structuredNode = readStructuredProxy(item)
      // Only an entry the canonical-shape parser refused is offered to the Egern one: trying both
      // would read a canonical node whose `type` collides with an Egern key twice, once each way.
      const egernNode = structuredNode === null ? parseEgernProxy(item) : null
      if (egernNode) egern = true
      return { value: structuredNode ?? egernNode ?? asRecord(item) ?? {}, index }
    })

    const format = egern ? "egern" : text.startsWith("{") || text.startsWith("[") ? "json" : "yaml"
    return { format, drafts, diagnostics: [] }
  },
}
