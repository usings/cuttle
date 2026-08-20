import { describe, expect, test } from "vitest"
import { fromChunks, toChunks } from "@/platform/d1/stored-content"

/** Mirrors the chunk size in `stored-content.ts`; the boundary cases depend on the exact value. */
const CHUNK_SIZE = 128 * 1024

/** D1's documented ceiling for a single string or row value, which is stated in bytes. */
const D1_MAX_VALUE_BYTES = 2_000_000

/** Spans three rows, with content that differs per row so a misordered rejoin is detectable. */
const THREE_CHUNKS = `${"a".repeat(CHUNK_SIZE)}${"b".repeat(CHUNK_SIZE)}ccc`

function rows(chunks: string[]) {
  return chunks.map((content) => ({ content }))
}

/**
 * D1 columns are TEXT, so a chunk carrying one half of a surrogate pair comes back as a
 * replacement character. Round-tripping each chunk through UTF-8 reproduces that loss.
 */
function throughStorage(chunks: string[]) {
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  return chunks.map((chunk) => decoder.decode(encoder.encode(chunk)))
}

describe("the rows a stored value becomes", () => {
  test("a short value is a single row", () => {
    expect(toChunks("hello")).toStrictEqual(["hello"])
    expect(fromChunks(rows(["hello"]))).toBe("hello")
  })

  test("an empty value still writes one row, so presence stays distinguishable from absence", () => {
    expect(toChunks("")).toStrictEqual([""])
    expect(fromChunks(rows(toChunks("")))).toBe("")
  })

  test("a value at the chunk size exactly is still one row", () => {
    const value = "a".repeat(CHUNK_SIZE)
    expect(toChunks(value)).toHaveLength(1)
    expect(fromChunks(rows(toChunks(value)))).toBe(value)
  })

  test("a longer value splits into rows that each fit a column", () => {
    const chunks = toChunks(THREE_CHUNKS)
    expect(chunks).toHaveLength(3)
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(CHUNK_SIZE)
    expect(fromChunks(rows(chunks))).toBe(THREE_CHUNKS)
  })

  test("rows rejoin in order and only in order", () => {
    const chunks = toChunks(THREE_CHUNKS)
    expect(fromChunks(rows(chunks.toReversed()))).not.toBe(THREE_CHUNKS)
  })

  test("a row stays inside D1's value limit at the widest UTF-8 expansion", () => {
    // A BMP character above U+07FF is three UTF-8 bytes per code unit, the widest ratio a chunk of
    // any input can reach: astral characters cost four bytes but two code units.
    const chunks = toChunks("\u6587".repeat(CHUNK_SIZE * 2))
    const encoder = new TextEncoder()
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(encoder.encode(chunk).byteLength).toBeLessThan(D1_MAX_VALUE_BYTES)
    }
  })

  test("a surrogate pair straddling the boundary is not split across rows", () => {
    const value = `${"a".repeat(CHUNK_SIZE - 1)}\u{1F600}b`
    const chunks = toChunks(value)
    // Backing off by one keeps the emoji whole rather than ending the row mid-pair.
    expect(chunks[0]).toHaveLength(CHUNK_SIZE - 1)
    expect(chunks[1]).toBe("\u{1F600}b")
    expect(fromChunks(rows(throughStorage(chunks)))).toBe(value)
  })

  test("consecutive pairs on the boundary survive storage", () => {
    const value = `${"a".repeat(CHUNK_SIZE - 1)}${"\u{1F600}".repeat(CHUNK_SIZE)}`
    const stored = fromChunks(rows(throughStorage(toChunks(value))))
    expect(stored).toBe(value)
    expect(stored).not.toContain("\uFFFD")
  })
})
