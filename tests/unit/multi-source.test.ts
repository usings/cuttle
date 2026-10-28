import { describe, expect, test } from "vitest"
import { compileNodeList, inspectNodeList, MAX_SOURCE_SIZE } from "@/core/nodes"

const A = "trojan://p@example.com:443#A"
const B = "trojan://p@example.org:443#B"

describe("a compile across source documents", () => {
  test("sorting runs once over the merged list", () => {
    const result = compileNodeList({
      source: [B, A],
      target: "uri",
      processors: [{ type: "sort", field: "name" }],
    })
    expect(result.renderedNodes.map((node) => node.name)).toStrictEqual(["A", "B"])
  })

  test("deduplication sees identical nodes in different sources", () => {
    const result = compileNodeList({
      source: [A, A],
      target: "uri",
      processors: [{ type: "dedupe" }],
    })
    expect(result.renderedNodes.map((node) => node.name)).toStrictEqual(["A"])
  })

  test("target names remain unique across source boundaries", () => {
    const result = compileNodeList({ source: [A, A], target: "surge" })
    expect(result.renderedNodes.map((node) => node.name)).toStrictEqual(["A", "A 2"])
  })

  test("a parse diagnostic retains its source and local line number", () => {
    const result = inspectNodeList([A, `${B}\nnot a node`])
    expect(result.nodes.map((node) => node.name)).toStrictEqual(["A", "B"])
    expect(result.diagnostics).toMatchObject([{ sourceIndex: 1, line: 2, stage: "parse" }])
  })

  test("sources cannot evade the combined byte limit", () => {
    expect(() =>
      inspectNodeList(["x".repeat(MAX_SOURCE_SIZE / 2), "x".repeat(MAX_SOURCE_SIZE / 2 + 1)]),
    ).toThrow(/2 MiB/)
  })
})
