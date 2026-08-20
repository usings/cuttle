import type { CanonicalNode } from "./types"
import { asString } from "./values"

/**
 * Shadowsocks plugins are the same two things everywhere — simple-obfs and v2ray-plugin — under a
 * different name and shape in every client: `plugin: obfs` with `plugin-opts.mode` in Clash, a
 * `simple-obfs;obfs=…` string in a URI, `obfs-name=` on a Loon line. One shape here keeps each
 * renderer to its own spelling instead of re-deriving the plugin from raw options.
 */
interface ShadowsocksPlugin {
  host?: string
  /** `http` or `tls` for simple-obfs, `websocket` or `quic` for v2ray-plugin. */
  mode?: string
  path?: string
  tls: boolean
  type: "obfs" | "other" | "v2ray"
}

export function shadowsocksPlugin(node: CanonicalNode): ShadowsocksPlugin | undefined {
  const name = asString(node.plugin)
  if (!name) return
  const options = (node["plugin-opts"] ?? {}) as Record<string, unknown>
  // Options arrive either SIP002-style (`obfs`, `obfs-host`) or Clash-style (`mode`, `host`).
  const host = asString(options["obfs-host"]) ?? asString(options.host)
  const path = asString(options["obfs-uri"]) ?? asString(options.path)

  if (["obfs", "obfs-local", "simple-obfs"].includes(name)) {
    return {
      host,
      mode: asString(options.obfs) ?? asString(options.mode) ?? "http",
      path,
      tls: false,
      type: "obfs",
    }
  }
  if (name.includes("v2ray")) {
    return {
      host,
      mode: asString(options.mode) ?? asString(options.obfs) ?? "websocket",
      path,
      tls: options.tls === true,
      type: "v2ray",
    }
  }
  return {
    host,
    mode: asString(options.mode) ?? asString(options.obfs),
    path,
    tls: options.tls === true,
    type: "other",
  }
}

/**
 * Shadow-TLS wraps the proxy in a handshake with an unrelated host, so every client that supports it
 * asks for the same three things — that host, the shared password, and the protocol version.
 */
interface ShadowTlsPlugin {
  host?: string
  password: string
  version: number
}

export function shadowTls(node: CanonicalNode): ShadowTlsPlugin | undefined {
  if (asString(node.plugin) !== "shadow-tls") return
  const options = (node["plugin-opts"] ?? {}) as Record<string, unknown>
  const password = asString(options.password)
  // Without the password there is no handshake to describe, and no client would dial it.
  if (!password) return
  // A version nobody can read as a number is not one: `Number("beta")` reaches a client as
  // `shadow-tls-version=NaN` on a Surge line and `"version": null` in sing-box JSON, neither of which
  // it can act on. The current protocol version stands in instead.
  const version = Number(options.version ?? 3)
  return {
    host: asString(options.host),
    password,
    version: Number.isInteger(version) && version > 0 ? version : 3,
  }
}

/**
 * Whether the node carries a plugin the line-format clients cannot express. Surge, Surfboard, Loon
 * and Egern write simple-obfs and Shadow-TLS and nothing else; writing such a node without its plugin
 * would hand the user a proxy that connects differently, so those renderers refuse it instead.
 */
export function pluginBeyondObfs(node: CanonicalNode) {
  const plugin = shadowsocksPlugin(node)
  if (plugin === undefined || plugin.type === "obfs") return false
  return shadowTls(node) === undefined
}

/** The `plugin=` value of a SIP002 URI, where simple-obfs keeps its original name. */
export function uriPlugin(node: CanonicalNode) {
  const plugin = shadowsocksPlugin(node)
  if (!plugin) return
  if (plugin.type === "obfs") {
    return [
      "simple-obfs",
      `obfs=${plugin.mode}`,
      plugin.host && `obfs-host=${plugin.host}`,
      // The request path is the difference between the node coming back whole and subtly different.
      plugin.path && `obfs-uri=${plugin.path}`,
    ]
      .filter(Boolean)
      .join(";")
  }
  if (plugin.type === "v2ray") {
    return [
      "v2ray-plugin",
      `obfs=${plugin.mode}`,
      `mode=${plugin.mode}`,
      plugin.host && `obfs-host=${plugin.host}`,
      plugin.host && `host=${plugin.host}`,
      plugin.path && `path=${plugin.path}`,
      plugin.tls && "tls",
    ]
      .filter(Boolean)
      .join(";")
  }
  // No mapping for this one: serialised as it came in, because dropping it hands the client a node
  // that connects a different way.
  const options = (node["plugin-opts"] ?? {}) as Record<string, unknown>
  return [
    String(node.plugin),
    ...Object.entries(options).map(([key, value]) =>
      value === true ? key : `${key}=${String(value)}`,
    ),
  ].join(";")
}

/** sing-box keeps the executable's name and passes its options through as one string. */
export function singBoxPlugin(node: CanonicalNode) {
  const plugin = shadowsocksPlugin(node)
  if (!plugin) return
  if (plugin.type === "obfs") {
    return {
      name: "obfs-local",
      options: [
        `obfs=${plugin.mode}`,
        plugin.host && `obfs-host=${plugin.host}`,
        plugin.path && `obfs-uri=${plugin.path}`,
      ]
        .filter(Boolean)
        .join(";"),
    }
  }
  if (plugin.type === "v2ray") {
    return {
      name: "v2ray-plugin",
      options: [
        `mode=${plugin.mode}`,
        plugin.host && `host=${plugin.host}`,
        plugin.path && `path=${plugin.path}`,
        plugin.tls && "tls",
      ]
        .filter(Boolean)
        .join(";"),
    }
  }
}
