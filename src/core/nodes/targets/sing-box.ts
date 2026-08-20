import { shadowTls, singBoxPlugin } from "../plugins"
import { tuicIsV5 } from "../protocols"
import type { CanonicalNode } from "../types"
import {
  asBoolean,
  asMegabits,
  asRecord,
  asString,
  compactRecord,
  firstOf,
  stringArray,
} from "../values"
import { wireGuardAddresses } from "../wireguard"
import { defineTarget } from "./define"

const TYPE_FROM_CANONICAL: Record<string, string> = {
  ss: "shadowsocks",
  socks5: "socks",
}

function renderPluginOptions(value: unknown) {
  const options = asRecord(value)
  if (!options) return
  return Object.entries(options)
    .map(([key, item]) => (item === true ? key : `${key}=${String(item)}`))
    .join(";")
}

function omitHost(headers: Record<string, unknown>) {
  const rest = Object.fromEntries(
    Object.entries(headers).filter(([key]) => key.toLowerCase() !== "host"),
  )
  return Object.keys(rest).length > 0 ? rest : undefined
}

function renderTransport(node: CanonicalNode) {
  const network = asString(node.network)
  if (!network || network === "tcp") return
  if (network === "ws" || network === "websocket") {
    const options = asRecord(node["ws-opts"])
    return compactRecord({
      type: "ws",
      path: asString(options?.path),
      headers: asRecord(options?.headers),
      max_early_data: options?.["max-early-data"],
      early_data_header_name: asString(options?.["early-data-header-name"]),
    })
  }
  if (network === "grpc") {
    const options = asRecord(node["grpc-opts"])
    return compactRecord({
      type: "grpc",
      service_name: asString(options?.["grpc-service-name"]),
      idle_timeout: asString(options?.["idle-timeout"]),
      ping_timeout: asString(options?.["ping-timeout"]),
      permit_without_stream: asBoolean(options?.["permit-without-stream"]),
    })
  }
  // sing-box has one HTTP transport for both `http` and `h2`; TLS is what separates them, and it is
  // stated on the outbound rather than on the transport.
  if (network === "http" || network === "h2") {
    const options = asRecord(node[`${network}-opts`])
    const headers = asRecord(options?.headers)
    const host = options?.host ?? headers?.Host ?? headers?.host
    return compactRecord({
      type: "http",
      // The host belongs in `host`; leaving it in `headers` makes sing-box send no Host at all.
      host: stringArray(host),
      path: asString(firstOf(options?.path)),
      method: asString(options?.method),
      headers: headers && omitHost(headers),
    })
  }
  if (network === "httpupgrade") {
    const options = asRecord(node["httpupgrade-opts"])
    return compactRecord({
      type: "httpupgrade",
      host: asString(options?.host),
      path: asString(options?.path),
      headers: asRecord(options?.headers),
    })
  }
  if (network === "quic") return { type: "quic" }
}

function renderSingBoxTls(node: CanonicalNode): Record<string, unknown> | undefined {
  const reality = asRecord(node["reality-opts"])
  if (!node.tls && !reality) return undefined
  const fingerprint = asString(node["client-fingerprint"])
  return compactRecord({
    enabled: true,
    server_name: asString(node.sni),
    insecure: asBoolean(node["skip-cert-verify"]),
    alpn: stringArray(node.alpn),
    utls: fingerprint ? { enabled: true, fingerprint } : undefined,
    reality: reality
      ? compactRecord({
          enabled: true,
          public_key: asString(reality["public-key"]),
          short_id: asString(reality["short-id"]),
        })
      : undefined,
  })
}

function renderOutbound(node: CanonicalNode) {
  // sing-box runs the plugin binary by name, so one it has no mapping for would fail the whole
  // config, not just this node. Shadow-TLS is not a plugin here at all: it is its own outbound.
  if (node.type === "ss" && node.plugin && !singBoxPlugin(node) && !shadowTls(node)) return null
  // sing-box implements TUIC v5 and nothing earlier: the outbound authenticates with a uuid and a
  // password, which a v4 node has neither of. Writing its token as the uuid produces an outbound that
  // dials with the wrong credential rather than one that fails to load.
  if (node.type === "tuic" && !tuicIsV5(node)) return null
  const type = TYPE_FROM_CANONICAL[node.type] ?? node.type
  const base: Record<string, unknown> = {
    type,
    tag: node.name,
    server: node.server,
    server_port: node.port,
  }
  if (node.type === "ss") {
    // A Shadow-TLS node dials through its own outbound, which holds the address and the handshake.
    const wrapper = shadowTls(node)
    if (wrapper) {
      delete base.server
      delete base.server_port
      base.detour = shadowTlsTag(node)
    }
    Object.assign(base, {
      method: asString(node.cipher),
      password: asString(node.password),
      plugin: wrapper ? undefined : (singBoxPlugin(node)?.name ?? asString(node.plugin)),
      // sing-box calls this `plugin_opts`; `plugin_options` is silently ignored by the client.
      plugin_opts: wrapper
        ? undefined
        : (singBoxPlugin(node)?.options ?? renderPluginOptions(node["plugin-opts"])),
    })
  } else if (node.type === "socks5" || node.type === "http") {
    Object.assign(base, {
      username: asString(node.username),
      password: asString(node.password),
      // sing-box asks a SOCKS outbound which dialect to speak.
      ...(node.type === "socks5" ? { version: "5" } : {}),
    })
  } else if (node.type === "vmess") {
    Object.assign(base, {
      uuid: asString(node.uuid),
      security: asString(node.cipher) ?? "auto",
      alter_id: node.alterId,
      packet_encoding: asString(node["packet-encoding"]),
    })
  } else if (node.type === "vless") {
    Object.assign(base, {
      uuid: asString(node.uuid),
      flow: asString(node.flow),
      packet_encoding: asString(node["packet-encoding"]),
    })
  } else if (["trojan", "hysteria2", "tuic", "anytls"].includes(node.type)) {
    base.password = asString(node.password)
  } else if (node.type === "hysteria") {
    Object.assign(base, {
      auth_str: asString(node["auth-str"] ?? node.password),
      obfs: asString(node.obfs),
      // sing-box takes Hysteria's bandwidth as megabits, as a number — the same coercion for both
      // versions, because a source states a link speed the same way whichever one it is describing.
      up_mbps: asMegabits(node.up),
      down_mbps: asMegabits(node.down),
    })
  } else if (node.type === "ssh") {
    Object.assign(base, {
      // sing-box names the account `user`, where every other client calls it a username.
      user: asString(node.username),
      password: asString(node.password),
      private_key: asString(node["private-key"]),
    })
  } else if (node.type === "wireguard") {
    Object.assign(base, {
      private_key: asString(node["private-key"]),
      peer_public_key: asString(node["public-key"]),
      pre_shared_key: asString(node["pre-shared-key"]),
      local_address: wireGuardAddresses(node),
      reserved: node.reserved,
      mtu: node.mtu,
    })
  }
  if (node.type === "hysteria2") {
    base.obfs = node.obfs
      ? compactRecord({ type: asString(node.obfs), password: asString(node["obfs-password"]) })
      : undefined
    base.up_mbps = asMegabits(node.up)
    base.down_mbps = asMegabits(node.down)
  } else if (node.type === "tuic") {
    Object.assign(base, {
      uuid: asString(node.uuid),
      // A TUIC URI spells these with underscores and Clash with dashes; both reach us unchanged.
      congestion_control: asString(node["congestion-controller"] ?? node.congestion_control),
      udp_relay_mode: asString(node["udp-relay-mode"] ?? node.udp_relay_mode),
      zero_rtt_handshake: asBoolean(node["zero-rtt"]),
    })
  }

  // `network: tcp` is how sing-box says "TCP only", and it is an option of the individual outbound —
  // three of the ones written here do not have it: HTTP, SSH and AnyTLS. sing-box refuses a whole
  // configuration containing a field it does not know (`FATAL decode config: json: unknown field
  // "network"`) rather than ignoring it, so saying "TCP only" about one of those three costs the
  // document rather than the node.
  //
  // The list is exhaustive over what reaches here, checked field by field against the schema:
  // shadowsocks, socks, vmess, vless, trojan, hysteria, hysteria2 and tuic all declare `network`;
  // WireGuard has none either but never arrives, because `renderNode` sends it to
  // `renderWireGuardEndpoint`. Adding a protocol here means checking its own field list, not this one.
  if (node.udp === false && !["http", "ssh", "anytls"].includes(node.type)) base.network = "tcp"
  if (node.type !== "wireguard") {
    base.tls = renderSingBoxTls(node)
    base.transport = renderTransport(node)
  }
  return compactRecord(base)
}

function shadowTlsTag(node: CanonicalNode) {
  return `${node.name}_shadowtls`
}

/**
 * Shadow-TLS is an outbound of its own in sing-box: it owns the address and the fake handshake, and
 * the proxy that runs over it reaches it through `detour`.
 */
function renderShadowTlsOutbound(node: CanonicalNode) {
  const wrapper = shadowTls(node)
  if (!wrapper) return null
  return compactRecord({
    type: "shadowtls",
    tag: shadowTlsTag(node),
    server: node.server,
    server_port: node.port,
    version: wrapper.version,
    password: wrapper.password,
    tls: compactRecord({ enabled: true, server_name: wrapper.host }),
  })
}

/**
 * A WireGuard endpoint as sing-box 1.11 and later describe one: the interface holds the addresses
 * and the private key, and the far side is a peer with its own allowed routes.
 */
function renderWireGuardEndpoint(node: CanonicalNode) {
  if (!node.server || !node.port) return null
  const allowed = node["allowed-ips"] ?? node.allowed_ips
  return {
    type: "wireguard",
    tag: node.name,
    address: wireGuardAddresses(node),
    private_key: asString(node["private-key"]),
    mtu: node.mtu,
    peers: [
      {
        address: node.server,
        port: node.port,
        public_key: asString(node["public-key"]),
        pre_shared_key: asString(node["pre-shared-key"]),
        allowed_ips:
          allowed === undefined
            ? ["0.0.0.0/0", "::/0"]
            : String(allowed)
                .split(",")
                .map((entry) => entry.trim())
                .filter(Boolean),
        reserved: node.reserved,
      },
    ],
  }
}

export const singBoxTarget = defineTarget({
  id: "sing-box",
  label: "sing-box",
  protocols: [
    "ss",
    "socks5",
    "http",
    "vmess",
    "vless",
    "trojan",
    "hysteria",
    "hysteria2",
    "tuic",
    "anytls",
    "wireguard",
    "ssh",
  ],
  transports: ["tcp", "ws", "grpc", "http", "h2", "httpupgrade", "quic"],
  // A duplicate tag makes the configuration invalid, so the proxy names are numbered.
  uniqueNames: true,
  // Numbering the names alone would hand out this tag twice; see `TargetSpec.derivedNames`. Same
  // function and condition as `renderShadowTlsOutbound`, so the reserved tag and the minted tag
  // cannot drift — and `detour` is minted from the same name in the same pass.
  derivedNames: (node) => (shadowTls(node) ? [shadowTlsTag(node)] : []),
  contentType: "application/json; charset=utf-8",
  fileExtension: "json",
  renderNode: (node) => {
    // Since 1.11 sing-box takes WireGuard as an endpoint rather than an outbound: a different shape,
    // not only a different bucket.
    if (node.type === "wireguard") return renderWireGuardEndpoint(node)
    const outbound = renderOutbound(node)
    if (!outbound) return null
    // A Shadow-TLS proxy is two outbounds: the proxy, and the handshake it detours through.
    const wrapper = renderShadowTlsOutbound(node)
    return wrapper ? [outbound, wrapper] : [outbound]
  },
  // sing-box rejects a configuration that still lists a WireGuard interface among the outbounds.
  // Which bucket a unit belongs in is readable off the unit itself, so the pipeline need not help.
  assemble: (units: Array<Record<string, unknown>>) => {
    const endpoints = units.filter((unit) => unit.type === "wireguard")
    const outbounds = units.filter((unit) => unit.type !== "wireguard")
    return JSON.stringify(endpoints.length > 0 ? { endpoints, outbounds } : { outbounds }, null, 2)
  },
})
