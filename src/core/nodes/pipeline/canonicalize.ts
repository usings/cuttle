import { effectiveSni } from "../transport"
import type { CanonicalNode, DraftNode } from "../types"
import { booleanFlag, integer } from "../values"
import { applyWireGuardAddresses } from "../wireguard"

/**
 * The protocols whose name differs between the clients that write them.
 *
 * One table, not one per parser: `platform-lines.ts` needs the answer before this stage runs, to
 * know which fields a line even has, so it imports this rather than keeping a copy. Two copies is
 * how `hy2`, `tuic-v5`, `https` and `socks5-tls` came to be canonical on a proxy line and left as
 * written in a document — naming a protocol no client declares, refused by every one of them.
 */
const TYPE_ALIASES: Record<string, string> = {
  "hy2": "hysteria2",
  "https": "http",
  "shadowsocks": "ss",
  "shadowsocksr": "ssr",
  "socks": "socks5",
  "socks5-tls": "socks5",
  "tuic-v5": "tuic",
}

/**
 * The spellings that name a transport security as well as a protocol. The name normalizes away —
 * `https` is an `http` node, `socks5-tls` a `socks5` one — and the TLS must not go with it, or the
 * proxy comes back out as the plaintext version of itself, credentials and all.
 */
const ALIAS_IMPLIES_TLS = new Set(["https", "socks5-tls"])

/** `_` and `-` are one separator in a protocol name: `tuic_v5` and `tuic-v5` are the same spelling. */
function spelling(raw: string) {
  return raw.toLowerCase().replaceAll("_", "-")
}

/**
 * The protocol name in the spelling the rest of this codebase reads. An unrecognised name is
 * lower-cased and otherwise returned as it came, underscores included: a type this core does not
 * know travels through the canonical model untouched, like every other unknown field.
 */
export function canonicalType(raw: string) {
  return TYPE_ALIASES[spelling(raw)] ?? raw.toLowerCase()
}

/** Whether the source's own spelling of the protocol says it speaks TLS. */
export function spellsTls(raw: string) {
  return ALIAS_IMPLIES_TLS.has(spelling(raw))
}

/** The protocols that run over TLS by definition rather than by saying so. */
const IMPLIES_TLS = new Set(["trojan", "hysteria", "hysteria2", "tuic", "anytls"])

/**
 * Whether the protocol runs over TLS by definition rather than by saying so — Hysteria and TUIC are
 * QUIC, Trojan and AnyTLS have no plaintext mode at all.
 *
 * Exported because `platform-lines.ts` needs the same answer while it is still reading the line,
 * before this stage runs. One list, not two: a second copy keyed on the same canonical type is one
 * more place to forget the next protocol added. Unlike `spellsTls`, which needs the source's own
 * spelling, this takes a canonical type, so both callers can share it outright.
 */
export function impliesTls(type: string) {
  return IMPLIES_TLS.has(type)
}

/** The protocols whose transport has to be named, because every client asks which one it is. */
const NEEDS_NETWORK = new Set(["vmess", "vless", "trojan"])

/**
 * The value a source actually stated. Every fallback chain here is built out of `??`, which reads
 * `""` as a value — so without this an empty `name` shadows a usable `tag`, an empty `server` a
 * usable `address`, an empty `password` the credential the source did carry. An empty string is the
 * third way a source says nothing, and the structured readers hand it straight through: a YAML
 * `password:` with nothing after it reaches here as exactly that.
 *
 * Not `||`: `0` and `false` are values, and a node named `0` has a name.
 */
function stated(value: unknown) {
  return value === undefined || value === null || value === "" ? undefined : value
}

/**
 * The one place a parsed node becomes a canonical one. A default that disagrees with itself across
 * formats is how the same node comes to connect one way from a URI and another from a YAML file.
 *
 * Everything here defaults rather than overwrites: a parser that already states a value keeps it,
 * which is what lets a SIP002 URI say `udp: false` for itself against the `?? true` default. What
 * counts as stated is the qualification — an empty string is not one, which is `stated()` below.
 */
export function canonicalize(draft: DraftNode): CanonicalNode {
  const sourceType = String(draft.type ?? "")
  const type = canonicalType(sourceType)
  const server = String(stated(draft.server) ?? stated(draft.address) ?? "")
  const port = integer(draft.port as string | number, integer(draft.server_port as string | number))

  // Everything beyond the four required fields travels through untouched, which is what lets a
  // client-specific extension survive a round trip this core does not understand.
  const node = structuredClone(draft) as CanonicalNode
  node.type = type
  node.server = server
  node.port = port
  node.name = String(stated(draft.name) ?? stated(draft.tag) ?? `${type} ${server}:${port}`)
  if (draft.server_port != null) delete node.server_port

  if (typeof draft.udp === "string") node.udp = booleanFlag(draft.udp)
  if (typeof draft.tls === "string") node.tls = booleanFlag(draft.tls)
  // TLS by definition, or because the source's own spelling named the TLS the canonical name does
  // not carry. Defaults rather than overwrites, like every other rule here: a trojan URI carrying
  // `security=none` has stated plaintext and means it.
  if (impliesTls(type) || spellsTls(sourceType)) node.tls = node.tls ?? true

  // Stash spells the Hysteria2 secret `auth`, and Hysteria 1's `auth-str` or `auth_str`; the
  // canonical node keeps one name for each so a config we wrote reads back whole. Every candidate
  // goes through `stated`: an empty first field shadowing a real credential leaves the node unable
  // to authenticate against a server it has the secret for.
  if (type === "hysteria2" && node.auth !== undefined) {
    node.password = stated(node.password) ?? node.auth
    delete node.auth
  }
  if (type === "hysteria") {
    node["auth-str"] =
      stated(node["auth-str"]) ??
      stated(node.auth_str) ??
      stated(node.auth) ??
      stated(node.password)
    delete node.auth_str
    delete node.auth
    delete node.password
  }

  if (NEEDS_NETWORK.has(type) && !node.network) node.network = "tcp"
  if (type === "wireguard") applyWireGuardAddresses(node, draft.address ?? draft.local_address)
  if (type === "vmess") {
    node.cipher = stated(node.cipher) ?? "auto"
    node.alterId = integer(node.alterId as string | number, 0)
  }

  for (const key of Object.keys(node)) {
    if (!key.toLowerCase().endsWith("-opts") || key === key.toLowerCase()) continue
    node[key.toLowerCase()] = node[key]
    delete node[key]
  }

  // The three fields every client asks about but few sources state.
  //
  // A source that says nothing about UDP relays it; the one exception is a SIP002 URI, which states
  // `udp: false` for itself while parsing — which is why this defaults rather than overwrites. HTTP
  // is the protocol that says no: proxying it is CONNECT over TCP, so there is no UDP path to relay.
  // `false` rather than an absent key, because that is knowledge and not silence — a re-read of our
  // own canonical JSON has to find it rather than default back to `true`. SOCKS5 keeps the default:
  // UDP ASSOCIATE is real.
  //
  // Order: `effectiveSni` reads `tls` and the lower-cased `*-opts` keys, so it has to run after the
  // TLS implication above and after the key folding — not before either.
  node.udp = node.udp ?? type !== "http"
  // A Shadowsocks node that names no cipher means `none` — a cipher every client knows, which
  // `undefined` is not. Through `stated` rather than plain `??` because an empty one is no cipher
  // either: an SSD document naming no encryption produces one, as does a bare `encrypt-method=`.
  if (type === "ss") node.cipher = stated(node.cipher) ?? "none"
  const sni = effectiveSni(node)
  if (sni !== undefined) node.sni = sni

  return node
}
