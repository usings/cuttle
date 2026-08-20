import { shadowsocksPlugin } from "../plugins"
import type { CanonicalNode } from "../types"
import { asRecord } from "../values"
import { defineTarget } from "./define"
import {
  credentialsFit,
  endpoint,
  parameters,
  policyName,
  streamOptions,
  value,
} from "./shared/node-line"

function commonQuantumultXParameters(node: CanonicalNode) {
  const reality = asRecord(node["reality-opts"])
  const network = value(node.network || "tcp")
  const stream = streamOptions(node, network)
  const obfs =
    network === "ws"
      ? node.tls
        ? "wss"
        : "ws"
      : network === "http"
        ? "http"
        : node.tls && ["ss", "vmess", "vless"].includes(node.type)
          ? "over-tls"
          : null
  const overTls = node.tls && !obfs && ["trojan", "anytls", "http", "socks5"].includes(node.type)
  return parameters([
    ["obfs", obfs],
    // `obfs-host` belongs to a WebSocket obfuscation; on `over-tls` the server name is `tls-host`.
    ["obfs-host", network === "ws" ? (stream.host ?? node.sni) : (stream.host ?? null)],
    ["obfs-uri", stream.path],
    ["over-tls", overTls ? true : null],
    ["tls-host", node.tls ? node.sni : null],
    ["tls-verification", node.tls ? !node["skip-cert-verify"] : null],
    ["reality-base64-pubkey", reality?.["public-key"]],
    ["reality-hex-shortid", reality?.["short-id"]],
    ["udp-relay", node.udp ?? false],
  ])
}

function quantumultXNode(node: CanonicalNode) {
  const network = value(node.network || "tcp")
  if (!["tcp", "ws", "http"].includes(network)) return null
  if (!credentialsFit(node, /,/)) return null
  const base = `${endpoint(node)}`
  const common = commonQuantumultXParameters(node)
  let protocol: string
  let specific: string[]

  switch (node.type) {
    case "ss": {
      // Quantumult X takes simple-obfs, and v2ray-plugin only in its WebSocket mode, which it folds
      // into its own obfs vocabulary: `ws`, or `wss` over TLS. A plugin outside those two has no
      // spelling here, and writing its host alone would describe a connection that does not exist.
      const plugin = shadowsocksPlugin(node)
      const obfs =
        plugin?.type === "obfs"
          ? plugin.mode
          : plugin?.mode === "websocket"
            ? plugin.tls
              ? "wss"
              : "ws"
            : undefined
      if (plugin && obfs === undefined) return null
      protocol = "shadowsocks"
      specific = parameters([
        ["method", node.cipher],
        ["password", node.password],
        ["obfs", obfs],
        ["obfs-host", plugin?.host],
        ["obfs-uri", plugin?.path],
      ])
      break
    }
    case "ssr":
      protocol = "shadowsocks"
      specific = parameters([
        ["method", node.cipher],
        ["password", node.password],
        ["ssr-protocol", node.protocol],
        ["ssr-protocol-param", node["protocol-param"]],
        ["obfs", node.obfs],
        ["obfs-host", node["obfs-param"]],
      ])
      break
    case "vmess":
      protocol = "vmess"
      specific = parameters([
        // Quantumult X wants a named cipher; `auto` is a Clash-ism it does not resolve.
        ["method", !node.cipher || node.cipher === "auto" ? "chacha20-poly1305" : node.cipher],
        ["password", node.uuid],
        ["aead", Number(node.alterId ?? 0) === 0],
      ])
      break
    case "vless":
      protocol = "vless"
      specific = parameters([
        ["method", "none"],
        ["password", node.uuid],
        ["vless-flow", node.flow],
      ])
      break
    case "trojan":
      protocol = "trojan"
      specific = parameters([["password", node.password]])
      break
    case "anytls":
      protocol = "anytls"
      specific = parameters([["password", node.password]])
      break
    case "http":
    case "socks5":
      protocol = node.type
      specific = parameters([
        ["username", node.username],
        ["password", node.password],
      ])
      break
    default:
      return null
  }
  return `${protocol}=${[base, ...specific, ...common, `tag=${policyName(node)}`].join(", ")}`
}

export const quantumultXTarget = defineTarget({
  id: "quantumult-x",
  label: "Quantumult X",
  protocols: ["ss", "ssr", "vmess", "vless", "trojan", "anytls", "http", "socks5"],
  transports: ["tcp", "ws", "http"],
  uniqueNames: true,
  renderedName: policyName,
  contentType: "text/plain; charset=utf-8",
  fileExtension: "conf",
  renderNode: quantumultXNode,
  assemble: (lines) => lines.join("\n"),
})
