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
import { applyWireGuardAddresses } from "../wireguard"
import type { SourceFormat } from "./types"

const SKIPPED_TYPES = new Set(["direct", "block", "dns", "selector", "urltest", "bridge"])
const TYPE_TO_CANONICAL: Record<string, string> = {
  shadowsocks: "ss",
  socks: "socks5",
}

/**
 * A Shadowsocks outbound's plugin options, in either shape they arrive in: the `;`-delimited string
 * sing-box writes, and the record `mergeShadowTls` folds a Shadow-TLS wrapper back into. Reading only
 * the string drops the host, password and version of every Shadow-TLS proxy in a configuration we
 * wrote ourselves, leaving `shadowTls()` unable to see a plugin at all.
 */
function parsePluginOptions(value: unknown) {
  const record = asRecord(value)
  if (record) return compactRecord(record)
  if (typeof value !== "string" || !value) return
  return Object.fromEntries(
    value.split(";").map((option) => {
      const [key, ...rest] = option.split("=")
      return [key, rest.length > 0 ? rest.join("=") : true]
    }),
  )
}

function parseTransport(node: DraftNode, value: unknown) {
  const transport = asRecord(value)
  const type = asString(transport?.type)
  if (!transport || !type) return
  node.network = type === "websocket" ? "ws" : type
  if (type === "ws" || type === "websocket") {
    const earlyData = extractEarlyData(transport.path, transport.max_early_data)
    node["ws-opts"] = compactRecord({
      "path": earlyData.path,
      "headers": asRecord(transport.headers),
      "max-early-data": earlyData.maxEarlyData,
      "early-data-header-name": asString(transport.early_data_header_name),
    })
  } else if (type === "grpc") {
    node["grpc-opts"] = compactRecord({
      "grpc-service-name": asString(transport.service_name),
      "idle-timeout": asString(transport.idle_timeout),
      "ping-timeout": asString(transport.ping_timeout),
      "permit-without-stream": asBoolean(transport.permit_without_stream),
    })
  } else if (type === "http") {
    node["http-opts"] = compactRecord({
      host: stringArray(transport.host),
      path: asString(transport.path),
      method: asString(transport.method),
      headers: asRecord(transport.headers),
    })
  } else if (type === "httpupgrade") {
    const earlyData = extractEarlyData(transport.path)
    node["httpupgrade-opts"] = compactRecord({
      host: asString(transport.host),
      path: earlyData.path,
      headers: asRecord(transport.headers),
    })
  }
}

function canonicalTls(node: DraftNode, value: unknown) {
  const tls = asRecord(value)
  if (!tls) return
  // `enabled: false` is a statement, and canonicalize only honors statements it can see: its rule for
  // the protocols that imply TLS is `node.tls ?? true`, so leaving `tls` unset hands a
  // trojan/hysteria2/tuic/anytls outbound back with TLS on against a server the source said speaks
  // none. The same statement as a trojan URI's `security=none`, and it has to mean the same thing.
  if (tls.enabled === false) {
    node.tls = false
    return
  }
  node.tls = true
  const serverName = asString(tls.server_name)
  const insecure = asBoolean(tls.insecure)
  const alpn = stringArray(tls.alpn)
  const utls = asRecord(tls.utls)
  const reality = asRecord(tls.reality)
  if (serverName) node.sni = serverName
  if (insecure !== undefined) node["skip-cert-verify"] = insecure
  if (alpn) node.alpn = alpn
  if (asString(utls?.fingerprint)) node["client-fingerprint"] = utls?.fingerprint
  if (reality?.enabled !== false && (reality?.public_key || reality?.short_id)) {
    node["reality-opts"] = compactRecord({
      "public-key": asString(reality.public_key),
      "short-id": asString(reality.short_id),
    })
  }
}

function parseOutbound(input: Record<string, unknown>): DraftNode | null {
  const sourceType = asString(input.type)
  if (!sourceType) return null
  // A WireGuard endpoint keeps the far side in `peers`, and addresses it rather than itself: that peer
  // is the server we connect to. The legacy outbound spelled the same fields out at the root.
  const peer = sourceType === "wireguard" ? (asRecord(asArray(input.peers)[0]) ?? {}) : {}
  const server = asString(input.server ?? peer.address)
  const port = asPort(input.server_port ?? peer.port)
  if (!server || !port) return null
  const type = TYPE_TO_CANONICAL[sourceType] ?? sourceType
  const node = canonicalNode(input, type, server, port)

  if (type === "ss") {
    node.cipher = asString(input.method)
    node.password = asString(input.password)
    node.plugin = asString(input.plugin)
    node["plugin-opts"] = parsePluginOptions(input.plugin_opts ?? input.plugin_options)
  } else if (type === "socks5" || type === "http") {
    node.username = asString(input.username)
    node.password = asString(input.password)
  } else if (type === "vmess") {
    node.uuid = asString(input.uuid)
    node.cipher = asString(input.security) ?? "auto"
    node.alterId = input.alter_id
    node["packet-encoding"] = asString(input.packet_encoding)
  } else if (type === "vless") {
    node.uuid = asString(input.uuid)
    node.flow = asString(input.flow)
    node["packet-encoding"] = asString(input.packet_encoding)
  } else if (["trojan", "hysteria2", "tuic", "anytls"].includes(type)) {
    node.password = asString(input.password)
  } else if (type === "hysteria") {
    node["auth-str"] = asString(input.auth_str)
    node.obfs = asString(input.obfs)
    node.up = input.up ?? input.up_mbps
    node.down = input.down ?? input.down_mbps
  } else if (type === "ssh") {
    node.username = asString(input.user)
    node.password = asString(input.password)
    node["private-key"] = asString(input.private_key)
  } else if (type === "wireguard") {
    node["private-key"] = asString(input.private_key)
    node["public-key"] = asString(input.peer_public_key ?? peer.public_key)
    node["pre-shared-key"] = asString(input.pre_shared_key ?? peer.pre_shared_key)
    node.reserved = Array.isArray(input.reserved ?? peer.reserved)
      ? ((input.reserved ?? peer.reserved) as unknown[])
      : undefined
    node.mtu = input.mtu
    if (Array.isArray(peer.allowed_ips)) node["allowed-ips"] = peer.allowed_ips.join(",")
    applyWireGuardAddresses(node, input.local_address ?? input.address)
  }

  if (type === "hysteria2") {
    const obfs = asRecord(input.obfs)
    node.obfs = asString(obfs?.type)
    node["obfs-password"] = asString(obfs?.password)
    node.up = input.up_mbps
    node.down = input.down_mbps
  } else if (type === "tuic") {
    node.uuid = asString(input.uuid)
    node["congestion-controller"] = asString(input.congestion_control)
    node["udp-relay-mode"] = asString(input.udp_relay_mode)
    node["zero-rtt"] = asBoolean(input.zero_rtt_handshake)
  }

  canonicalTls(node, input.tls)
  parseTransport(node, input.transport)
  return node
}

/** Folds the Shadow-TLS outbound a proxy detours through back into the proxy itself. */
function mergeShadowTls(
  input: Record<string, unknown> | null | undefined,
  wrappers: Map<string, Record<string, unknown>>,
) {
  const detour = asString(input?.detour)
  const wrapper = detour === undefined ? undefined : wrappers.get(detour)
  if (!input || !wrapper) return input
  return {
    ...input,
    server: input.server ?? wrapper.server,
    server_port: input.server_port ?? wrapper.server_port,
    detour: undefined,
    plugin: "shadow-tls",
    plugin_opts: {
      host: asString(asRecord(wrapper.tls)?.server_name),
      password: asString(wrapper.password),
      version: wrapper.version,
    },
  }
}

function detect(value: unknown) {
  const root = asRecord(value)
  return [...asArray(root?.outbounds), ...asArray(root?.endpoints)].some((item) =>
    Boolean(asString(asRecord(item)?.type)),
  )
}

function parseConfig(value: unknown) {
  const diagnostics: Diagnostic[] = []
  const root = asRecord(value)
  // Endpoints sit beside outbounds since 1.11 and hold the WireGuard interfaces; reading only
  // outbounds would drop every one of them, including the ones we write ourselves.
  const outbounds = [...asArray(root?.outbounds), ...asArray(root?.endpoints)]
  // A Shadow-TLS outbound is half a node, not a proxy anybody can dial on its own.
  const wrappers = new Map<string, Record<string, unknown>>()
  for (const item of outbounds) {
    const input = asRecord(item)
    const tag = asString(input?.tag)
    if (input && tag && asString(input.type) === "shadowtls") wrappers.set(tag, input)
  }
  const drafts = outbounds.flatMap((item, index) => {
    const input = mergeShadowTls(asRecord(item), wrappers)
    const type = asString(input?.type)
    if (type === "shadowtls" || (type && SKIPPED_TYPES.has(type))) return []
    const node = input ? parseOutbound(input) : null
    if (node) return [{ value: node, index }]
    diagnostics.push({
      level: "warning",
      stage: "parse",
      code: "invalid-sing-box-outbound",
      message: `sing-box outbound #${index + 1} is unsupported or missing server/server_port; skipped.`,
    })
    return []
  })
  return { drafts, diagnostics }
}

/**
 * A sing-box configuration, read.
 *
 * The writing half lives in `targets/sing-box.ts`, the same split every other bidirectional format
 * here has. What the two halves share — the canonical type aliases — is `pipeline/canonicalize.ts`'s.
 */
export const singBoxFormat: SourceFormat = {
  id: "sing-box",
  parse: (source) => {
    const value = source.document()
    if (!detect(value)) return null
    const { drafts, diagnostics } = parseConfig(value)
    return { format: "sing-box", drafts, diagnostics }
  },
}
