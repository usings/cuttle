import { pluginBeyondObfs, shadowsocksPlugin, shadowTls } from "../plugins"
import type { CanonicalNode } from "../types"
import { alpnList, asRecord } from "../values"
import { wireGuardAddresses } from "../wireguard"
import { defineTarget } from "./define"
import {
  credentialsFit,
  parameters,
  policyName,
  quoted,
  streamOptions,
  value,
} from "./shared/node-line"

function loonTlsParameters(node: CanonicalNode) {
  const reality = asRecord(node["reality-opts"])
  return parameters([
    ["over-tls", node.tls],
    // A Reality node states its server name as `sni`; everything else on Loon uses `tls-name`.
    [reality ? "sni" : "tls-name", node.sni],
    ["skip-cert-verify", node.tls ? node["skip-cert-verify"] === true : null],
    // A Loon line is comma-separated, so a multi-value ALPN has to travel quoted.
    ["alpn", node.tls && node.alpn !== undefined ? quoted(alpnList(node.alpn)?.join(",")) : null],
    // Loon takes Reality as two parameters beside the TLS ones; the fingerprint it calls a profile.
    ["tls-profile", node["client-fingerprint"]],
    ["public-key", reality ? quoted(reality["public-key"]) : null],
    ["short-id", reality ? reality["short-id"] : null],
  ])
}

function loonNode(node: CanonicalNode) {
  // Loon quotes its credentials, which leaves it room for a comma but none for a quote.
  if (!credentialsFit(node, /"/)) return null
  const network = value(node.network || "tcp")
  const stream = streamOptions(node, network)
  let parts: Array<string | number>
  switch (node.type) {
    case "ss": {
      if (network !== "tcp" || pluginBeyondObfs(node)) return null
      const wrapper = shadowTls(node)
      if (wrapper && wrapper.version < 2) return null
      const plugin = shadowsocksPlugin(node)
      parts = ["shadowsocks", node.server, node.port, value(node.cipher), quoted(node.password)]
      // Loon names the obfs itself rather than the plugin that provides it.
      if (plugin?.type === "obfs") {
        parts.push(
          ...parameters([
            ["obfs-name", plugin.mode],
            ["obfs-host", plugin.host],
          ]),
        )
      }
      parts.push(
        ...parameters([
          ["shadow-tls-password", wrapper?.password],
          ["shadow-tls-sni", wrapper?.host],
          ["shadow-tls-version", wrapper?.version],
        ]),
      )
      break
    }
    case "ssr":
      if (network !== "tcp") return null
      // Loon names the SSR parameters rather than taking them as a positional tail in braces.
      parts = [
        "shadowsocksr",
        node.server,
        node.port,
        value(node.cipher),
        quoted(node.password),
        ...parameters([
          ["protocol", node.protocol],
          ["protocol-param", node["protocol-param"]],
          ["obfs", node.obfs],
          ["obfs-param", node["obfs-param"]],
        ]),
      ]
      break
    case "vmess":
      if (!["tcp", "ws", "http"].includes(network)) return null
      parts = [
        "vmess",
        node.server,
        node.port,
        value(node.cipher ?? "auto"),
        quoted(node.uuid),
        ...parameters([
          ["alterId", Number(node.alterId ?? 0)],
          ["transport", network],
          ["path", stream.path],
          ["host", stream.host],
        ]),
        ...loonTlsParameters(node),
      ]
      break
    case "trojan":
      // Trojan is the one Loon reads over WebSocket but not over HTTP.
      if (!["tcp", "ws"].includes(network)) return null
      parts = [
        "trojan",
        node.server,
        node.port,
        quoted(node.password),
        ...parameters([
          ["transport", network],
          ["path", stream.path],
          ["host", stream.host],
        ]),
        ...loonTlsParameters(node),
      ]
      break
    case "vless":
      if (!["tcp", "ws", "http"].includes(network)) return null
      parts = [
        "vless",
        node.server,
        node.port,
        quoted(node.uuid),
        ...parameters([
          ["transport", network],
          ["path", stream.path],
          ["host", stream.host],
          ["flow", node.flow],
        ]),
        ...loonTlsParameters(node),
      ]
      break
    case "hysteria2":
      parts = [
        // The one name Loon capitalises.
        "Hysteria2",
        node.server,
        node.port,
        quoted(node.password),
        ...parameters([
          ["tls-name", node.sni],
          ["skip-cert-verify", node["skip-cert-verify"]],
          ["obfs", node.obfs],
          ["obfs-password", node["obfs-password"]],
        ]),
      ]
      break
    case "anytls":
      parts = ["anytls", node.server, node.port, quoted(node.password), ...loonTlsParameters(node)]
      break
    case "http":
      if (network !== "tcp") return null
      parts = [
        node.tls ? "https" : "http",
        node.server,
        node.port,
        value(node.username),
        quoted(node.password),
      ]
      break
    case "socks5":
      parts = ["socks5", node.server, node.port, value(node.username), quoted(node.password)]
      break
    case "wireguard": {
      // Loon does not take a server and port up front: the endpoint belongs to a peer, and the peer
      // list is a literal on the line. A private key where a protocol argument goes makes the whole
      // line unreadable to the client.
      const addresses = wireGuardAddresses(node)
      const peer = [
        `public-key=${quoted(node["public-key"])}`,
        // A peer that states its own routes keeps them; the catch-all is only a fallback.
        `allowed-ips=${quoted(node["allowed-ips"] ?? node.allowed_ips ?? "0.0.0.0/0,::/0")}`,
        node["pre-shared-key"] ? `pre-shared-key=${quoted(node["pre-shared-key"])}` : undefined,
        `endpoint=${node.server}:${node.port}`,
      ].filter(Boolean)
      parts = [
        "wireguard",
        ...parameters([
          // Only an interface with a single address states it here; several go unstated rather than
          // silently narrowed to one.
          ["interface-ip", addresses.length === 1 ? addresses[0].split("/")[0] : undefined],
          ["private-key", quoted(node["private-key"])],
          ["mtu", node.mtu],
        ]),
        `peers=[{${peer.join(",")}}]`,
      ]
      break
    }
    default:
      return null
  }
  // Loon states UDP only when it is on, and never for the two shapes that have no such parameter.
  const udp =
    node.udp === true && !["http", "wireguard"].includes(String(node.type))
      ? parameters([["udp", true]])
      : []
  return `${policyName(node)} = ${[...parts, ...udp].join(", ")}`
}

export const loonTarget = defineTarget({
  id: "loon",
  label: "Loon",
  protocols: [
    "ss",
    "ssr",
    "vmess",
    "vless",
    "trojan",
    "hysteria2",
    "anytls",
    "http",
    "socks5",
    "wireguard",
  ],
  // Loon's `transport=` takes tcp, ws or http; there is no gRPC line to write.
  transports: ["tcp", "ws", "http"],
  uniqueNames: true,
  renderedName: policyName,
  contentType: "text/plain; charset=utf-8",
  fileExtension: "conf",
  renderNode: loonNode,
  assemble: (lines) => lines.join("\n"),
})
