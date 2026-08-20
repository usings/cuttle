import { describe, expect, test, vi } from "vitest"
import { ValidationError } from "@/core/errors"
import { prepareInput } from "@/core/nodes/pipeline/input"

describe("the input stage", () => {
  test("a Base64 envelope is unwrapped and the fact recorded", () => {
    const inner = "ss://YWVzLTEyOC1nY206cGFzcw@example.com:8388#SS"
    const encoded = Buffer.from(inner, "utf-8").toString("base64")
    const prepared = prepareInput(encoded)

    expect(prepared.encoded).toBe(true)
    expect(prepared.text).toBe(inner)
  })

  test("only the [Proxy] section of a Surge configuration is read", () => {
    const prepared = prepareInput(
      [
        "[General]",
        "loglevel = notify",
        "",
        "[Proxy]",
        "A = ss, example.com, 8388",
        "",
        "[Rule]",
        "FINAL,DIRECT",
      ].join("\n"),
    )

    expect(prepared.text).toBe("A = ss, example.com, 8388")
    expect(prepared.encoded).toBe(false)
  })

  test("the document is parsed once and shared by every structured format", () => {
    const prepared = prepareInput('{"proxies":[]}')
    const first = prepared.document()

    expect(first).toStrictEqual({ proxies: [] })
    // The same object, not an equal one parsed again: four formats read this.
    expect(prepared.document()).toBe(first)
  })

  test("a source YAML reads as a bare string is not a document", () => {
    expect(prepareInput("ss://not-a-document").document()).toBeNull()
  })

  test("a parse that failed is memoized, not retried by every format that asks", () => {
    const prepared = prepareInput('{"proxies":')
    // Two nulls prove nothing: an implementation that re-parses on every call returns null every time
    // too. Counting the parse is the only way to observe the `parsed = true` that sits *before* the
    // `try`, which is the whole of what `PreparedSource` promises about an unparsable source.
    const parse = vi.spyOn(JSON, "parse")

    try {
      expect(prepared.document()).toBeNull()
      expect(prepared.document()).toBeNull()
      expect(parse).toHaveBeenCalledOnce()
    } finally {
      parse.mockRestore()
    }
  })

  test("a source over the size cap is refused before anything reads it", () => {
    expect(() => prepareInput("a".repeat(2 * 1024 * 1024 + 1))).toThrow(ValidationError)
  })

  test("a source that is not a string is refused", () => {
    expect(() => prepareInput(undefined as unknown as string)).toThrow(ValidationError)
  })
})
