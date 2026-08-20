/**
 * Surge, Loon and Quantumult X proxy lines, and Egern proxy objects, read into drafts.
 *
 * The answers shared with every other input format are asked for rather than repeated: the spelling
 * table, the protocols that are TLS by definition, the readable fallback name, the `udp` default and
 * the VMess cipher all live in `pipeline/canonicalize.ts`. A line parser has to know the canonical
 * type before that stage runs — it decides which fields the line even has — so it imports the table.
 *
 * What stays is what that stage cannot see, or cannot place: these clients spell half the shared
 * fields their own way — `udp-relay`, `over-tls`, `udp_relay`, `auth`, `method`, `aead` — and a key it
 * never reads is a setting silently lost. Each such read is marked where it is not obvious, as is the
 * one write kept for where it puts a key rather than for the value.
 */
import { canonicalType, impliesTls, spellsTls } from "../pipeline/canonicalize"
import type { CanonicalNode } from "../types"
import { asRecord, asString, booleanFlag, firstOf } from "../values"

interface ParsedPlatformNode {
  node: CanonicalNode
  format: "surge" | "loon" | "quantumult-x"
}

function value(input: string | undefined) {
  const trimmed = input?.trim() ?? ""
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replaceAll('\\"', '"').replaceAll("\\'", "'")
  }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed.slice(1, -1)
  return trimmed
}

/** `booleanFlag`'s rule, read off a line: what these clients quote, this has to unquote first. */
function bool(input: string | undefined) {
  return input == null ? undefined : booleanFlag(value(input))
}

function splitCsv(input: string) {
  const result: string[] = []
  let current = ""
  let quote = ""
  let depth = 0
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    if (quote) {
      current += character
      if (character === quote && input[index - 1] !== "\\") quote = ""
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      current += character
    } else if (character === "{" || character === "[") {
      depth += 1
      current += character
    } else if (character === "}" || character === "]") {
      depth = Math.max(0, depth - 1)
      current += character
    } else if (character === "," && depth === 0) {
      result.push(current.trim())
      current = ""
    } else {
      current += character
    }
  }
  result.push(current.trim())
  return result
}

/**
 * A `key=value` token, as opposed to a positional argument that merely contains an `=` — which a
 * base64 password does, swallowing the password of every 2022-cipher node.
 */
function keyed(part: string) {
  return /^[A-Za-z][\w-]*\s*=/.test(part.trim())
}

function options(parts: string[]) {
  const result: Record<string, string> = {}
  for (const part of parts) {
    if (!keyed(part)) continue
    const separator = part.indexOf("=")
    result[part.slice(0, separator).trim().toLowerCase()] = value(part.slice(separator + 1))
  }
  return result
}

function endpoint(input: string) {
  const match = value(input).match(/^\[([^\]]+)]:(\d+)$/) ?? value(input).match(/^(.+):(\d+)$/)
  if (!match) return null
  return { server: match[1], port: Number(match[2]) }
}

function applyCommon(node: CanonicalNode, input: Record<string, string>) {
  // Whether the line said so, and nothing beyond that. No `?? true`: the canonical default answers
  // the silence and is the only place that knows an `http` proxy has no UDP to relay, so stating
  // `true` over it makes a `HTTP = http, …` line claim UDP relay however that rule reads.
  //
  // The read itself is not the default restated: `udp-relay` is Surge's and Quantumult X's spelling
  // and the shared rule only coerces `udp`, so without this line every `udp-relay=false` is lost.
  node.udp = bool(input["udp-relay"] ?? input.udp)
  node.tfo = bool(input["fast-open"] ?? input.tfo)
  node.sni = input.sni ?? input["tls-name"] ?? input["tls-host"] ?? input.servername
  node["skip-cert-verify"] =
    bool(input["skip-cert-verify"]) ??
    (input["tls-verification"] == null ? undefined : !bool(input["tls-verification"]))
  // Each client separates a multi-value ALPN its own way — Surge with `;`, because a comma would end
  // the parameter, Loon with a comma inside quotes — and neither character occurs in an ALPN name, so
  // one split reads all of them. Dropping the list leaves the node negotiating the default protocol.
  const alpn = input.alpn
    ?.split(/[;,]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
  if (alpn?.length) node.alpn = alpn
  const transport = (input.transport ?? "").toLowerCase()
  const obfs = (input.obfs ?? "").toLowerCase()
  // On a Shadowsocks or Snell line `obfs=http` names simple-obfs; on the protocols Quantumult X
  // describes with the same word it names the HTTP transport, which is a different thing entirely.
  const obfsNetwork =
    (obfs === "ws" || obfs === "wss") && !["ss", "ssr"].includes(String(node.type))
      ? "ws"
      : obfs === "http" && ["vmess", "vless", "trojan"].includes(String(node.type))
        ? "http"
        : "tcp"
  const network = transport || (bool(input.ws) ? "ws" : obfsNetwork)
  node.network = network
  // Three answers in precedence order: what the line stated, what the caller established from the
  // protocol name (`https` and `socks5-tls` are TLS by their own spelling), and only then the
  // implication from the protocol itself — `impliesTls`'s single list, not a copy kept here.
  // Overwriting the caller's answer hands a Surge `https` line back out as plaintext `http`,
  // credentials and all; a copy of the list is how Hysteria 1, missing from it, came to state
  // plaintext for a protocol that is QUIC and therefore always TLS.
  //
  // Unconditional, not conditional: on a Shadowsocks line a computed `false` is information —
  // Quantumult X reads it to decide `obfs=over-tls` — and an absent field loses the difference
  // between "the source named no TLS obfs" and "the source said nothing".
  node.tls =
    bool(input["over-tls"] ?? input.tls) ??
    node.tls ??
    (["wss", "over-tls"].includes(obfs) || impliesTls(node.type))
  if (network === "ws") {
    node["ws-opts"] = {
      path: input.path ?? input["ws-path"] ?? input["obfs-uri"] ?? "/",
      headers:
        (input.host ?? input["ws-host"] ?? input["obfs-host"])
          ? { Host: input.host ?? input["ws-host"] ?? input["obfs-host"] }
          : undefined,
    }
    if (input["ws-headers"]) {
      node["ws-opts"] = {
        ...(node["ws-opts"] as Record<string, unknown>),
        headers: Object.fromEntries(
          input["ws-headers"].split("|").flatMap((header) => {
            const separator = header.indexOf(":")
            return separator === -1
              ? []
              : [[header.slice(0, separator), header.slice(separator + 1)]]
          }),
        ),
      }
    }
  } else if (network === "http") {
    // Clash keeps both as lists, which is the shape every renderer reads them back from.
    const path = input.path ?? input["obfs-uri"]
    const host = input.host ?? input["obfs-host"]
    node["http-opts"] = {
      path: path === undefined ? undefined : [path],
      headers: host === undefined ? undefined : { Host: [host] },
    }
  } else if (network === "grpc") {
    node["grpc-opts"] = {
      "grpc-service-name": input["service-name"] ?? input["grpc-service-name"],
    }
  }
  if (input["reality-base64-pubkey"]) {
    node["reality-opts"] = {
      "public-key": input["reality-base64-pubkey"],
      "short-id": input["reality-hex-shortid"] ?? "",
    }
    node.tls = true
  }
  return node
}

function parseQuantumultX(left: string, parts: string[]): ParsedPlatformNode | null {
  const ep = endpoint(parts[0])
  if (!ep) return null
  const input = options(parts.slice(1))
  const protocol = left.toLowerCase()
  // The same spelling table the Surge and Loon lines are read with: `https` is an `http` node that
  // speaks TLS, `socks5-tls` a `socks5` one, so neither word is a canonical type. Taking the protocol
  // word as the type leaves a `https=` line carrying a type no client declares — refused by every
  // one of them with a capability diagnostic, so the line silently disappears. Quantumult X's own addition
  // to the table is SSR: a `shadowsocks=` line that names an `ssr-protocol`.
  const type = protocol === "shadowsocks" && input["ssr-protocol"] ? "ssr" : canonicalType(protocol)
  const node: CanonicalNode = {
    type,
    name: input.tag,
    ...ep,
  }
  if (type === "ss" || type === "ssr") {
    node.cipher = input.method
    node.password = input.password
    const obfs = (input.obfs ?? "").toLowerCase()
    if (type === "ssr") {
      node.protocol = input["ssr-protocol"]
      node["protocol-param"] = input["ssr-protocol-param"]
      node.obfs = input.obfs
      node["obfs-param"] = input["obfs-host"]
    } else if (["http", "tls"].includes(obfs)) {
      node.plugin = "obfs"
      node["plugin-opts"] = { mode: obfs, host: input["obfs-host"], path: input["obfs-uri"] }
    } else if (["ws", "wss"].includes(obfs)) {
      // Quantumult X has no name for v2ray-plugin: a Shadowsocks node it calls `ws` is one.
      node.plugin = "v2ray-plugin"
      node["plugin-opts"] = {
        mode: "websocket",
        host: input["obfs-host"],
        path: input["obfs-uri"],
        tls: obfs === "wss",
      }
    }
  } else if (type === "vmess" || type === "vless") {
    node.uuid = input.password
    // `method` is this line's word for the cipher, so the read stays; the VMess `auto` it fell back to is
    // the shared rule's, which answers VMess and nothing else — VLESS's `none` has no other source.
    node.cipher = input.method ?? (type === "vless" ? "none" : undefined)
    node.flow = input["vless-flow"]
    // `aead` is how this line says "legacy VMess", and the shared `alterId` rule is VMess-only: a VLESS
    // node's `0` comes from here or from nowhere.
    node.alterId = bool(input.aead) === false ? 1 : 0
  } else if (["trojan", "anytls", "hysteria2", "tuic"].includes(type)) {
    // A TUIC `token` is the v4 credential in its own right; for the other three it is another name for
    // the password. Folding TUIC's in makes every renderer read a v4 node as a v5 one with no uuid.
    if (type === "tuic") node.token = input.token
    node.password = input.password ?? (type === "tuic" ? undefined : input.token)
    node.uuid = input.uuid
  } else {
    node.username = input.username
    node.password = input.password
    // The canonical type keeps no trace of the TLS Quantumult X names in the protocol: `socks5-tls`
    // becomes `socks5`, so without this the line comes back out as a plaintext SOCKS5 proxy carrying
    // the same credentials.
    if (spellsTls(protocol)) node.tls = true
  }
  return { node: applyCommon(node, input), format: "quantumult-x" }
}

const QX_TYPES = new Set([
  "shadowsocks",
  "vmess",
  "vless",
  "trojan",
  "anytls",
  "hysteria2",
  "tuic",
  "http",
  "https",
  "socks5",
  "socks5-tls",
])

/**
 * Loon's WireGuard line carries no address of its own: the endpoint belongs to the first peer, and
 * the peer list is a literal in the middle of the line.
 */
function parseLoonWireGuard(left: string, parts: string[]): ParsedPlatformNode | null {
  const input = options(parts.slice(1))
  const peers = input.peers ?? ""
  const peer = options(
    splitCsv(peers.replace(/^\[/, "").replace(/]$/, "").replace(/^{/, "").replace(/}$/, "")),
  )
  const ep = endpoint(peer.endpoint ?? "")
  if (!ep) return null
  const node: CanonicalNode = {
    "type": "wireguard",
    "name": value(left),
    ...ep,
    "private-key": input["private-key"],
    "public-key": peer["public-key"],
    "pre-shared-key": peer["pre-shared-key"],
    "allowed-ips": peer["allowed-ips"],
    "ip": input["interface-ip"],
    "mtu": Number(input.mtu) || undefined,
    // The value is the shared default; the position is not. Canonical JSON and the Clash-family YAML
    // serialize in key insertion order, and the shared rule runs after the one that splits an
    // `interface-ip` prefix off into `ip-cidr` — so leaving `udp` to it swaps those two keys.
    "udp": true,
  }
  return { node, format: "loon" }
}

function parseAssignment(left: string, parts: string[]): ParsedPlatformNode | null {
  const sourceType = value(parts[0])
  const type = canonicalType(sourceType)
  if (type === "wireguard" && !Number(parts[2])) return parseLoonWireGuard(left, parts)
  if (!parts[1] || !Number(parts[2])) return null
  const format: ParsedPlatformNode["format"] =
    ["shadowsocks", "shadowsocksr", "vless", "hysteria2", "wireguard"].includes(
      sourceType.toLowerCase(),
    ) ||
    (["vmess", "vless", "trojan", "anytls", "hysteria2", "http", "https", "socks5"].includes(
      sourceType.toLowerCase(),
    ) &&
      parts.slice(3).some((part) => !keyed(part)))
      ? "loon"
      : "surge"
  let positionalEnd = 3
  while (positionalEnd < parts.length && !keyed(parts[positionalEnd])) positionalEnd += 1
  const positional = parts.slice(3, positionalEnd).map((item) => value(item))
  const input = options(parts.slice(positionalEnd))
  const node: CanonicalNode = {
    type,
    name: value(left),
    server: value(parts[1]),
    port: Number(parts[2]),
  }

  if (type === "ss") {
    node.cipher = input["encrypt-method"] ?? positional[0]
    node.password = input.password ?? positional[1]
    // Surge spells the obfuscation `obfs=`, Loon `obfs-name=`; both mean simple-obfs.
    const obfs = input.obfs ?? input["obfs-name"]
    if (obfs) {
      node.plugin = "obfs"
      node["plugin-opts"] = { mode: obfs, host: input["obfs-host"], path: input["obfs-uri"] }
    }
    if (input["shadow-tls-password"]) {
      node.plugin = "shadow-tls"
      node["plugin-opts"] = {
        host: input["shadow-tls-sni"],
        password: input["shadow-tls-password"],
        version: Number(input["shadow-tls-version"] ?? 3),
      }
    }
  } else if (type === "ssr") {
    ;[
      node.cipher,
      node.password,
      node.protocol,
      node["protocol-param"],
      node.obfs,
      node["obfs-param"],
    ] = positional
  } else if (type === "vmess") {
    node.cipher = input["encrypt-method"] ?? positional[0]
    node.uuid = input.username ?? positional[1]
    // `alterid` and `vmess-aead` are this line's spellings; the `0` is not the shared default
    // restated but the argument `Number` needs, which would be `NaN` without it.
    node.alterId = Number(input.alterid ?? (bool(input["vmess-aead"]) === false ? 1 : 0))
  } else if (type === "vless") {
    node.uuid = input.username ?? positional[0]
    node.flow = input.flow
  } else if (["trojan", "anytls", "hysteria2", "tuic"].includes(type)) {
    // As in `parseQuantumultX`: a TUIC `token` is the v4 credential in its own right, and folding it
    // into the password makes every renderer read a v4 node as a v5 one with no uuid.
    if (type === "tuic") node.token = input.token
    node.password = input.password ?? (type === "tuic" ? undefined : input.token) ?? positional[0]
    node.uuid = input.uuid
    node.obfs = input.obfs
    node["obfs-password"] = input["obfs-password"] ?? input["salamander-password"]
    node.down = input["download-bandwidth"]
  } else if (type === "snell") {
    node.psk = input.psk ?? positional[0]
    node.version = Number(input.version ?? 3)
    node.obfs = input.obfs
    node["obfs-host"] = input["obfs-host"]
  } else if (type === "ssh") {
    node.username = input.username
    node.password = input.password
    node["private-key"] = input["private-key"]
    node["server-fingerprint"] = input["server-fingerprint"]
  } else if (type === "wireguard") {
    node["private-key"] = positional[0] ?? input["private-key"]
    node["public-key"] = input["public-key"]
    node["pre-shared-key"] = input["pre-shared-key"]
    node.ip = input["interface-ip"]
    node.mtu = Number(input.mtu) || undefined
  } else {
    node.username = input.username ?? positional[0]
    node.password = input.password ?? positional[1]
    // A protocol whose own spelling says TLS — `https`, `socks5-tls` — states it, and the table that
    // folds the name away is what knows which spellings those are. The absence of such a spelling
    // states nothing: this branch is also where every protocol without a case of its own lands,
    // Hysteria 1 among them, and a `false` here would deny the TLS that protocol runs on
    // unconditionally. `applyCommon` decides the silent case for all of them.
    if (spellsTls(sourceType)) node.tls = true
  }
  return { node: applyCommon(node, input), format }
}

export function parsePlatformLine(line: string): ParsedPlatformNode | null {
  const separator = line.indexOf("=")
  if (separator === -1) return null
  const left = line.slice(0, separator).trim()
  const parts = splitCsv(line.slice(separator + 1))
  if (QX_TYPES.has(left.toLowerCase()) && endpoint(parts[0])) return parseQuantumultX(left, parts)
  return parseAssignment(left, parts)
}

/**
 * Egern keys each proxy by its protocol — `- {shadowsocks: {…}}` — and names half its fields its own
 * way. Reading that back is what makes an Egern config an input as well as an output.
 */
const EGERN_TYPES: Record<string, string> = {
  anytls: "anytls",
  http: "http",
  https: "http",
  hysteria2: "hysteria2",
  shadowsocks: "ss",
  snell: "snell",
  socks5: "socks5",
  ssh: "ssh",
  trojan: "trojan",
  tuic: "tuic",
  vless: "vless",
  vmess: "vmess",
}

function egernReality(input: unknown) {
  const reality = asRecord(input)
  if (!reality) return
  return { "public-key": reality.public_key, "short-id": reality.short_id }
}

/** The one transport an Egern proxy declares, translated back into a network and its options. */
function egernTransport(node: CanonicalNode, transport: Record<string, unknown>) {
  const [kind] = Object.keys(transport)
  const stream = asRecord(transport[kind]) ?? {}
  const headers = asRecord(stream.headers)
  const host = firstOf(stream.host ?? headers?.Host ?? headers?.host)
  const reality = egernReality(stream.reality)
  node.sni = asString(stream.sni) ?? node.sni
  if (stream.skip_tls_verify !== undefined) node["skip-cert-verify"] = stream.skip_tls_verify
  if (reality) node["reality-opts"] = reality

  if (kind === "ws" || kind === "wss") {
    node.network = "ws"
    node.tls = kind === "wss"
    node["ws-opts"] = {
      path: stream.path,
      headers: host === undefined ? undefined : { Host: host },
    }
  } else if (kind === "http1" || kind === "http2") {
    node.network = kind === "http1" ? "http" : "h2"
    node[`${node.network}-opts`] = {
      method: stream.method,
      path: stream.path === undefined ? undefined : [stream.path],
      ...(kind === "http1"
        ? { headers: host === undefined ? undefined : { Host: [host] } }
        : { host: host === undefined ? undefined : [host] }),
    }
  } else if (kind === "grpc") {
    node.network = "grpc"
    node["grpc-opts"] = { "grpc-service-name": stream.service_name }
    node.tls = true
  } else if (kind === "tls") {
    node.tls = true
  }
}

export function parseEgernProxy(proxy: unknown): CanonicalNode | null {
  const entry = asRecord(proxy)
  const keys = entry ? Object.keys(entry) : []
  if (!entry || keys.length !== 1) return null
  const type = EGERN_TYPES[keys[0]]
  const fields = asRecord(entry[keys[0]])
  const server = asString(fields?.server)
  const port = Number(fields?.port)
  if (!type || !fields || !server || !Number.isInteger(port)) return null

  const node: CanonicalNode = {
    type,
    name: asString(fields.name) ?? "",
    server,
    port,
    // `udp_relay` is Egern's spelling and the shared rule only coerces `udp`: without this read every
    // `udp_relay: false` becomes the default `true`.
    udp: typeof fields.udp_relay === "boolean" ? fields.udp_relay : undefined,
    tfo: fields.tfo,
    sni: asString(fields.sni),
    alpn: fields.alpn,
    // The key rather than the type, and that is why this stays: `https` maps to `http`, so this TLS
    // is written nowhere canonicalize can read it — `spellsTls` is asked about the type, `http` either
    // way. The protocols that are TLS by definition stay that stage's list; see `impliesTls`.
    tls: keys[0] === "https" || undefined,
  }
  if (fields.skip_tls_verify !== undefined) node["skip-cert-verify"] = fields.skip_tls_verify
  if (type === "ss") {
    node.cipher = asString(fields.method)
    node.password = asString(fields.password)
    if (fields.obfs) {
      node.plugin = "obfs"
      node["plugin-opts"] = { mode: fields.obfs, host: fields.obfs_host, path: fields.obfs_uri }
    }
  } else if (type === "vmess" || type === "vless") {
    node.uuid = asString(fields.user_id)
    node.cipher = asString(fields.security)
    node.flow = asString(fields.flow)
    // `legacy` is Egern's word for alterId 1, and the shared rule is VMess-only: a VLESS node's `0`
    // comes from here or from nowhere.
    node.alterId = fields.legacy === true ? 1 : 0
  } else if (type === "hysteria2") {
    // Egern's own field, nested inside the proxy body: the shared credential rule folds a top-level
    // `auth` key on the draft and never sees this one.
    node.password = asString(fields.auth)
    node.up = fields.bandwidth
    node.obfs = asString(fields.obfs)
    node["obfs-password"] = asString(fields.obfs_password)
  } else if (type === "tuic") {
    node.uuid = asString(fields.uuid)
    node.password = asString(fields.password)
  } else if (type === "snell") {
    node.psk = asString(fields.psk)
    node.version = fields.version
    node.obfs = asString(fields.obfs)
    node["obfs-host"] = asString(fields.obfs_host)
  } else if (type === "ssh") {
    node.username = asString(fields.username)
    node.password = asString(fields.password)
    node["private-key"] = asString(fields.private_key)
  } else if (type === "http" || type === "socks5") {
    node.username = asString(fields.username)
    node.password = asString(fields.password)
  } else {
    node.password = asString(fields.password)
  }

  const websocket = asRecord(fields.websocket)
  if (websocket) {
    node.network = "ws"
    node["ws-opts"] = {
      path: websocket.path,
      headers: websocket.host === undefined ? undefined : { Host: websocket.host },
    }
  }
  const transport = asRecord(fields.transport)
  if (transport) egernTransport(node, transport)
  const shadowTls = asRecord(fields.shadow_tls)
  if (shadowTls) {
    node.plugin = "shadow-tls"
    node["plugin-opts"] = { host: shadowTls.sni, password: shadowTls.password, version: 3 }
  }
  const reality = egernReality(fields.reality)
  if (reality) node["reality-opts"] = reality
  return node
}
