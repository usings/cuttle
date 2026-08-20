import { encodeBase64 } from "../../base64"
import { uriPlugin } from "../../plugins"
import { pathWithEarlyData } from "../../transport"
import type { CanonicalNode } from "../../types"
import { alpnList, asRecord } from "../../values"
import { wireGuardAddresses } from "../../wireguard"
import { endpoint } from "./node-line"

/**
 * The protocols `renderUriNode` has a spelling for, and what every target that serves a URI list
 * declares. One list rather than three: it is a claim about the switch below, so a protocol added
 * there and forgotten here is one no URI target will carry.
 *
 * None of those targets sets `uniqueNames`: a URI carries its own name in its fragment and clients
 * read the list as given, so nothing is renumbered.
 */
export const URI_PROTOCOLS = [
  "ss",
  "ssr",
  "vmess",
  "vless",
  "trojan",
  "hysteria",
  "hysteria2",
  "tuic",
  "wireguard",
  "anytls",
  "http",
  "socks5",
] as const

function queryString(entries: Array<[string, unknown]>) {
  const params = new URLSearchParams()
  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item))
    } else if (value !== undefined && value !== null && value !== "") {
      params.set(key, typeof value === "object" ? JSON.stringify(value) : String(value))
    }
  }
  const query = params.toString()
  return query ? `?${query}` : ""
}

export function renderUriNode(node: CanonicalNode) {
  const name = `#${encodeURIComponent(node.name)}`
  switch (node.type) {
    case "ss": {
      // A 2022 cipher's key is already base64; SIP002 carries that pair in plain userinfo, and a
      // client that base64s it a second time reads back a key that decodes to nothing.
      const credentials = String(node.cipher).startsWith("2022-blake3-")
        ? `${encodeURIComponent(String(node.cipher))}:${encodeURIComponent(String(node.password ?? ""))}`
        : encodeBase64(`${node.cipher}:${node.password}`)
      return `ss://${credentials}@${endpoint(node)}${queryString([["plugin", uriPlugin(node)]])}${name}`
    }
    case "ssr": {
      const password = encodeBase64(String(node.password ?? ""), true)
      const query = queryString([
        ["remarks", encodeBase64(node.name, true)],
        [
          "protoparam",
          node["protocol-param"] ? encodeBase64(String(node["protocol-param"]), true) : null,
        ],
        ["obfsparam", node["obfs-param"] ? encodeBase64(String(node["obfs-param"]), true) : null],
      ])
      return `ssr://${encodeBase64(`${endpoint(node)}:${node.protocol}:${node.cipher}:${node.obfs}:${password}/${query}`, true)}`
    }
    case "vmess": {
      const ws = asRecord(node["ws-opts"])
      const headers = asRecord(ws?.headers)
      const network = String(node.network ?? "tcp")
      // A VMess URI has one `path` and one `host` for every transport: gRPC puts its service name
      // there, HTTP/2 its path. Reading only the WebSocket ones drops the other transports.
      const grpc = asRecord(node["grpc-opts"])
      const options = asRecord(node[`${network}-opts`])
      const transportHeaders = asRecord(options?.headers) ?? headers
      const transportHost =
        transportHeaders?.Host ?? transportHeaders?.host ?? options?.host ?? headers?.Host
      const transportPath =
        network === "ws"
          ? pathWithEarlyData(ws?.path, ws?.["max-early-data"])
          : network === "grpc"
            ? grpc?.["grpc-service-name"]
            : options?.path
      return `vmess://${encodeBase64(
        JSON.stringify({
          v: "2",
          ps: node.name,
          add: node.server,
          port: String(node.port),
          id: node.uuid,
          aid: String(node.alterId ?? 0),
          scy: node.cipher ?? "auto",
          net: network === "http" ? "tcp" : network,
          type:
            network === "http" ? "http" : network === "grpc" ? (grpc?.mode ?? "gun") : undefined,
          host: Array.isArray(transportHost) ? transportHost[0] : transportHost,
          path: Array.isArray(transportPath) ? transportPath[0] : transportPath,
          eh: ws?.["early-data-header-name"],
          tls: node.tls ? "tls" : "",
          sni: node.sni,
          fp: node["client-fingerprint"],
        }),
      )}`
    }
    case "vless":
    case "trojan": {
      const ws = asRecord(node["ws-opts"])
      const headers = asRecord(ws?.headers)
      const grpc = asRecord(node["grpc-opts"])
      const reality = asRecord(node["reality-opts"])
      const options = asRecord(node[`${String(node.network)}-opts`])
      const query = queryString([
        // Trojan is TLS by definition, so `security=tls` says nothing a reader did not know.
        [
          "security",
          reality ? "reality" : node.type === "trojan" ? undefined : node.tls ? "tls" : "none",
        ],
        // VLESS states its encryption; it travels through rather than being assumed.
        ["encryption", node.type === "vless" ? node.encryption : undefined],
        ["type", node.network ?? "tcp"],
        ["sni", node.sni],
        ["fp", node["client-fingerprint"]],
        ["alpn", alpnList(node.alpn)?.join(",")],
        // Certificate checking is part of how the node connects; a URI that omits it turns a
        // deliberately relaxed node back into a strict one.
        ["allowInsecure", node["skip-cert-verify"] ? 1 : undefined],
        ["flow", node.flow],
        ["host", headers?.Host ?? headers?.host ?? options?.host],
        [
          "path",
          ["ws", "httpupgrade"].includes(String(node.network))
            ? pathWithEarlyData(
                ws?.path ?? options?.path,
                ws?.["max-early-data"] ?? options?.["max-early-data"],
              )
            : (ws?.path ?? options?.path),
        ],
        ["eh", ws?.["early-data-header-name"] ?? options?.["early-data-header-name"]],
        ["serviceName", grpc?.["grpc-service-name"]],
        // gRPC carries its multiplexing mode; `gun` is the plain one, and only a default.
        ["mode", options?.mode ?? grpc?.mode ?? (node.network === "grpc" ? "gun" : undefined)],
        ["extra", options?.extra],
        ["pbk", reality?.["public-key"]],
        ["sid", reality?.["short-id"]],
        ["spx", reality?.["spider-x"]],
      ])
      const credential = node.type === "vless" ? node.uuid : node.password
      return `${node.type}://${encodeURIComponent(String(credential ?? ""))}@${endpoint(node)}${query}${name}`
    }
    case "hysteria":
      // Hysteria 1 authenticates through `auth=`, not through the user position of the URI.
      return `hysteria://${endpoint(node)}${queryString([
        ["protocol", node.protocol],
        ["auth", node["auth-str"]],
        ["peer", node.sni],
        ["insecure", node["skip-cert-verify"] ? 1 : undefined],
        ["upmbps", node.up],
        ["downmbps", node.down],
        ["alpn", alpnList(node.alpn)?.join(",")],
        ["obfs", node.obfs],
        ["udp", node.udp],
      ])}${name}`
    case "hysteria2": {
      return `hysteria2://${encodeURIComponent(String(node.password ?? ""))}@${endpoint(node)}${queryString(
        [
          ["sni", node.sni],
          ["insecure", node["skip-cert-verify"] ? 1 : undefined],
          ["obfs", node.obfs],
          ["obfs-password", node["obfs-password"]],
        ],
      )}${name}`
    }
    case "tuic":
      // A v4 node's single token sits where a v5 one carries its uuid, the only place a TUIC URI has
      // for it. A node that arrived already spelled the v4 way — from a client config rather than a
      // URI — would otherwise be written with no credential at all.
      return `tuic://${encodeURIComponent(String(node.uuid ?? node.token ?? ""))}:${encodeURIComponent(String(node.password ?? ""))}@${endpoint(node)}${queryString(
        [
          ["sni", node.sni],
          // A TUIC URI spells these with underscores; the node may carry either spelling.
          ["congestion_control", node["congestion-controller"] ?? node.congestion_control],
          ["alpn", alpnList(node.alpn)?.join(",")],
          ["udp_relay_mode", node["udp-relay-mode"] ?? node.udp_relay_mode],
          ["udp", node.udp],
          ["allow_insecure", node["skip-cert-verify"]],
        ],
      )}${name}`
    case "wireguard": {
      const addresses = wireGuardAddresses(node)
      return `wireguard://${encodeURIComponent(String(node["private-key"] ?? ""))}@${endpoint(node)}${queryString(
        [
          ["publickey", node["public-key"]],
          ["presharedkey", node["pre-shared-key"]],
          ["address", addresses.length > 0 ? addresses.join(",") : node.address],
          ["reserved", node.reserved],
          ["mtu", node.mtu],
          // A WireGuard tunnel is UDP; the URI says so with a flag rather than a boolean.
          ["udp", node.udp ? 1 : undefined],
        ],
      )}${name}`
    }
    case "socks5": {
      // The convention every client reads is `socks://` with the credentials base64 in the user
      // position, not a plain `user:pass` pair.
      const credentials = node.username
        ? `${encodeBase64(`${String(node.username)}:${String(node.password ?? "")}`)}@`
        : ""
      return `socks://${credentials}${endpoint(node)}${name}`
    }
    case "http": {
      const scheme = node.tls ? "https" : "http"
      const auth = node.username
        ? `${encodeURIComponent(String(node.username))}:${encodeURIComponent(String(node.password ?? ""))}@`
        : ""
      return `${scheme}://${auth}${endpoint(node)}${name}`
    }
    case "anytls":
      return `anytls://${encodeURIComponent(String(node.password ?? ""))}@${endpoint(node)}${queryString(
        [
          ["sni", node.sni],
          ["insecure", node["skip-cert-verify"] ? 1 : undefined],
        ],
      )}${name}`
    default:
      return null
  }
}
