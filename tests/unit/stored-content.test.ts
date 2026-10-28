import { describe, expect, test } from "vitest"
import { fromChunks, toChunks } from "@/platform/d1/stored-content"

const D1_MAX_VALUE_BYTES = 2_000_000
const encoder = new TextEncoder()
const decoder = new TextDecoder()

// Include the previously failing surrogate-pair boundary without requiring a particular chunk count.
const samples = [
  { name: "empty content", value: "" },
  { name: "ordered ASCII", value: `${"a".repeat(150000)}${"b".repeat(150000)}end` },
  { name: "multi-byte text larger than a D1 value", value: "文".repeat(700000) },
  ...[-1, 0, 1].map((offset) => ({
    name: `emoji near the previous split boundary ${offset}`,
    value: `${"a".repeat(131072 + offset)}${"😀".repeat(140000)}tail`,
  })),
]

describe("D1 text serialization", () => {
  test.each(samples)("preserves $name across UTF-8 storage", ({ value }) => {
    const chunks = toChunks(value)
    expect(chunks.length).toBeGreaterThan(0)
    const stored = chunks.map((content) => {
      const bytes = encoder.encode(content)
      expect(bytes.byteLength).toBeLessThanOrEqual(D1_MAX_VALUE_BYTES)
      return { content: decoder.decode(bytes) }
    })
    expect(fromChunks(stored)).toBe(value)
  })
})
