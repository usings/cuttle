import { stringify } from "yaml"
import { snellVersion } from "../protocols"
import type { CanonicalNode } from "../types"
import { alpnList } from "../values"
import { defineTarget } from "./define"
import {
  dropGrpcMode,
  dropUnsupportedSwitches,
  httpUpgradeAsWebSocket,
  moveServerName,
  normalizePlugin,
  normalizeTuic,
  normalizeVmess,
  normalizeWireGuardAddresses,
} from "./shared/clash-family"
import { publicNode } from "./shared/public-node"

function normalizeStash(node: CanonicalNode) {
  const output = publicNode(node)
  // Stash enumerates no VMess cipher, so one it would have accepted is kept as it came.
  normalizeVmess(output)
  if (output.type === "vless" && output.network === "xhttp" && !output["xhttp-opts"]) {
    output["xhttp-opts"] = {}
  }
  moveServerName(output, ["vmess", "vless"])
  normalizePlugin(output)
  dropUnsupportedSwitches(output)
  if (output.type === "hysteria") {
    if (output.alpn !== undefined) output.alpn = alpnList(output.alpn)
    // Stash is the one client that spells Hysteria 1's two bandwidth fields with a `-speed` suffix.
    output["up-speed"] = output["up-speed"] ?? output.up
    output["down-speed"] = output["down-speed"] ?? output.down
    delete output.up
    delete output.down
  }
  if (output.type === "hysteria2") {
    delete output.username
    // Stash calls the Hysteria2 secret `auth` where the other clients call it `password`.
    output.auth = output.auth ?? output.password
    delete output.password
  }
  normalizeTuic(output)
  normalizeWireGuardAddresses(output, "drop-prefix")
  httpUpgradeAsWebSocket(output)
  dropGrpcMode(output)
  return output
}

export const stashTarget = defineTarget({
  id: "stash",
  label: "Stash",
  protocols: [
    "ss",
    "ssr",
    "vmess",
    "vless",
    "trojan",
    "http",
    "socks5",
    "hysteria",
    "hysteria2",
    "tuic",
    "wireguard",
    "snell",
    "anytls",
    "mieru",
    "ssh",
  ],
  transports: "all",
  accepts: (node) => node.type !== "snell" || snellVersion(node) < 4,
  uniqueNames: true,
  contentType: "text/yaml; charset=utf-8",
  fileExtension: "yaml",
  renderNode: (node) => normalizeStash(node),
  assemble: (proxies) => stringify({ proxies }, { lineWidth: 0 }),
})
