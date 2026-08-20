import { stringify } from "yaml"
import { snellVersion } from "../protocols"
import type { CanonicalNode } from "../types"
import { defineTarget } from "./define"
import { CLASH_CIPHERS, cipherOf } from "./shared/ciphers"
import {
  CLASH_VMESS_CIPHERS,
  dropGrpcMode,
  dropUnsupportedSwitches,
  moveServerName,
  normalizePlugin,
  normalizeVmess,
} from "./shared/clash-family"
import { publicNode } from "./shared/public-node"

/**
 * Clash classic predates Reality, packet encoding and the fingerprint field entirely, and carries
 * neither the QUIC-era protocols nor WireGuard nor HTTPUpgrade. What it needs from a node is only what
 * the protocols and transports below can produce — which is why it calls the fewest of the shared
 * Clash-family rules, and why the three fields it never learned are deleted outright at the end.
 *
 * Clash reads `servername` for VMess alone; mihomo and Stash extended it to VLESS.
 */
function normalizeClash(node: CanonicalNode) {
  const output = publicNode(node)
  normalizeVmess(output, CLASH_VMESS_CIPHERS)
  moveServerName(output, ["vmess"])
  normalizePlugin(output)
  dropUnsupportedSwitches(output)
  dropGrpcMode(output)
  delete output["client-fingerprint"]
  delete output["reality-opts"]
  delete output["packet-encoding"]
  return output
}

export const clashTarget = defineTarget({
  id: "clash",
  label: "Clash Classic",
  protocols: ["ss", "ssr", "vmess", "trojan", "http", "socks5", "snell"],
  transports: ["tcp", "ws", "http", "h2", "grpc"],
  notes: "Clash Classic does not support VLESS, Hysteria, TUIC, WireGuard or AnyTLS.",
  accepts: (node) =>
    (node.type !== "ss" || CLASH_CIPHERS.has(cipherOf(node))) &&
    (node.type !== "snell" || snellVersion(node) < 4),
  uniqueNames: true,
  contentType: "text/yaml; charset=utf-8",
  fileExtension: "yaml",
  renderNode: (node) => normalizeClash(node),
  assemble: (proxies) => stringify({ proxies }, { lineWidth: 0 }),
})
