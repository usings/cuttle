import type { TargetCapability } from "../pipeline/capability"
import { pluginBeyondObfs, shadowTls } from "../plugins"
import { tuicIsV5 } from "../protocols"
import type { CanonicalNode } from "../types"
import { alpnList, asRecord } from "../values"
import { defineTarget } from "./define"
import { SURGE_CIPHERS, cipherOf } from "./shared/ciphers"
import {
  credentialsFit,
  headerList,
  obfsOf,
  parameters,
  policyName,
  value,
  wrapped,
  wsOptions,
} from "./shared/node-line"

function commonSurgeParameters(node: CanonicalNode) {
  // A Surge line ends a parameter at the comma and has no quoting for this one, so the list arrives
  // already split on commas: an entry holding a comma would close the ALPN and have everything after
  // it read as a parameter of its own.
  const alpn = alpnList(node.alpn)?.join(";")
  return parameters([
    ["sni", node.sni],
    ["skip-cert-verify", node.tls ? Boolean(node["skip-cert-verify"]) : null],
    ["alpn", alpn],
    // Surge states the UDP switch either way, except on the protocols that are UDP by nature.
    ["udp-relay", ["hysteria2", "tuic"].includes(String(node.type)) ? null : (node.udp ?? false)],
  ])
}

/**
 * Surge and Surfboard share a line format, but not every parameter in it: Shadow-TLS is Surge's.
 * A Surfboard node carrying it has to be refused rather than written without the wrapper.
 */
function surgeNode(node: CanonicalNode, target: "surfboard" | "surge" = "surge") {
  if (asRecord(node["reality-opts"])) return null
  // Surge reads a value up to the next comma; the credentials it writes are quoted, which is what
  // lets a password hold a space or a quote of its own.
  if (!credentialsFit(node, /,/)) return null
  const network = value(node.network || "tcp")
  if (network !== "tcp" && !(network === "ws" && ["vmess", "trojan"].includes(node.type))) {
    return null
  }
  const ws = wsOptions(node)
  let protocol: string
  let specific: string[]
  switch (node.type) {
    case "ss": {
      // Surge's obfuscation slot is simple-obfs, spelled `obfs=http|tls`; Shadow-TLS is beside it.
      if (pluginBeyondObfs(node)) return null
      const wrapper = target === "surge" ? shadowTls(node) : undefined
      if (target === "surfboard" && shadowTls(node)) return null
      // Version 1 was withdrawn and no client speaks it.
      if (wrapper && wrapper.version < 2) return null
      // Shadow-TLS keeps a host of its own; reading it as an obfs host would describe a third,
      // non-existent connection.
      const obfs = obfsOf(node)
      protocol = "ss"
      specific = parameters([
        ["encrypt-method", node.cipher],
        ["password", wrapped(node.password)],
        ["obfs", obfs?.mode],
        ["obfs-host", obfs?.host],
        ["obfs-uri", obfs?.path],
        ["shadow-tls-password", wrapper && wrapped(wrapper.password)],
        ["shadow-tls-sni", wrapper?.host],
        ["shadow-tls-version", wrapper?.version],
      ])
      break
    }
    case "vmess":
      protocol = "vmess"
      specific = parameters([
        ["username", node.uuid],
        ["encrypt-method", node.cipher === "auto" ? undefined : node.cipher],
        ["vmess-aead", Number(node.alterId ?? 0) === 0],
        ["tls", node.tls],
        ["ws", network === "ws"],
        ["ws-path", ws.path],
        ["ws-headers", headerList(ws.headers)],
      ])
      break
    case "trojan":
      protocol = "trojan"
      specific = parameters([
        ["password", wrapped(node.password)],
        // Surge asks Trojan to say it is TLS, unlike the protocols where it assumes so.
        ["tls", node.tls === false ? null : true],
        ["ws", network === "ws"],
        ["ws-path", ws.path],
        ["ws-headers", headerList(ws.headers)],
      ])
      break
    case "tuic": {
      // Surge names the version in the protocol, and `tuicIsV5` is the one rule that tells them apart.
      // ALPN is already part of the shared Surge parameters; repeating it here would emit it twice.
      const v5 = tuicIsV5(node)
      protocol = v5 ? "tuic-v5" : "tuic"
      specific = v5
        ? parameters([
            ["uuid", node.uuid],
            ["password", node.password],
          ])
        : parameters([["token", node.token ?? node.uuid]])
      break
    }
    case "hysteria2":
      protocol = "hysteria2"
      specific = parameters([
        ["password", node.password],
        ["download-bandwidth", node.down],
        [node.obfs === "gecko" ? "gecko-password" : "salamander-password", node["obfs-password"]],
      ])
      break
    case "anytls":
      protocol = "anytls"
      specific = parameters([["password", node.password]])
      break
    case "http":
      protocol = node.tls ? "https" : "http"
      specific = parameters([
        ["username", node.username],
        ["password", node.password],
      ])
      break
    case "socks5":
      protocol = node.tls ? "socks5-tls" : "socks5"
      specific = parameters([
        ["username", node.username],
        ["password", node.password],
      ])
      break
    case "snell": {
      // Snell's obfuscation arrives either as `obfs-opts` from YAML or as flat fields from a line.
      const obfs = asRecord(node["obfs-opts"])
      protocol = "snell"
      specific = parameters([
        ["psk", wrapped(node.psk ?? node.password)],
        ["version", node.version],
        ["obfs", obfs?.mode ?? node.obfs],
        ["obfs-host", obfs?.host ?? node["obfs-host"]],
      ])
      break
    }
    case "ssh":
      protocol = "ssh"
      specific = parameters([
        ["username", node.username],
        ["password", node.password],
        ["private-key", node["private-key"]],
        ["server-fingerprint", node["server-fingerprint"]],
      ])
      break
    default:
      return null
  }
  return `${policyName(node)} = ${[protocol, node.server, node.port, ...specific, ...commonSurgeParameters(node)].join(", ")}`
}

export { surgeNode }

/** Surge for iOS and Surge for macOS read the same node line and refuse the same nodes. */
export const SURGE_CAPABILITY: TargetCapability = {
  protocols: [
    "ss",
    "vmess",
    "trojan",
    "tuic",
    "hysteria2",
    "anytls",
    "http",
    "socks5",
    "snell",
    "ssh",
  ],
  transports: ["tcp", "ws"],
  accepts: (node) => node.type !== "ss" || SURGE_CIPHERS.has(cipherOf(node)),
}

export const surgeTarget = defineTarget({
  id: "surge",
  label: "Surge",
  ...SURGE_CAPABILITY,
  uniqueNames: true,
  renderedName: policyName,
  contentType: "text/plain; charset=utf-8",
  fileExtension: "conf",
  renderNode: (node) => surgeNode(node),
  assemble: (lines) => lines.join("\n"),
})
