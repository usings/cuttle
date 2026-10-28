import { describe, expect, test } from "vitest"
import { compileNodeList, inspectNodeList } from "@/core/nodes"

function source(fields: Record<string, unknown>) {
  return JSON.stringify({
    proxies: [{ name: "Node", server: "example.com", port: 443, password: "secret", ...fields }],
  })
}

describe("connection properties in converted configurations", () => {
  test.each(["uri", "v2ray", "sing-box", "loon", "egern"] as const)(
    "%s refuses TLS SOCKS instead of dropping its encryption",
    (target) => {
      const result = compileNodeList({ source: source({ type: "socks5-tls" }), target })
      expect(result.nodes[0]).toMatchObject({ type: "socks5", tls: true })
      expect(result.renderedNodes).toStrictEqual([])
      expect(result.diagnostics).toMatchObject([
        {
          code: "capability-refused",
          message: expect.stringContaining("TLS cannot be represented"),
        },
      ])
    },
  )

  test("plain SOCKS remains representable in sing-box without a TLS or transport field", () => {
    const result = compileNodeList({
      source: source({ type: "socks5", username: "u" }),
      target: "sing-box",
    })
    expect(JSON.parse(result.content)).toStrictEqual({
      outbounds: [
        {
          type: "socks",
          tag: "Node",
          server: "example.com",
          server_port: 443,
          username: "u",
          password: "secret",
          version: "5",
        },
      ],
    })
    expect(result.diagnostics).toStrictEqual([])
  })

  test.each(["http", "ssh", "anytls", "hysteria2", "tuic", "ss"])(
    "sing-box refuses a V2Ray transport on %s",
    (type) => {
      const result = compileNodeList({
        source: source({ type, network: "ws", uuid: "u" }),
        target: "sing-box",
      })
      expect(result.renderedNodes).toStrictEqual([])
      expect(result.diagnostics).toMatchObject([
        { message: expect.stringContaining("transport cannot be represented") },
      ])
    },
  )

  test.each(["egern", "loon"] as const)(
    "%s refuses a transport that its AnyTLS output would omit",
    (target) => {
      const result = compileNodeList({ source: source({ type: "anytls", network: "ws" }), target })
      expect(result.renderedNodes).toStrictEqual([])
      expect(result.diagnostics).toMatchObject([
        { message: expect.stringContaining("transport cannot be represented") },
      ])
    },
  )

  test("TLS and WebSocket are retained together on a sing-box VLESS outbound", () => {
    const result = compileNodeList({
      source: source({
        "type": "vless",
        "uuid": "id",
        "tls": true,
        "sni": "example.com",
        "network": "ws",
        "ws-opts": { path: "/socket" },
      }),
      target: "sing-box",
    })
    expect(JSON.parse(result.content).outbounds).toMatchObject([
      {
        type: "vless",
        uuid: "id",
        tls: { enabled: true, server_name: "example.com" },
        transport: { type: "ws", path: "/socket" },
      },
    ])
    expect(result.diagnostics).toStrictEqual([])
  })

  test.each(["uri", "v2ray"] as const)(
    "%s retains an explicit plaintext Trojan setting",
    (target) => {
      const result = compileNodeList({ source: source({ type: "trojan", tls: false }), target })
      const content = target === "v2ray" ? atob(result.content) : result.content
      expect(new URL(content).searchParams.get("security")).toBe("none")
    },
  )

  test("sing-box retains an explicit plaintext Trojan configuration", () => {
    const result = compileNodeList({
      source: source({ type: "trojan", tls: false }),
      target: "sing-box",
    })
    expect(JSON.parse(result.content).outbounds).toStrictEqual([
      {
        type: "trojan",
        tag: "Node",
        server: "example.com",
        server_port: 443,
        password: "secret",
      },
    ])
    expect(result.diagnostics).toStrictEqual([])
    expect(inspectNodeList(result.content).nodes[0].tls).toBe(false)
    const converted = compileNodeList({ source: result.content, target: "uri" })
    expect(new URL(converted.content).searchParams.get("security")).toBe("none")
  })

  test("a standard IPv6 URI has a bare canonical address and one pair of authority brackets", () => {
    const result = compileNodeList({ source: "trojan://p@[2001:db8::1]:443#IPv6", target: "uri" })
    expect(result.nodes[0].server).toBe("2001:db8::1")
    expect(result.content).toBe("trojan://p@[2001:db8::1]:443?type=tcp#IPv6")
    expect(new URL(result.content).hostname).toBe("[2001:db8::1]")
    expect(result.diagnostics).toStrictEqual([])
  })

  test.each(["[2001:db8::1]", "2001:db8::1"])(
    "structured IPv6 %s uses the same bare host in JSON",
    (server) => {
      const result = compileNodeList({
        source: source({ type: "trojan", server }),
        target: "sing-box",
      })
      expect(JSON.parse(result.content).outbounds[0].server).toBe("2001:db8::1")
      expect(inspectNodeList(result.content).nodes[0].server).toBe("2001:db8::1")
    },
  )

  test.each(["[bad]", "[2001:db8::1", "example.com:443", "2001:db8::xyz"])(
    "malformed host %s cannot produce an invalid authority",
    (server) => {
      const result = compileNodeList({ source: source({ type: "trojan", server }), target: "uri" })
      expect(result.renderedNodes).toStrictEqual([])
      expect(result.diagnostics).toMatchObject([{ code: "invalid-canonical-node" }])
    },
  )
})
