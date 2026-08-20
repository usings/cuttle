import { stringify } from "yaml"
import { pluginBeyondObfs, shadowsocksPlugin, shadowTls } from "../plugins"
import { snellVersion, tuicIsV5 } from "../protocols"
import type { CanonicalNode } from "../types"
import { asRecord, compactRecord, firstOf } from "../values"
import { defineTarget } from "./define"
import { EGERN_CIPHERS, cipherOf } from "./shared/ciphers"

function reality(node: CanonicalNode) {
  const options = asRecord(node["reality-opts"])
  if (!options) return
  return compactRecord({ public_key: options["public-key"], short_id: options["short-id"] })
}

function transport(node: CanonicalNode) {
  const network = String(node.network ?? "tcp")
  if (network === "ws") {
    const options = asRecord(node["ws-opts"])
    const headers = asRecord(options?.headers)
    const host = headers?.Host ?? headers?.host
    return {
      [node.tls ? "wss" : "ws"]: compactRecord({
        path: options?.path,
        headers: host === undefined ? undefined : { Host: host },
        sni: node.tls ? node.sni : undefined,
        reality: reality(node),
        skip_tls_verify: node.tls ? node["skip-cert-verify"] : undefined,
      }),
    }
  }
  if (network === "http" || network === "h2") {
    // Egern spells the two HTTP transports by version, and gives only HTTP/2 a server name.
    const options = asRecord(node[`${network}-opts`])
    const headers = asRecord(options?.headers)
    const host = firstOf(options?.host ?? headers?.Host ?? headers?.host)
    return {
      [network === "http" ? "http1" : "http2"]: compactRecord({
        method: options?.method,
        path: firstOf(options?.path),
        headers: host === undefined ? undefined : { Host: host },
        sni: network === "h2" ? node.sni : undefined,
        skip_tls_verify: node["skip-cert-verify"],
      }),
    }
  }
  if (network === "grpc") {
    const options = asRecord(node["grpc-opts"])
    return {
      grpc: compactRecord({
        service_name: options?.["grpc-service-name"],
        sni: node.sni,
        reality: reality(node),
        skip_tls_verify: node["skip-cert-verify"],
      }),
    }
  }
  if (node.tls) {
    return {
      tls: compactRecord({
        sni: node.sni,
        reality: reality(node),
        skip_tls_verify: node["skip-cert-verify"],
      }),
    }
  }
}

/**
 * Egern keys each proxy by its protocol — `- {shadowsocks: {…}}` — rather than carrying a `type`
 * field the way Clash does. A flat object with `type` inside is not a proxy Egern can read at all.
 */
function wrap(kind: string, fields: Record<string, unknown>) {
  return { [kind]: compactRecord(fields) }
}

/** Egern's gRPC is the plain `gun` stream; a multiplexed one is a connection it cannot make. */
function multiplexedGrpc(node: CanonicalNode) {
  if (String(node.network ?? "tcp") !== "grpc") return false
  const mode = asRecord(node["grpc-opts"])?.mode
  return mode !== undefined && String(mode).toLowerCase() !== "gun"
}

function egernNode(node: CanonicalNode) {
  if (multiplexedGrpc(node)) return null
  const common = { name: node.name, server: node.server, port: node.port }
  if (node.type === "ss") {
    // Only simple-obfs maps onto Egern's `obfs`; another plugin describes a connection Egern cannot
    // make, and writing the node without it would misrepresent that connection.
    if (pluginBeyondObfs(node)) return null
    // Egern takes only version 3 of the Shadow-TLS handshake.
    const wrapper = shadowTls(node)
    if (wrapper && wrapper.version !== 3) return null
    const plugin = shadowsocksPlugin(node)
    const obfs = plugin?.type === "obfs" ? plugin : undefined
    return wrap("shadowsocks", {
      ...common,
      method: node.cipher === "chacha20-ietf-poly1305" ? "chacha20-poly1305" : node.cipher,
      password: node.password,
      udp_relay: node.udp,
      tfo: node.tfo ?? node["fast-open"],
      obfs: obfs?.mode,
      obfs_host: obfs?.host,
      obfs_uri: obfs?.path,
      shadow_tls: wrapper && compactRecord({ password: wrapper.password, sni: wrapper.host }),
    })
  }
  if (node.type === "vmess") {
    return wrap("vmess", {
      ...common,
      user_id: node.uuid,
      security: node.cipher ?? "auto",
      legacy: Number(node.alterId ?? 0) > 0,
      udp_relay: node.udp,
      transport: transport(node),
    })
  }
  if (node.type === "vless") {
    return wrap("vless", {
      ...common,
      user_id: node.uuid,
      flow: node.flow,
      udp_relay: node.udp,
      transport: transport(node),
    })
  }
  if (node.type === "trojan") {
    // Trojan is always TLS to Egern: the SNI sits on the proxy itself and a WebSocket is its own
    // `websocket` block, not the `transport` wrapper VMess and VLESS have. An Egern trojan proxy has
    // no `transport` key at all, so gRPC and the rest belong to VMess and VLESS alone.
    const network = String(node.network ?? "tcp")
    if (!["tcp", "ws"].includes(network)) return null
    const options = asRecord(node["ws-opts"])
    const headers = asRecord(options?.headers)
    return wrap("trojan", {
      ...common,
      password: node.password,
      udp_relay: node.udp,
      sni: node.sni,
      skip_tls_verify: node["skip-cert-verify"],
      websocket:
        network === "ws"
          ? compactRecord({ path: options?.path, host: headers?.Host ?? headers?.host })
          : undefined,
    })
  }
  if (["hysteria2", "tuic", "anytls"].includes(node.type)) {
    return wrap(node.type, {
      ...common,
      auth: node.type === "hysteria2" ? node.password : undefined,
      uuid: node.type === "tuic" ? node.uuid : undefined,
      password: node.type === "hysteria2" ? undefined : node.password,
      sni: node.sni,
      // A single ALPN arrives as a bare string; Egern always wants the list form.
      alpn: node.alpn === undefined ? undefined : [node.alpn].flat(),
      skip_tls_verify: node["skip-cert-verify"],
      // TUIC is UDP by nature to Egern; only Hysteria2 carries the switch.
      udp_relay: node.type === "tuic" ? undefined : node.udp,
    })
  }
  if (node.type === "ssh") {
    return wrap("ssh", {
      ...common,
      username: node.username,
      password: node.password,
      private_key: node["private-key"],
      tfo: node.tfo ?? node["fast-open"],
    })
  }
  if (node.type === "snell") {
    // Snell states its obfuscation flat here, and only version 3 and later have a UDP switch.
    const obfs = asRecord(node["obfs-opts"])
    return wrap("snell", {
      ...common,
      psk: node.psk ?? node.password,
      version: node.version,
      udp_relay: snellVersion(node) >= 3 ? node.udp : undefined,
      reuse: node.reuse,
      obfs: obfs?.mode ?? node.obfs,
      obfs_host: obfs?.host ?? node["obfs-host"],
      tfo: node.tfo ?? node["fast-open"],
    })
  }
  if (node.type === "http" || node.type === "socks5") {
    return wrap(node.type === "http" && node.tls ? "https" : node.type, {
      ...common,
      username: node.username,
      password: node.password,
      udp_relay: node.type === "socks5" ? node.udp : undefined,
      sni: node.tls ? node.sni : undefined,
      skip_tls_verify: node.tls ? node["skip-cert-verify"] : undefined,
    })
  }
  return null
}

export const egernTarget = defineTarget({
  id: "egern",
  label: "Egern",
  protocols: [
    "ss",
    "vmess",
    "vless",
    "trojan",
    "hysteria2",
    "tuic",
    "anytls",
    "http",
    "socks5",
    "snell",
    "ssh",
  ],
  transports: ["tcp", "ws", "http", "h2", "grpc"],
  accepts: (node) =>
    (node.type !== "ss" || EGERN_CIPHERS.has(cipherOf(node))) &&
    (node.type !== "snell" || snellVersion(node) <= 5) &&
    // Egern's TUIC is the v5 one, keyed by uuid and password. A v4 node has neither, and writing its
    // token as the uuid hands Egern a node it dials with the wrong credential.
    (node.type !== "tuic" || tuicIsV5(node)),
  uniqueNames: true,
  contentType: "text/yaml; charset=utf-8",
  fileExtension: "yaml",
  renderNode: (node) => egernNode(node),
  assemble: (proxies) => stringify({ proxies }, { lineWidth: 0 }),
})
