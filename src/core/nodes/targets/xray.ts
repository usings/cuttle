import type { CanonicalNode } from "../types"
import { asBoolean, asRecord, asString, compactRecord, stringArray } from "../values"
import { defineTarget } from "./define"

const TYPE_FROM_CANONICAL: Record<string, string> = {
  ss: "shadowsocks",
  socks5: "socks",
}

function renderStreamSettings(node: CanonicalNode) {
  const network = asString(node.network) ?? "tcp"
  const method =
    network === "tcp"
      ? "raw"
      : network === "ws"
        ? "websocket"
        : network === "kcp"
          ? "mkcp"
          : network
  const stream: Record<string, unknown> = { method }
  if (network === "ws") {
    const options = asRecord(node["ws-opts"])
    stream.wsSettings = compactRecord({
      path: asString(options?.path),
      headers: asRecord(options?.headers) ?? undefined,
      maxEarlyData: options?.["max-early-data"],
      earlyDataHeaderName: asString(options?.["early-data-header-name"]),
    })
  } else if (network === "grpc") {
    const options = asRecord(node["grpc-opts"])
    stream.grpcSettings = compactRecord({
      serviceName: asString(options?.["grpc-service-name"]),
      multiMode: asBoolean(options?.["multi-mode"]),
      idle_timeout: options?.["idle-timeout"],
      health_check_timeout: options?.["health-check-timeout"],
    })
  } else if (network === "xhttp") {
    stream.xhttpSettings = asRecord(node["xhttp-opts"]) ?? {}
  } else if (network === "httpupgrade") {
    const options = asRecord(node["httpupgrade-opts"])
    stream.httpupgradeSettings = compactRecord({
      host: asString(options?.host),
      path: asString(options?.path),
      headers: asRecord(options?.headers) ?? undefined,
      maxEarlyData: options?.["max-early-data"],
      earlyDataHeaderName: asString(options?.["early-data-header-name"]),
    })
  } else if (network === "kcp") {
    stream.kcpSettings = asRecord(node["kcp-opts"]) ?? {}
  }

  const reality = asRecord(node["reality-opts"])
  if (reality) {
    stream.security = "reality"
    stream.realitySettings = compactRecord({
      serverName: asString(node.sni),
      fingerprint: asString(node["client-fingerprint"]),
      publicKey: asString(reality["public-key"]),
      shortId: asString(reality["short-id"]),
      spiderX: asString(reality["spider-x"]),
    })
  } else if (node.tls) {
    stream.security = "tls"
    stream.tlsSettings = compactRecord({
      serverName: asString(node.sni),
      allowInsecure: asBoolean(node["skip-cert-verify"]),
      alpn: stringArray(node.alpn),
      fingerprint: asString(node["client-fingerprint"]),
    })
  } else {
    stream.security = "none"
  }
  return stream
}

function renderOutbound(node: CanonicalNode) {
  // Xray's Shadowsocks outbound has no plugin at all: writing the node without one would hand the
  // user a proxy that connects plainly where the source obfuscated or wrapped it.
  if (node.type === "ss" && node.plugin) return null
  const protocol = TYPE_FROM_CANONICAL[node.type] ?? node.type
  let settings: Record<string, unknown>
  if (node.type === "vmess") {
    settings = compactRecord({
      address: node.server,
      port: node.port,
      id: asString(node.uuid),
      security: asString(node.cipher) ?? "auto",
    })
  } else if (node.type === "vless") {
    settings = compactRecord({
      address: node.server,
      port: node.port,
      id: asString(node.uuid),
      encryption: asString(node.encryption) ?? "none",
      flow: asString(node.flow),
    })
  } else if (node.type === "ss") {
    settings = compactRecord({
      address: node.server,
      port: node.port,
      method: asString(node.cipher),
      password: asString(node.password),
    })
  } else if (node.type === "trojan") {
    settings = compactRecord({
      address: node.server,
      port: node.port,
      password: asString(node.password),
    })
  } else {
    settings = compactRecord({
      address: node.server,
      port: node.port,
      user: asString(node.username),
      pass: asString(node.password),
    })
  }
  return {
    tag: node.name,
    protocol,
    settings,
    streamSettings: renderStreamSettings(node),
  }
}

export const xrayTarget = defineTarget({
  id: "xray",
  label: "Xray",
  protocols: ["ss", "socks5", "http", "vmess", "vless", "trojan"],
  transports: ["tcp", "ws", "grpc", "xhttp", "httpupgrade", "kcp"],
  // A duplicate tag makes the configuration invalid: Xray keys its routing rules by outbound tag.
  uniqueNames: true,
  contentType: "application/json; charset=utf-8",
  fileExtension: "json",
  renderNode: (node) => renderOutbound(node),
  assemble: (outbounds) => JSON.stringify({ outbounds }, null, 2),
})
