import { shadowsocksPlugin } from "../../plugins"
import type { CanonicalNode } from "../../types"
import { asRecord, firstOf } from "../../values"
import { TargetValidationError } from "../validation"

/**
 * The kit every line-format client is written with. A node line is positional and separator
 * delimited, so most of this is about getting a value onto one safely: checking it, quoting it the
 * way that client quotes, and refusing it when the separator itself is inside it.
 */

function singleLine(input: unknown) {
  const text = input === undefined || input === null ? "" : String(input)
  // oxlint-disable-next-line no-control-regex -- Reject controls instead of rewriting credentials.
  if (/[\u0000-\u001f\u007f]/.test(text)) {
    throw new TargetValidationError("A field contains a control character.")
  }
  return text
}

/** A raw positional or parameter value cannot introduce another comma-separated field. */
export function value(input: unknown) {
  const text = singleLine(input)
  if (text.includes(",")) {
    throw new TargetValidationError("An unquoted field contains a comma.")
  }
  return text
}

/** Only a format-aware quoting function can authorize separators inside a value. */
export class QuotedValue {
  constructor(private readonly text: string) {}

  toString() {
    return this.text
  }
}

/** `host:port`, with an IPv6 literal bracketed. Also what `uri-node.ts` writes an authority with. */
export function endpoint(node: CanonicalNode) {
  return `${node.server.includes(":") ? `[${node.server}]` : node.server}:${node.port}`
}

export function parameter(name: string, input: unknown) {
  if (input === undefined || input === null || input === "") return null
  return `${name}=${input instanceof QuotedValue ? input.toString() : value(input)}`
}

export function parameters(entries: Array<[string, unknown]>) {
  return entries.flatMap(([name, input]) => {
    const output = parameter(name, input)
    return output ? [output] : []
  })
}

export function wsOptions(node: CanonicalNode) {
  const options = asRecord(node["ws-opts"])
  const headers = asRecord(options?.headers)
  return {
    path: options?.path,
    host: headers?.Host ?? headers?.host,
    headers,
  }
}

/** The simple-obfs part of a node's plugin, which is the only part an obfs field may come from. */
export function obfsOf(node: CanonicalNode) {
  const plugin = shadowsocksPlugin(node)
  return plugin?.type === "obfs" ? plugin : undefined
}

/** The path and host of whichever transport the node uses, wherever that client keeps them. */
export function streamOptions(node: CanonicalNode, network: string) {
  if (network === "ws") {
    const ws = wsOptions(node)
    return { path: ws.path, host: ws.host }
  }
  if (network === "http") {
    const options = asRecord(node["http-opts"])
    const headers = asRecord(options?.headers)
    return { path: firstOf(options?.path), host: firstOf(headers?.Host ?? headers?.host) }
  }
  return { path: undefined, host: undefined }
}

export function headerList(input: Record<string, unknown> | null) {
  if (!input) return
  const output = Object.entries(input)
    .map(([key, item]) => {
      if (/[:|]/.test(key) || String(item).includes("|")) {
        throw new TargetValidationError("A WebSocket header contains a header-list separator.")
      }
      return `${value(key)}:${value(item)}`
    })
    .join("|")
  return output || undefined
}

export function quoted(input: unknown) {
  return new QuotedValue(`"${singleLine(input).replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`)
}

/**
 * Surge strips one surrounding quote pair and reads what is between it literally — it has no escape
 * sequence, so a quote inside the value has to travel as itself.
 */
export function wrapped(input: unknown) {
  return new QuotedValue(`"${value(input)}"`)
}

/**
 * The fields a node line writes verbatim. A line format has no escape for its own separator, so a
 * credential holding one cannot be written: Surge and Quantumult X read a value as "everything up to
 * the next comma", Loon as "everything up to the next quote". Writing it anyway produces a line the
 * client mis-reads — a truncated password, or the following parameters swallowed into it.
 */
const CREDENTIALS = ["password", "psk", "username", "uuid", "token", "private-key", "obfs-password"]

export function credentialsFit(node: CanonicalNode, forbidden: RegExp) {
  return CREDENTIALS.every((key) => !forbidden.test(String(node[key] ?? "")))
}

export function policyName(node: CanonicalNode) {
  return (
    String(node.name)
      // oxlint-disable-next-line no-control-regex -- Policy names cannot introduce line separators.
      .replaceAll(/[\u0000-\u001f\u007f=,]/g, " ")
      .trim() || `${node.type}-${node.port}`
  )
}
