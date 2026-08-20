import type { CanonicalNode } from "./types"

/**
 * The stream a proxy runs over, and the one field of the handshake that is read off it.
 *
 * Narrow on purpose. This module had grown to hold WireGuard's interface addresses, TUIC's version
 * rule and an ALPN coercion as well — three subjects that answer nothing about a transport, and that
 * arrived because the boundary was never written down. They are now `wireguard.ts`, `protocols.ts`
 * and `values.ts`'s. What belongs here is what a WebSocket or HTTPUpgrade transport carries in its
 * path, which every reader has to take apart and every writer has to put back.
 *
 * `effectiveSni` stays despite being a TLS question, because it is one answered out of the transport
 * options: the server name a node presents falls back to the transport `Host`, so the rule cannot be
 * stated without reading `ws-opts` and `httpupgrade-opts`.
 */

function safeEarlyData(value: unknown) {
  if (value == null || value === "") return
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined
}

/**
 * A transport path carries a query and a fragment of its own, and `ed` rides in that query. Both
 * functions below have to take one apart and put it back together, so the taking apart is written
 * once: two copies is how the reader and the writer came to disagree about where a fragment goes.
 */
function splitPath(value: string) {
  const hashIndex = value.indexOf("#")
  const fragment = hashIndex === -1 ? "" : value.slice(hashIndex)
  const withoutFragment = hashIndex === -1 ? value : value.slice(0, hashIndex)
  const queryIndex = withoutFragment.indexOf("?")
  return {
    pathname: queryIndex === -1 ? withoutFragment : withoutFragment.slice(0, queryIndex),
    params: new URLSearchParams(queryIndex === -1 ? "" : withoutFragment.slice(queryIndex + 1)),
    fragment,
  }
}

function joinPath({ fragment, params, pathname }: ReturnType<typeof splitPath>) {
  const query = params.toString()
  return `${pathname || "/"}${query ? `?${query}` : ""}${fragment}`
}

export function extractEarlyData(pathValue: unknown, explicitValue?: unknown) {
  const split = splitPath(typeof pathValue === "string" && pathValue ? pathValue : "/")
  const maxEarlyData = safeEarlyData(explicitValue) ?? safeEarlyData(split.params.get("ed"))
  split.params.delete("ed")
  return { path: joinPath(split), maxEarlyData }
}

export function pathWithEarlyData(pathValue: unknown, maxEarlyData: unknown) {
  const extracted = extractEarlyData(pathValue)
  const parsed = safeEarlyData(maxEarlyData)
  if (parsed == null) return extracted.path
  const split = splitPath(extracted.path)
  split.params.set("ed", String(parsed))
  return joinPath(split)
}

/**
 * The TLS server name a node will actually present. A source that names no SNI but routes through a
 * CDN host still has one: every client falls back to the transport `Host`, so leaving it unstated
 * leaves each client guessing, and the ones that guess the address fail the handshake.
 */
export function effectiveSni(node: CanonicalNode) {
  if (!node.tls) return
  const explicit = node.sni ?? node.servername
  if (typeof explicit === "string" && explicit) return explicit
  const options =
    (node["ws-opts"] as Record<string, unknown> | undefined) ??
    (node["httpupgrade-opts"] as Record<string, unknown> | undefined)
  const headers = (options?.headers ?? {}) as Record<string, unknown>
  const host = options?.host ?? headers.Host ?? headers.host
  if (typeof host !== "string" || !host) return
  // An address is not a server name: RFC 6066 has no room for IP literals in SNI, and servers that
  // enforce it drop the handshake rather than ignore the field.
  if (/^[\d.]+$/.test(host) || host.includes(":")) return
  return host
}
