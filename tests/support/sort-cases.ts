import { compileNodeList } from "@/core/nodes"

/** Identical expectations exercised separately in Node and workerd. */
export const SORT_CASES = [
  {
    name: "Chinese names precede Latin names in pinyin order",
    input: ["Tokyo", "香港", "apple", "日本", "台北"],
    expected: ["日本", "台北", "香港", "apple", "Tokyo"],
  },
  {
    name: "numbers inside names sort numerically",
    input: ["HK 10", "HK 2", "HK 1"],
    expected: ["HK 1", "HK 2", "HK 10"],
  },
]

export function sortedNames(names: string[]) {
  const source = names
    .map((name) => `ss://YWVzLTI1Ni1nY206cGFzcw==@example.com:8388#${encodeURIComponent(name)}`)
    .join("\n")
  return compileNodeList({
    source,
    target: "json",
    processors: [{ type: "sort", field: "name" }],
  }).renderedNodes.map((node) => node.name)
}
