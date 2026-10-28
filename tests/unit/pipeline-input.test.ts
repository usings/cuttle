import { describe, expect, test } from "vitest"
import { ValidationError } from "@/core/errors"
import { inspectNodeList } from "@/core/nodes"

const URI = "trojan://password@example.com:443#Primary"

describe("subscription input", () => {
  test.each([
    ["URI", URI, "uri-list"],
    ["Base64", Buffer.from(URI, "utf-8").toString("base64"), "base64-uri-list"],
  ])("reads a %s subscription", (_name, source, format) => {
    const result = inspectNodeList(source)
    expect(result.detectedFormat).toBe(format)
    expect(result.nodes).toMatchObject([
      { name: "Primary", type: "trojan", server: "example.com", port: 443, password: "password" },
    ])
    expect(result.nodes).toHaveLength(1)
    expect(result.diagnostics).toStrictEqual([])
  })

  test("extracts every proxy from a full configuration without reading later sections as nodes", () => {
    const result = inspectNodeList(
      [
        "[General]",
        "loglevel = notify",
        "[Proxy]",
        'A = trojan, example.com, 443, password="first"',
        'B = trojan, example.org, 8443, password="second"',
        "[Rule]",
        "FINAL,DIRECT",
      ].join("\n"),
    )
    expect(result.nodes.map((node) => [node.name, node.server, node.password])).toStrictEqual([
      ["A", "example.com", "first"],
      ["B", "example.org", "second"],
    ])
    expect(result.diagnostics).toStrictEqual([])
  })

  test.each(["not a node", '{"proxies":'])(
    "reports malformed input without inventing nodes",
    (source) => {
      const result = inspectNodeList(source)
      expect(result.nodes).toStrictEqual([])
      expect(result.diagnostics).not.toHaveLength(0)
    },
  )

  test("enforces the input limit in UTF-8 bytes", () => {
    expect(() => inspectNodeList("文".repeat(Math.floor((2 * 1024 * 1024) / 3) + 1))).toThrow(
      ValidationError,
    )
  })

  test("rejects a non-string input at the public boundary", () => {
    expect(() => inspectNodeList(undefined as unknown as string)).toThrow(ValidationError)
  })
})
