import type { Diagnostic, DraftEntry } from "../types"
import { parsePlatformLine } from "./platform-lines"
import { readStructuredProxy } from "./proxy-object"
import { parseUri } from "./proxy-uri"
import type { SourceFormat } from "./types"

const URI_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i
/** Only whitespace that is followed by another `scheme://` starts a new node. */
const URI_BOUNDARY = /\s+(?=[a-z][a-z0-9+.-]*:\/\/)/i

/**
 * Subscriptions are often pasted with every URI on one line, separated by spaces. Splitting on the
 * boundary rather than on all whitespace keeps an unencoded `#Hong Kong` in one piece, and leaves
 * non-URI lines (platform rows, JSON) to their own parsers.
 */
function splitUriLine(line: string) {
  if (!URI_SCHEME.test(line)) return [line]
  return line.split(URI_BOUNDARY)
}

/**
 * What to call a list of lines. One recognised line format names the whole source; several, or none,
 * make it `mixed`. Protocol URIs are the one format whose name is not its own — a list of them is a
 * `uri-list` — and a Base64 envelope prefixes whatever the answer was.
 */
function lineListFormat(formats: Set<string>, encoded: boolean) {
  const only = formats.size === 1 ? [...formats][0] : null
  const name = only === "uri" ? "uri-list" : (only ?? "mixed")
  return encoded ? `base64-${name}` : name
}

/**
 * One node per line: protocol URIs, Surge, Loon and Quantumult X proxy rows, and single-line JSON
 * objects. The last reader tried, so also where anything nothing else recognised ends up — every line
 * it cannot read becomes a diagnostic naming that line.
 */
export const nodeLinesFormat: SourceFormat = {
  id: "node-lines",
  parse: ({ encoded, text }) => {
    const drafts: DraftEntry[] = []
    const diagnostics: Diagnostic[] = []
    const formats = new Set<string>()

    for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
      // A leading `- ` is how a YAML list writes an item; the rest of the line is still a node.
      const line = rawLine.trim().replace(/^\s*-\s*/, "")
      if (!line || line.startsWith("#") || line.startsWith("//")) continue
      for (const candidate of splitUriLine(line)) {
        try {
          const platform = candidate.startsWith("{") ? null : parsePlatformLine(candidate)
          const node = candidate.startsWith("{")
            ? readStructuredProxy(JSON.parse(candidate))
            : (parseUri(candidate) ?? platform?.node ?? null)
          // A platform row only names its format when that is the reading that won; a URI beats it.
          if (platform && node === platform.node) formats.add(platform.format)
          else if (node) formats.add("uri")
          if (node) drafts.push({ value: node, line: index + 1 })
          else {
            diagnostics.push({
              level: "warning",
              stage: "parse",
              code: "unsupported-input-line",
              message: "Unrecognised node format on this line.",
              line: index + 1,
            })
          }
        } catch (error) {
          diagnostics.push({
            level: "warning",
            stage: "parse",
            code: "invalid-input-line",
            message: error instanceof Error ? error.message : "Node parsing failed.",
            line: index + 1,
          })
        }
      }
    }

    return { format: lineListFormat(formats, encoded), drafts, diagnostics }
  },
}
