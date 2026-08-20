import { extractEarlyData } from "../transport"
import type { Diagnostic, DraftNode } from "../types"
import {
  asArray,
  asBoolean,
  asPort,
  asRecord,
  asString,
  canonicalNode,
  compactRecord,
  stringArray,
} from "../values"
import type { SourceFormat } from "./types"

const SKIPPED_PROTOCOLS = new Set(["freedom", "blackhole", "dns", "loopback"])
const TYPE_TO_CANONICAL: Record<string, string> = {
  shadowsocks: "ss",
  socks: "socks5",
}

function applyStreamSettings(node: DraftNode, value: unknown) {
  const stream = asRecord(value)
  if (!stream) return
  const sourceMethod = asString(stream.method) ?? asString(stream.network) ?? "raw"
  const network =
    sourceMethod === "raw" || sourceMethod === "tcp"
      ? "tcp"
      : sourceMethod === "websocket"
        ? "ws"
        : sourceMethod === "mkcp"
          ? "kcp"
          : sourceMethod
  node.network = network

  if (network === "ws") {
    const options = asRecord(stream.wsSettings)
    const earlyData = extractEarlyData(options?.path, options?.maxEarlyData)
    node["ws-opts"] = compactRecord({
      "path": earlyData.path,
      "headers": asRecord(options?.headers) ?? undefined,
      "max-early-data": earlyData.maxEarlyData,
      "early-data-header-name": asString(options?.earlyDataHeaderName),
    })
  } else if (network === "grpc") {
    const options = asRecord(stream.grpcSettings)
    node["grpc-opts"] = compactRecord({
      "grpc-service-name": asString(options?.serviceName),
      "multi-mode": asBoolean(options?.multiMode),
      "idle-timeout": options?.idle_timeout,
      "health-check-timeout": options?.health_check_timeout,
    })
  } else if (network === "xhttp") {
    node["xhttp-opts"] = asRecord(stream.xhttpSettings) ?? {}
  } else if (network === "httpupgrade") {
    const options = asRecord(stream.httpupgradeSettings)
    const earlyData = extractEarlyData(options?.path, options?.maxEarlyData)
    node["httpupgrade-opts"] = compactRecord({
      "host": asString(options?.host),
      "path": earlyData.path,
      "headers": asRecord(options?.headers) ?? undefined,
      "max-early-data": earlyData.maxEarlyData,
      "early-data-header-name": asString(options?.earlyDataHeaderName),
    })
  } else if (network === "kcp") {
    node["kcp-opts"] = asRecord(stream.kcpSettings) ?? {}
  }

  const security = asString(stream.security)
  if (security === "tls") {
    const tls = asRecord(stream.tlsSettings)
    node.tls = true
    node.sni = asString(tls?.serverName)
    node["skip-cert-verify"] = asBoolean(tls?.allowInsecure)
    node.alpn = stringArray(tls?.alpn)
    node["client-fingerprint"] = asString(tls?.fingerprint)
  } else if (security === "reality") {
    const reality = asRecord(stream.realitySettings)
    node.tls = true
    node.sni = asString(reality?.serverName)
    node["client-fingerprint"] = asString(reality?.fingerprint)
    node["reality-opts"] = compactRecord({
      "public-key": asString(reality?.publicKey),
      "short-id": asString(reality?.shortId),
      "spider-x": asString(reality?.spiderX),
    })
  }
}

function currentSettings(input: Record<string, unknown>) {
  const settings = asRecord(input.settings)
  const server = asString(settings?.address)
  const port = asPort(settings?.port)
  return server && port ? [{ server, port, user: settings as Record<string, unknown> }] : []
}

function legacySettings(input: Record<string, unknown>, protocol: string) {
  const settings = asRecord(input.settings)
  if (!settings) return []
  if (protocol === "vmess" || protocol === "vless") {
    return asArray(settings.vnext).flatMap((entry) => {
      const endpoint = asRecord(entry)
      const server = asString(endpoint?.address)
      const port = asPort(endpoint?.port)
      if (!server || !port) return []
      const users = asArray(endpoint?.users)
      return (users.length > 0 ? users : [{}]).flatMap((user) => {
        const record = asRecord(user)
        return record ? [{ server, port, user: record }] : []
      })
    })
  }
  return asArray(settings.servers).flatMap((entry) => {
    const endpoint = asRecord(entry)
    const server = asString(endpoint?.address)
    const port = asPort(endpoint?.port)
    if (!endpoint || !server || !port) return []
    const users = asArray(endpoint.users)
    return users.length > 0
      ? users.flatMap((user) => {
          const record = asRecord(user)
          return record ? [{ server, port, user: { ...endpoint, ...record } }] : []
        })
      : [{ server, port, user: endpoint }]
  })
}

function parseOutbound(input: Record<string, unknown>): DraftNode[] {
  // Not the skip list restated: `parseXrayOutbounds` applies it, because an outbound skipped there is
  // one nobody dials rather than one this parser failed to read — the difference is the diagnostic.
  const protocol = asString(input.protocol)
  if (!protocol) return []
  const type = TYPE_TO_CANONICAL[protocol] ?? protocol
  const endpoints = [...currentSettings(input), ...legacySettings(input, protocol)]
  return endpoints.map(({ server, port, user }, index) => {
    const node = canonicalNode(input, type, server, port)
    if (endpoints.length > 1) node.name = `${node.name} ${index + 1}`
    if (type === "vmess") {
      node.uuid = asString(user.id)
      node.cipher = asString(user.security) ?? "auto"
      node.alterId = user.alterId
    } else if (type === "vless") {
      node.uuid = asString(user.id)
      node.flow = asString(user.flow)
      node.encryption = asString(user.encryption) ?? "none"
    } else if (type === "ss") {
      node.cipher = asString(user.method)
      node.password = asString(user.password)
    } else if (type === "trojan") {
      node.password = asString(user.password)
    } else if (type === "socks5" || type === "http") {
      node.username = asString(user.user)
      node.password = asString(user.pass)
    }
    applyStreamSettings(node, input.streamSettings)
    return node
  })
}

function detect(value: unknown) {
  const root = asRecord(value)
  return asArray(root?.outbounds).some((item) => Boolean(asString(asRecord(item)?.protocol)))
}

/**
 * Parses an Xray `outbounds` list into canonical nodes. Exported so `formats/v2ray.ts` can reuse it
 * verbatim: Xray forked V2Ray and kept the outbound shape.
 */
export function parseXrayOutbounds(value: unknown) {
  const diagnostics: Diagnostic[] = []
  const outbounds = asArray(asRecord(value)?.outbounds)
  const drafts = outbounds.flatMap((item, index) => {
    const input = asRecord(item)
    const protocol = asString(input?.protocol)
    if (protocol && SKIPPED_PROTOCOLS.has(protocol)) return []
    const parsed = input ? parseOutbound(input) : []
    if (parsed.length > 0) return parsed.map((node) => ({ value: node, index }))
    diagnostics.push({
      level: "warning",
      stage: "parse",
      code: "invalid-xray-outbound",
      message: `Xray outbound #${index + 1} is unsupported or missing connection parameters; skipped.`,
    })
    return []
  })
  return { drafts, diagnostics }
}

/**
 * An Xray configuration, read.
 *
 * The writing half lives in `targets/xray.ts`, the same split every other bidirectional format in
 * this module already has.
 */
export const xrayFormat: SourceFormat = {
  id: "xray",
  parse: (source) => {
    const value = source.document()
    if (!detect(value)) return null
    const { drafts, diagnostics } = parseXrayOutbounds(value)
    return { format: "xray", drafts, diagnostics }
  },
}
