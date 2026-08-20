import { describe, expect, test } from "vitest"
import { hasAdminToken } from "@/features/session/admin-session"

describe("whether a session holds a key", () => {
  test("any non-blank token the operator chose counts", () => {
    expect(hasAdminToken("a")).toBe(true)
    expect(hasAdminToken("short")).toBe(true)
    expect(hasAdminToken("a-token-that-is-well-past-thirty-two-characters")).toBe(true)
  })

  test("surrounding whitespace does not make or break a key", () => {
    expect(hasAdminToken("  abc  ")).toBe(true)
    expect(hasAdminToken("abc\n")).toBe(true)
  })

  test("nothing but whitespace is not a key", () => {
    expect(hasAdminToken("")).toBe(false)
    expect(hasAdminToken(" ")).toBe(false)
    expect(hasAdminToken("\n\t  ")).toBe(false)
  })
})
