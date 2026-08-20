import { parse as parseYaml } from "yaml"
import { ValidationError } from "@/core/errors"
import { maybeDecodeBase64 } from "../base64"
import type { PreparedSource } from "../formats/types"

/**
 * The largest source this core will read, and the ceiling everything upstream is held to: a source the
 * store accepted but the compiler refuses is a subscription that saves and then fails every delivery.
 * `subscriptions/schema.ts` caps what may be stored against this, and
 * `subscriptions/source-resolver.ts` caps what may be fetched and merged.
 */
export const MAX_SOURCE_SIZE = 2 * 1024 * 1024

/**
 * Surge and Quantumult X hand out whole configuration files. The nodes are in one named section of
 * them, and the rest is rules and settings no reader here has any use for.
 *
 * The section ends at the next `[header]` or at the end of the file. `$` cannot say the latter here:
 * `m` is needed so `^` anchors the header, and under `m` a `$` matches every line ending — which the
 * lazy quantifier takes, cutting the section off after its first line. `(?![\s\S])` is end of input
 * regardless of the flag.
 */
function extractProxySection(source: string) {
  const match = source.match(/^\[(?:Proxy|server_local)\]\s*\r?\n([\s\S]*?)(?=^\[|$(?![\s\S]))/im)
  return match?.[1]?.trim() || source
}

/**
 * The first stage: everything that happens to a source before any format looks at it.
 *
 * Both unwrapping steps are shared — a Base64 body can hold any format, a configuration file any of
 * the line ones — and so is the parsed document: sing-box, Xray, V2Ray and the generic proxy-list
 * reader are four formats over the same JSON or YAML, and parsing up to 2 MiB once per format is
 * four times the work for one answer.
 */
export function prepareInput(source: string): PreparedSource {
  if (typeof source !== "string") throw new ValidationError("source must be a string")
  if (new TextEncoder().encode(source).byteLength > MAX_SOURCE_SIZE) {
    throw new ValidationError("Subscription content must not exceed 2 MiB")
  }

  const decoded = maybeDecodeBase64(source)
  const text = extractProxySection(decoded ?? source).trim()

  // `parsed` distinguishes "not attempted" from "attempted and failed"; the latter is a null result
  // a format is entitled to see without the parse being retried for every format after it.
  let parsed = false
  let document: unknown = null
  return {
    text,
    encoded: decoded !== null,
    document() {
      if (parsed) return document
      parsed = true
      try {
        const value =
          text.startsWith("{") || text.startsWith("[") ? JSON.parse(text) : parseYaml(text)
        // YAML happily parses a bare line like `ss://...` into the string itself; that is not a
        // document any structured format can read, so it counts as a failed parse too.
        document = value && typeof value === "object" ? value : null
      } catch {
        document = null
      }
      return document
    },
  }
}
