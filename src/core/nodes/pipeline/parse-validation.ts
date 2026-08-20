import type { Diagnostic, DraftEntry } from "../types"
import { asPort, asString } from "../values"

/**
 * Whether a draft is node-shaped enough to canonicalize: it names a protocol, an address and a
 * port a client could dial.
 *
 * The generic answer, for the formats whose completeness is a generic question: whatever a
 * structured entry or a line resolved to, either it names a protocol, an address and a port or it
 * does not. `ssd.ts`, `sing-box.ts` and `xray.ts` still answer this themselves, because for
 * them completeness is a protocol-shape question — a WireGuard peer's address, an Xray
 * legacy-vs-current settings shape — and their own diagnostic names the outbound kind.
 */
function usable(draft: DraftEntry["value"]) {
  return Boolean(
    asString(String(draft.type ?? "")) &&
    asString(String(draft.server ?? draft.address ?? "")) &&
    asPort(draft.port ?? draft.server_port),
  )
}

export function validateDrafts(drafts: DraftEntry[]) {
  const diagnostics: Diagnostic[] = []
  const kept = drafts.filter((entry) => {
    if (usable(entry.value)) return true
    const position = entry.index === undefined ? "" : ` #${entry.index + 1}`
    diagnostics.push({
      level: "warning",
      stage: "parse-validation",
      code: "incomplete-node",
      message: `Node${position} is missing type, server or port; skipped.`,
      ...(entry.line === undefined ? {} : { line: entry.line }),
    })
    return false
  })
  return { drafts: kept, diagnostics }
}
