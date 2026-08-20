import { describe, expect, test } from "vitest"
import { inspectNodeList } from "@/core/nodes"
import { shadowTls } from "@/core/nodes/plugins"

/** A Shadowsocks outbound dialing through a Shadow-TLS one, the way sing-box spells that pair. */
const SHADOW_TLS_CONFIG = JSON.stringify({
  outbounds: [
    {
      type: "shadowsocks",
      tag: "STLS",
      detour: "STLS_wrapper",
      method: "aes-128-gcm",
      password: "pass",
    },
    {
      type: "shadowtls",
      tag: "STLS_wrapper",
      server: "example.com",
      server_port: 443,
      password: "secret",
      version: 3,
      tls: { enabled: true, server_name: "cdn.example.com" },
    },
  ],
})

describe("the parse stage", () => {
  test("a sing-box outbound detouring through Shadow-TLS keeps the whole handshake", () => {
    // The wrapper is folded back into the proxy as a record rather than the `;`-delimited string a
    // sing-box `plugin_opts` normally is, and a reader that accepts only the string hands back a plain
    // Shadowsocks node dialing a server that answers nothing but a Shadow-TLS handshake.
    const { nodes, detectedFormat } = inspectNodeList(SHADOW_TLS_CONFIG)

    expect(detectedFormat).toBe("sing-box")
    expect(nodes).toHaveLength(1)
    expect(nodes[0].server).toBe("example.com")
    expect(shadowTls(nodes[0])).toStrictEqual({
      host: "cdn.example.com",
      password: "secret",
      version: 3,
    })
  })

  test("a URI query value is percent-decoded once, not twice", () => {
    // `URLSearchParams` decodes as it parses. Decoding what it hands back reads a `%xx` the value
    // itself contains as an escape of its own, so `%2525` — one escaped `%25` — comes back as a bare
    // `%` instead of `%25`, and the credential no longer authenticates.
    const [node] = inspectNodeList(
      "hy2://user@example.com:443?obfs=salamander&obfs-password=a%2525b&sni=c%2525d#n",
    ).nodes

    expect(node["obfs-password"]).toBe("a%25b")
    expect(node.sni).toBe("c%25d")
  })

  test("every protocol reading a URI query shares that one decode", () => {
    // The copy lives in `urlNode`, so the protocols that reach it — not Hysteria 2 alone — all have
    // to read the same value back. Hysteria 2 was the only one a per-field re-read had ever covered.
    const [tuic] = inspectNodeList("tuic://id:pass@example.com:443?sni=a%2525b#n").nodes
    const [anytls] = inspectNodeList("anytls://pass@example.com:443?sni=a%2525b#n").nodes

    expect(tuic.sni).toBe("a%25b")
    expect(anytls.sni).toBe("a%25b")
  })
})
