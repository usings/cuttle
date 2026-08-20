import type { CanonicalNode } from "./types"

/**
 * The value coercions every reader and writer in this module shares. A coercion that disagrees with
 * itself across formats is how one format comes to accept a node another rejects.
 */

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

const MAX_PORT = 65_535

/**
 * Whether a value is a port a client could dial, and the only statement of that range.
 *
 * Read by the URI and document readers through `asPort`, by Canonical Validation, and by the
 * `filter-useless` rule — three places that had drifted into three spellings of one bound.
 */
export function isDialablePort(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_PORT
}

/**
 * A port a client could dial, or nothing. Named for what it checks rather than for the type it
 * returns: the bound is the port range, so a reader that wanted any number at all — a bandwidth, a
 * timeout — silently loses every value above 65535, and every value that is not a whole one.
 */
export function asPort(value: unknown): number | undefined {
  const number = typeof value === "number" ? value : Number(value)
  return isDialablePort(number) ? number : undefined
}

/**
 * A link speed in megabits. `0` is a value here rather than silence — Hysteria reads it as "do not
 * shape this direction" — so it goes through `Number.isFinite` and a `>= 0` bound rather than
 * through the truthiness the other coercions use.
 */
export function asMegabits(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined
  if (value === "") return undefined
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : undefined
}

export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

export function compactRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ""),
  )
}

export function canonicalNode(
  input: Record<string, unknown>,
  type: string,
  server: string,
  port: number,
): CanonicalNode {
  return {
    type,
    name: asString(input.tag) ?? asString(input.name) ?? `${type} ${server}:${port}`,
    server,
    port,
  }
}

/**
 * The single value where a field may arrive as either. Clash keeps HTTP hosts and paths as lists;
 * every client that names exactly one of each reads it back through here.
 */
export function firstOf(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value
}

/**
 * An ALPN list, however the source spelled it: `h3`, `h3,h2`, `["h3","h2"]`, or an array whose one
 * element holds the comma-separated pair. Every client wants the list.
 *
 * Takes the value rather than the node it came off, which is what lets a caller coerce a candidate
 * it has not written down yet — the URI reader had been building a throwaway node just to ask.
 *
 * Not `stringArray`, and deliberately: that one leaves a comma inside an array element alone, which
 * is right for a host list and wrong here, where `["h3,h2"]` names two protocols.
 */
export function alpnList(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  return [value]
    .flat()
    .flatMap((entry) => String(entry).split(","))
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function stringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const result = value.filter((item): item is string => typeof item === "string")
    return result.length > 0 ? result : undefined
  }
  if (typeof value === "string" && value) return value.split(",").map((item) => item.trim())
  return undefined
}

export function integer(value: string | number | null | undefined, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number.parseInt(value ?? "", 10)
  return Number.isInteger(parsed) ? parsed : fallback
}

/**
 * A flag is on unless it says otherwise; `undefined` means the source did not state it at all.
 *
 * The one statement of what counts as "otherwise", for every reader that has to decide it: a URI
 * query, a Surge or Loon parameter, a Clash `udp:`. A second copy of the list is how one input
 * format came to read `off` as a refusal and another as a value it did not recognise.
 */
export function booleanFlag(value: string | null | undefined): boolean | undefined {
  if (value == null) return undefined
  return !["0", "false", "off", "no"].includes(value.toLowerCase())
}
