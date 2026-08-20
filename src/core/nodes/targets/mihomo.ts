import { stringify } from "yaml"
import type { CanonicalNode } from "../types"
import { alpnList } from "../values"
import { defineTarget } from "./define"
import {
  CLASH_VMESS_CIPHERS,
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

function normalizeMihomo(node: CanonicalNode) {
  const output = publicNode(node)
  normalizeVmess(output, CLASH_VMESS_CIPHERS)
  moveServerName(output, ["vmess", "vless"])
  normalizePlugin(output)
  dropUnsupportedSwitches(output)
  if (output.type === "hysteria" && output.alpn !== undefined) output.alpn = alpnList(output.alpn)
  if (output.type === "hysteria2") delete output.username
  normalizeTuic(output)
  normalizeWireGuardAddresses(output, "keep-prefix")
  httpUpgradeAsWebSocket(output)
  dropGrpcMode(output)
  return output
}

/** The reference YAML client: it carries everything the canonical model can express. */
export const mihomoTarget = defineTarget({
  id: "mihomo",
  label: "Mihomo",
  protocols: "all",
  transports: "all",
  uniqueNames: true,
  contentType: "text/yaml; charset=utf-8",
  fileExtension: "yaml",
  renderNode: (node) => normalizeMihomo(node),
  assemble: (proxies) => stringify({ proxies }, { lineWidth: 0 }),
})
