import { describe, expect, test } from "vitest"
import { compileNodeList } from "@/core/nodes"

function sortedNames(names: string[]) {
  const source = names
    .map((name) => `ss://YWVzLTI1Ni1nY206cGFzcw==@example.com:8388#${encodeURIComponent(name)}`)
    .join("\n")
  return compileNodeList({
    source,
    target: "json",
    processors: [{ type: "sort", field: "name" }],
  }).renderedNodes.map((node) => node.name)
}

/**
 * The order a subscriber receives, which must not depend on where the compile ran.
 *
 * `localeCompare` with no locale takes the runtime's, and a Worker on Cloudflare's edge does not
 * have the one a developer's machine does — under `en` every Chinese name sorts after every Latin
 * one and under `zh` before, so the same subscription came out inverted depending on the host. This
 * pins the answer to `zh`; a runtime shipping without its collation data would fail here rather than
 * quietly reorder every list in production.
 */
describe("the sort rule collates the same way everywhere", () => {
  test("Chinese names come first, in pinyin order", () => {
    expect(sortedNames(["Tokyo", "香港", "apple", "日本", "台北"])).toStrictEqual([
      "日本",
      "台北",
      "香港",
      "apple",
      "Tokyo",
    ])
  })

  test("numbers inside a name read as numbers", () => {
    expect(sortedNames(["HK 10", "HK 2", "HK 1"])).toStrictEqual(["HK 1", "HK 2", "HK 10"])
  })
})
