import { afterEach, describe, expect, test, vi } from "vitest"
import { hasToken } from "@/features/session/token"

describe("whether a session holds a key", () => {
  test("any non-blank token the operator chose counts", () => {
    expect(hasToken("a")).toBe(true)
    expect(hasToken("short")).toBe(true)
    expect(hasToken("a-token-that-is-well-past-thirty-two-characters")).toBe(true)
  })

  test("surrounding whitespace does not make or break a key", () => {
    expect(hasToken("  abc  ")).toBe(true)
    expect(hasToken("abc\n")).toBe(true)
  })

  test("nothing but whitespace is not a key", () => {
    expect(hasToken("")).toBe(false)
    expect(hasToken(" ")).toBe(false)
    expect(hasToken("\n\t  ")).toBe(false)
  })
})

/**
 * Where the key is kept, spelled out rather than imported: it is a persistence format, and renaming
 * it drops the key out from under every session already open in a browser. These tests are the
 * tripwire for doing that by accident.
 */
const STORAGE_KEY = "cuttle:token"

/** The module seeds itself at import, so every case here needs its own evaluation of it. */
function loadToken() {
  vi.resetModules()
  return import("@/features/session/token")
}

function workingStorage(entries: Record<string, string> = {}) {
  const store = new Map(Object.entries(entries))
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    read: (key: string) => store.get(key) ?? null,
  }
}

/** A browser that denies storage does not return null — reading the property itself throws. */
function deniedStorage() {
  return {
    get getItem(): never {
      throw new Error("SecurityError: storage is disabled")
    },
    get setItem(): never {
      throw new Error("SecurityError: storage is disabled")
    },
    get removeItem(): never {
      throw new Error("SecurityError: storage is disabled")
    },
  }
}

describe("the key a page load starts with", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test("comes from the previous page load, trimmed", async () => {
    vi.stubGlobal("sessionStorage", workingStorage({ [STORAGE_KEY]: "  stored-key\n" }))
    const { readToken } = await loadToken()
    expect(readToken()).toBe("stored-key")
  })

  test("is empty where there is no storage at all, as on the server", async () => {
    vi.stubGlobal("sessionStorage", undefined)
    const { readToken } = await loadToken()
    expect(readToken()).toBe("")
  })

  test("is empty rather than fatal where storage is denied", async () => {
    // The seeding runs while the module is evaluated, so an escaping exception would take down every
    // page that imports it — including the workbench, which needs no key at all.
    vi.stubGlobal("sessionStorage", deniedStorage())
    const { readToken } = await loadToken()
    expect(readToken()).toBe("")
  })
})

describe("committing a key", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test("holds it and remembers it", async () => {
    const storage = workingStorage()
    vi.stubGlobal("window", {})
    vi.stubGlobal("sessionStorage", storage)
    const { commitToken, readToken } = await loadToken()

    commitToken("fresh-key")

    expect(readToken()).toBe("fresh-key")
    expect(storage.read(STORAGE_KEY)).toBe("fresh-key")
  })

  test("still holds it for this document when storage is denied", async () => {
    vi.stubGlobal("window", {})
    vi.stubGlobal("sessionStorage", deniedStorage())
    const { commitToken, readToken } = await loadToken()

    commitToken("fresh-key")

    expect(readToken()).toBe("fresh-key")
  })

  test("forgets it again on clear", async () => {
    const storage = workingStorage({ [STORAGE_KEY]: "stored-key" })
    vi.stubGlobal("window", {})
    vi.stubGlobal("sessionStorage", storage)
    const { clearToken, readToken } = await loadToken()

    clearToken()

    expect(readToken()).toBe("")
    expect(storage.read(STORAGE_KEY)).toBeNull()
  })

  test("is refused outside a document, so no credential crosses a request", async () => {
    // The store is module-scoped and a Worker isolate serves many requests from one module scope: a
    // write reaching the server would hand one visitor's key to the next.
    vi.stubGlobal("window", undefined)
    vi.stubGlobal("sessionStorage", undefined)
    const { commitToken, clearToken, noteTokenRefused, readToken } = await loadToken()

    expect(() => commitToken("leaked-key")).toThrow(/outside a browser session/)
    expect(() => clearToken()).toThrow(/outside a browser session/)
    expect(() => noteTokenRefused()).toThrow(/outside a browser session/)
    expect(readToken()).toBe("")
  })
})
