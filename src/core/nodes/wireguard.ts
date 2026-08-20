import type { CanonicalNode, DraftNode } from "./types"

/**
 * A WireGuard interface's own addresses, read and written.
 *
 * Its own module rather than a corner of `transport.ts`, which is where this lived: a WireGuard node
 * has no transport in this model at all — `dropUnsupportedSwitches` deletes `network` for every
 * protocol outside VMess, VLESS and Trojan — so nothing here answers a question about a stream.
 *
 * What it is instead is one shape read four ways. A source states the interface address as `address`,
 * as `ip` plus `ipv6`, as a comma-separated list, as a repeated URI parameter, or with a prefix
 * length attached; a client then wants it back as exactly one of those. The canonical node keeps the
 * halves apart — `ip`, `ipv6`, `ip-cidr`, `ipv6-cidr` — and both directions are stated here so a
 * renderer never has to reassemble them itself.
 */

function addressValues(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap((item) => addressValues(item))
  if (typeof value !== "string") return []
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseAddress(value: string) {
  const match = /^(.*?)(?:\/(\d+))?$/.exec(value)
  const host = (match?.[1] ?? value).replaceAll(/^\[|]$/g, "")
  const ipv6 = host.includes(":")
  const max = ipv6 ? 128 : 32
  const cidr = match?.[2] == null ? undefined : Number(match[2])
  if (!ipv6) {
    const parts = host.split(".").map(Number)
    if (
      parts.length !== 4 ||
      parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
    ) {
      return null
    }
  }
  if (cidr != null && (!Number.isInteger(cidr) || cidr < 0 || cidr > max)) return null
  return { host, cidr, ipv6 }
}

/**
 * Takes a `DraftNode` rather than a `CanonicalNode`: a parser calls this before Parse Validation has
 * had a say, on an entry that may still be missing the fields that make it a node. Every field read
 * or written here lives on both shapes through the index signature alone.
 */
export function applyWireGuardAddresses(node: DraftNode, value: unknown) {
  const candidates = [
    ...addressValues(value),
    ...addressValues(node.ip),
    ...addressValues(node.ipv6),
  ]
  for (const candidate of candidates) {
    const parsed = parseAddress(candidate)
    if (!parsed) continue
    if (parsed.ipv6) {
      if (typeof node.ipv6 !== "string" || node.ipv6.includes("/")) node.ipv6 = parsed.host
      if (parsed.cidr != null) node["ipv6-cidr"] = parsed.cidr
    } else {
      if (typeof node.ip !== "string" || node.ip.includes("/")) node.ip = parsed.host
      if (parsed.cidr != null) node["ip-cidr"] = parsed.cidr
    }
  }
  return node
}

export function wireGuardAddresses(node: CanonicalNode) {
  const normalized = { ...node }
  applyWireGuardAddresses(normalized, normalized.address)
  const output: string[] = []
  if (typeof normalized.ip === "string" && normalized.ip) {
    output.push(
      `${normalized.ip}/${Number.isInteger(normalized["ip-cidr"]) ? normalized["ip-cidr"] : 32}`,
    )
  }
  if (typeof normalized.ipv6 === "string" && normalized.ipv6) {
    output.push(
      `${normalized.ipv6}/${Number.isInteger(normalized["ipv6-cidr"]) ? normalized["ipv6-cidr"] : 128}`,
    )
  }
  return output
}
