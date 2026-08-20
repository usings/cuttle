import { tuicIsV5 } from "../protocols"
import type { CanonicalNode } from "../types"
import { defineTarget } from "./define"
import { SURFBOARD_CIPHERS, cipherOf } from "./shared/ciphers"
import { parameters, policyName, value } from "./shared/node-line"
import { surgeNode } from "./surge"

function surfboardNode(node: CanonicalNode) {
  // Surfboard reads the credentials of a plain proxy as positional arguments; Surge names them.
  if ((node.type === "socks5" || node.type === "http") && value(node.network || "tcp") === "tcp") {
    const protocol =
      node.type === "socks5" ? (node.tls ? "socks5-tls" : "socks5") : node.tls ? "https" : "http"
    const credentials = [node.username, node.password].filter(Boolean).map((item) => value(item))
    return `${policyName(node)} = ${[
      protocol,
      node.server,
      node.port,
      ...credentials,
      ...parameters([["udp-relay", node.udp]]),
    ].join(", ")}`
  }
  const shared = surgeNode(node, "surfboard")
  // Surfboard has the switch on every protocol, including the ones Surge treats as UDP by nature.
  if (shared && ["hysteria2", "tuic"].includes(String(node.type)) && node.udp !== undefined) {
    return `${shared}, udp-relay=${String(node.udp)}`
  }
  return shared
}

export const surfboardTarget = defineTarget({
  id: "surfboard",
  label: "Surfboard",
  protocols: ["ss", "vmess", "trojan", "tuic", "hysteria2", "anytls", "http", "socks5", "snell"],
  transports: ["tcp", "ws"],
  accepts: (node) =>
    (node.type !== "ss" || SURFBOARD_CIPHERS.has(cipherOf(node))) &&
    // Surfboard's [Proxy] list names TUIC v5 and no earlier version, so a v4 node has no line here —
    // unlike Surge, which takes it as `tuic` with a token.
    (node.type !== "tuic" || tuicIsV5(node)),
  uniqueNames: true,
  renderedName: policyName,
  contentType: "text/plain; charset=utf-8",
  fileExtension: "conf",
  renderNode: surfboardNode,
  assemble: (lines) => lines.join("\n"),
})
