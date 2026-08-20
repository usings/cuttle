import { describe, expect, test } from "vitest"
import { compileNodeList } from "@/core/nodes"

describe("a diagnostic says which stage dropped the node", () => {
  test("an HTML page is refused by the parse stage", () => {
    const result = compileNodeList({
      source: "<!doctype html><title>login</title>",
      target: "mihomo",
    })

    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0].stage).toBe("parse")
    expect(result.diagnostics[0].code).toBe("html-input")
  })

  test("a login page with no doctype is refused the same way", () => {
    // The portals that answer a subscription request with a page instead are hand-written ones, and
    // those routinely leave the doctype off. Read a line at a time it becomes a wall of
    // unreadable-line warnings with nothing in it that names the actual problem.
    const result = compileNodeList({
      source: "<html><body>Please sign in</body></html>",
      target: "mihomo",
    })

    expect(result.diagnostics).toHaveLength(1)
    expect(result.diagnostics[0].code).toBe("html-input")
  })

  test("a node the client cannot carry is refused on the rendering side", () => {
    // WireGuard is not in Clash Classic's protocol list.
    const result = compileNodeList({
      source: "wireguard://cHJpdmF0ZQ@example.com:51820#WG",
      target: "clash",
    })

    expect(result.diagnostics.length).toBeGreaterThan(0)
    const refusal = result.diagnostics.find((item) => item.message.includes("cannot be carried by"))
    expect(refusal?.stage).toBe("capability")
  })
})

describe("the parse validation stage", () => {
  test("a structured node with no address is stopped and reported", () => {
    const result = compileNodeList({
      source: JSON.stringify({ proxies: [{ type: "ss", port: 8388, name: "无地址" }] }),
      target: "mihomo",
    })

    expect(result.nodes).toStrictEqual([])
    expect(result.diagnostics.some((item) => item.stage === "parse-validation")).toBe(true)
  })

  test("a port outside the dialable range is stopped", () => {
    const result = compileNodeList({
      source: JSON.stringify({ proxies: [{ type: "ss", server: "example.com", port: 70_000 }] }),
      target: "mihomo",
    })

    expect(result.nodes).toStrictEqual([])
    expect(result.diagnostics.some((item) => item.stage === "parse-validation")).toBe(true)
  })

  test("an unreadable line stays a parse diagnostic and keeps its line number", () => {
    const result = compileNodeList({ source: "这不是节点", target: "mihomo" })
    const [diagnostic] = result.diagnostics

    expect(diagnostic.stage).toBe("parse")
    expect(diagnostic.line).toBe(1)
  })

  test("a non-string type is coerced to a string rather than reaching a node as-is", () => {
    const result = compileNodeList({
      source: JSON.stringify({ proxies: [{ type: 5, server: "example.com", port: 443 }] }),
      target: "mihomo",
    })

    expect(result.nodes).toHaveLength(1)
    expect(typeof result.nodes[0].type).toBe("string")
    expect(result.nodes[0].type).toBe("5")
  })

  test("a structured entry with no usable type is dropped rather than kept as a raw record", () => {
    const result = compileNodeList({
      source: JSON.stringify({ proxies: [{ server: "example.com", port: 443 }] }),
      target: "mihomo",
    })

    expect(result.nodes).toStrictEqual([])
    expect(result.diagnostics.some((item) => item.stage === "parse-validation")).toBe(true)
  })
})

describe("the rule chain now runs on settled nodes", () => {
  const SS = "ss://YWVzLTEyOC1nY206cGFzcw@example.com:8388#Node"

  test("a rule that sets an option overrides the canonicalized default", () => {
    // This SIP002 URI states no `udp=`, so it is settled to `false` (see
    // `src/core/nodes/formats/proxy-uri.ts`) before the rule chain sees it. Overriding to `true` — the
    // opposite of that settled value — is what proves the chain runs after canonicalize and wins.
    const result = compileNodeList({
      source: SS,
      target: "mihomo",
      processors: [{ type: "set-options", values: { udp: true } }],
    })

    expect(result.nodes[0].udp).toBe(true)
  })

  test("a node a rule broke is caught by validation instead of reaching a renderer", () => {
    // The flag processor, not `rename`: `renameProcessor.apply`
    // (`src/core/nodes/processors/rename.ts`) falls back to the original name whenever the replacement
    // would leave it blank, so it cannot empty one. `mode: "remove"` has no such fallback — it strips
    // every regional-indicator pair and trims, leaving nothing behind for a name that is only a flag.
    // The fragment decodes to 🇭🇰: a real, if unusual, node name, and the reason validation sits
    // downstream of the whole rule chain rather than only downstream of parsing.
    const FLAG_ONLY_NAME = "ss://YWVzLTEyOC1nY206cGFzcw@example.com:8388#%F0%9F%87%AD%F0%9F%87%B0"
    const result = compileNodeList({
      source: FLAG_ONLY_NAME,
      target: "mihomo",
      processors: [{ type: "flag", mode: "remove" }],
    })

    expect(result.nodes).toStrictEqual([])
    expect(result.renderedNodes).toStrictEqual([])
    expect(result.diagnostics.some((item) => item.stage === "canonical-validation")).toBe(true)
  })

  test("the reported nodes are the same list the renderer saw", () => {
    const result = compileNodeList({ source: SS, target: "mihomo" })

    // A SIP002 URI states `udp: false` for itself while parsing (see
    // `src/core/nodes/formats/proxy-uri.ts`) rather than falling through to canonicalize's `?? true`.
    expect(result.nodes[0].udp).toBe(false)
    expect(result.nodes[0].cipher).toBe("aes-128-gcm")
    expect(result.renderedNodes[0]).toStrictEqual(result.nodes[0])
    // Deep equality would still pass if `nodes` reverted to a pre-validation list, because nothing
    // here mutates a field between stages — only reference identity tells the two apart. A single node
    // with no name collision comes out of `uniqueNames` unchanged (see
    // `src/core/nodes/pipeline/render.ts`), so `renderedNodes[0]` must be the very object in `nodes`.
    expect(result.renderedNodes[0]).toBe(result.nodes[0])
  })
})
