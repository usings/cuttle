import { shadowsocksPlugin } from "../../plugins"
import { snellVersion, tuicIsV5 } from "../../protocols"
import type { CanonicalNode } from "../../types"
import { alpnList } from "../../values"
import { wireGuardAddresses } from "../../wireguard"

/**
 * The normalizations Clash Classic, mihomo and Stash share, and the one place each is written.
 *
 * Three YAML clients reading one schema family, each with its own list of what it implements: the
 * differences are real (Clash predates the QUIC-era protocols, Stash spells three fields its own way)
 * but the rules they *do* share are the same rules — three copies of them is how a client comes to
 * write a field the other two learned to drop.
 *
 * Every function mutates the node it is given, and each target calls the ones it needs in its own
 * order. That order is load-bearing rather than a style: the Clash-family YAML serializes in key
 * insertion order, so deleting and re-adding a key moves it, and a target's output is pinned to
 * `tests/fixtures/clients/`.
 */

/** The protocols whose schema has a `tls` key at all; the rest run over TLS by definition. */
const TLS_PROTOCOLS = new Set(["vmess", "vless", "http", "socks5"])
/** The protocols whose schema has a `network` key at all; the rest have no transport to choose. */
const TRANSPORT_PROTOCOLS = new Set(["vmess", "vless", "trojan"])

/** The VMess ciphers Clash and mihomo enumerate; anything else is `auto` to them. */
export const CLASH_VMESS_CIPHERS = new Set([
  "auto",
  "none",
  "zero",
  "aes-128-gcm",
  "chacha20-poly1305",
])

/**
 * VMess needs a cipher and an `alterId` stated as a number whatever the source said.
 *
 * `allowed` is the client's own enumeration, for the two that have one: a cipher outside it has to
 * become `auto` rather than reach the client as a value it rejects. Stash names no list and so passes
 * none — narrowing a cipher it would have accepted is how a working node comes back downgraded.
 */
export function normalizeVmess(output: CanonicalNode, allowed?: ReadonlySet<string>) {
  if (output.type !== "vmess") return
  const cipher = output.cipher ?? "auto"
  output.cipher = !allowed || allowed.has(String(cipher)) ? cipher : "auto"
  output.alterId = Number(output.alterId ?? 0)
}

/**
 * Which key carries the TLS server name is a property of the protocol, not of the client: the
 * protocols named in `servernameProtocols` read `servername`, everything else reads `sni`. Writing one
 * of them everywhere leaves the other half with a name the client never looks at, so it falls back to
 * the address and the handshake goes out with the wrong SNI.
 *
 * Clash reads `servername` for VMess alone; mihomo and Stash read it for VLESS too.
 */
export function moveServerName(output: CanonicalNode, servernameProtocols: readonly string[]) {
  const server = output.servername || output.sni
  if (!server) return
  const key = servernameProtocols.includes(String(output.type)) ? "servername" : "sni"
  delete output.servername
  delete output.sni
  output[key] = server
}

/** All three read the plugin by the name of the protocol, not by the binary that implements it. */
export function normalizePlugin(output: CanonicalNode) {
  const plugin = shadowsocksPlugin(output)
  if (plugin?.type === "other") {
    // A plugin we have no mapping for keeps its name and options exactly as they arrived: we know
    // nothing about what they mean, and rewriting them would change how the node connects.
    const options = (output["plugin-opts"] ?? {}) as object
    output.plugin = String(output.plugin)
    output["plugin-opts"] = options
    return
  }
  if (!plugin) return
  const options: Record<string, unknown> = { mode: plugin.mode }
  if (plugin.host) options.host = plugin.host
  if (plugin.type !== "obfs" && plugin.path) options.path = plugin.path
  if (plugin.type !== "obfs" && plugin.tls) options.tls = true
  output.plugin = plugin.type === "obfs" ? "obfs" : "v2ray-plugin"
  output["plugin-opts"] = options
}

/**
 * The switches a node carries for someone else's benefit. A Shadowsocks proxy holding `network: tcp`
 * and `tls: false` states two keys none of these clients has a field for — both stay on the canonical
 * node, because Quantumult X reads `tls` on a Shadowsocks node to write `obfs=over-tls`, so they are
 * dropped on the way out instead. Snell only learned to relay UDP in version 3; before that the
 * switch means nothing.
 */
export function dropUnsupportedSwitches(output: CanonicalNode) {
  if (!TLS_PROTOCOLS.has(String(output.type))) delete output.tls
  if (!TRANSPORT_PROTOCOLS.has(String(output.type))) delete output.network
  if (output.type === "snell" && snellVersion(output) < 3) delete output.udp
}

/**
 * The gRPC stream mode is a URI-level field: all three read `grpc-opts.grpc-service-name` and nothing
 * else, so `mode` would be a key they do not know.
 */
export function dropGrpcMode(output: CanonicalNode) {
  const options = output["grpc-opts"]
  if (!options || typeof options !== "object" || !("mode" in options)) return
  const { mode: _mode, ...rest } = options as Record<string, unknown>
  output["grpc-opts"] = rest
}

/**
 * The QUIC-era protocols reached each client with its own spelling: mihomo and Stash read TUIC's
 * congestion control as `congestion-controller` and want its ALPN as a list. The canonical node keeps
 * the names the URI used, so the translation happens here.
 *
 * Both read the TUIC version off the presence of `token` rather than off a field, so leaving a v4
 * node's token under `uuid` hands them a v5 node whose password is missing.
 */
export function normalizeTuic(output: CanonicalNode) {
  if (output.type !== "tuic") return
  if (output.congestion_control !== undefined) {
    output["congestion-controller"] = output.congestion_control
    delete output.congestion_control
  }
  if (output.udp_relay_mode !== undefined) {
    output["udp-relay-mode"] = output.udp_relay_mode
    delete output.udp_relay_mode
  }
  if (output.alpn !== undefined) output.alpn = alpnList(output.alpn)
  if (tuicIsV5(output)) {
    output.version = output.version ?? 5
    return
  }
  const token = output.token ?? output.uuid
  delete output.uuid
  if (token !== undefined) output.token = token
}

/**
 * A WireGuard interface can hold several addresses, and mihomo and Stash both say so two ways: a
 * single address goes in `ip`, several in `address`. Writing both, plus the parsed-out `ip-cidr`
 * halves, leaves the client to guess which is real.
 *
 * `prefix` is the one difference between them: mihomo keeps the prefix length on the single-address
 * form, Stash takes the bare address.
 */
export function normalizeWireGuardAddresses(
  output: CanonicalNode,
  prefix: "keep-prefix" | "drop-prefix",
) {
  if (output.type !== "wireguard") return
  const addresses = wireGuardAddresses(output)
  delete output.publickey
  delete output["ip-cidr"]
  delete output["ipv6-cidr"]
  delete output.ip
  delete output.ipv6
  if (addresses.length === 1) {
    const [only] = addresses
    delete output.address
    output[only.includes(":") ? "ipv6" : "ip"] =
      prefix === "keep-prefix" ? only : only.split("/")[0]
  } else if (addresses.length > 0) {
    output.address = addresses
  }
}

/**
 * Neither mihomo nor Stash has an HTTPUpgrade transport: both carry one as a WebSocket the client is
 * told to upgrade over plain HTTP. `network: httpupgrade` with options of its own is a transport they
 * do not recognise, so they fall back to TCP and the connection never forms.
 */
export function httpUpgradeAsWebSocket(output: CanonicalNode) {
  if (output.network !== "httpupgrade") return
  const options = (output["httpupgrade-opts"] ?? {}) as Record<string, unknown>
  const headers = { ...(options.headers as Record<string, unknown>) }
  if (options.host) headers.Host = options.host

  output.network = "ws"
  output["ws-opts"] = {
    ...(options.path === undefined ? {} : { path: options.path }),
    ...(Object.keys(headers).length === 0 ? {} : { headers }),
    "v2ray-http-upgrade": true,
    // Early data is what makes the upgrade worth opening optimistically; without it, fast-open would
    // promise the client something the source never asked for.
    ...(options["max-early-data"] === undefined ? {} : { "v2ray-http-upgrade-fast-open": true }),
  }
  delete output["httpupgrade-opts"]
}
