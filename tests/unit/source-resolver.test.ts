import { describe, expect, test } from "vitest"
import { compileNodeList } from "@/core/nodes"
import { readSubscriptionSource } from "@/core/subscriptions"
import type { SubscriptionSource } from "@/core/subscriptions"

const BODY = "ss://YWVzLTI1Ni1nY206cGFzcw==@example.com:8388#HK"

function remote(...urls: string[]): SubscriptionSource {
  return { type: "remote", urls }
}

function ok(body = BODY) {
  return new Response(body, { status: 200 })
}

function redirectTo(location: string) {
  return new Response(null, { status: 302, headers: { location } })
}

/** A fetch that answers each call from a script, and records where it was sent. */
function scripted(...responses: Response[]) {
  const seen: string[] = []
  const fetcher = (input: URL | RequestInfo) => {
    seen.push(String(input))
    const next = responses[seen.length - 1]
    if (!next) throw new Error(`unscripted request #${seen.length} to ${String(input)}`)
    return Promise.resolve(next)
  }
  return { fetcher: fetcher as unknown as typeof globalThis.fetch, seen }
}

/**
 * The fetch side of a remote subscription, which is this codebase's one outbound trust boundary: it
 * takes a URL an operator supplied, follows redirects a stranger controls, and must not be talked
 * into reaching anything private or into reading forever.
 */
describe("reading a remote subscription", () => {
  test("follows redirects up to the budget", async () => {
    const { fetcher, seen } = scripted(
      redirectTo("https://a.example.com/2"),
      redirectTo("https://a.example.com/3"),
      redirectTo("https://a.example.com/4"),
      ok(),
    )
    const outcome = await readSubscriptionSource(remote("https://a.example.com/1"), {
      allowedHosts: ["a.example.com"],
      fetch: fetcher,
    })

    expect(outcome.kind).toBe("ready")
    // Three redirects followed, so four requests in total — the budget, spent exactly.
    expect(seen).toHaveLength(4)
  })

  test("refuses one redirect past the budget", async () => {
    const { fetcher, seen } = scripted(
      redirectTo("https://a.example.com/2"),
      redirectTo("https://a.example.com/3"),
      redirectTo("https://a.example.com/4"),
      redirectTo("https://a.example.com/5"),
    )
    const outcome = await readSubscriptionSource(remote("https://a.example.com/1"), {
      allowedHosts: ["a.example.com"],
      fetch: fetcher,
    })

    expect(outcome).toMatchObject({ kind: "unavailable" })
    expect(outcome.kind === "unavailable" && outcome.error.message).toContain("too many times")
    // Refused rather than fetched: the fourth answer is read, the fifth request never goes out.
    expect(seen).toHaveLength(4)
  })

  test("a redirect off the allowed hosts is refused before it is followed", async () => {
    const { fetcher, seen } = scripted(redirectTo("https://elsewhere.invalid/steal"))

    await expect(
      readSubscriptionSource(remote("https://a.example.com/1"), {
        allowedHosts: ["a.example.com"],
        fetch: fetcher,
      }),
    ).rejects.toThrow(/not among the hosts/)
    expect(seen).toStrictEqual(["https://a.example.com/1"])
  })

  test("a wildcard grants the subdomains and not the apex", async () => {
    const allowedHosts = ["*.example.com"]
    const sub = scripted(ok())
    const subOutcome = await readSubscriptionSource(remote("https://a.example.com/x"), {
      allowedHosts,
      fetch: sub.fetcher,
    })
    expect(subOutcome.kind).toBe("ready")

    const apex = scripted(ok())
    await expect(
      readSubscriptionSource(remote("https://example.com/x"), {
        allowedHosts,
        fetch: apex.fetcher,
      }),
    ).rejects.toThrow(/not among the hosts/)
    expect(apex.seen).toStrictEqual([])
  })

  test("a host that resolves to a private address is refused after the lookup", async () => {
    const { fetcher, seen } = scripted(ok())

    await expect(
      readSubscriptionSource(remote("https://a.example.com/x"), {
        allowedHosts: ["a.example.com"],
        fetch: fetcher,
        resolveHost: () => Promise.resolve(["10.0.0.5"]),
      }),
    ).rejects.toThrow(/loopback or private/)
    expect(seen).toStrictEqual([])
  })

  test("every redirect target is resolved again, not just the first", async () => {
    // The check that matters: an upstream that answers a public first request with a redirect to a
    // name resolving inside the network would otherwise reach it on the second hop.
    const { fetcher, seen } = scripted(redirectTo("https://b.example.com/inside"))
    const resolved: string[] = []

    await expect(
      readSubscriptionSource(remote("https://a.example.com/1"), {
        allowedHosts: ["a.example.com", "b.example.com"],
        fetch: fetcher,
        resolveHost: (hostname) => {
          resolved.push(hostname)
          return Promise.resolve(hostname === "b.example.com" ? ["127.0.0.1"] : ["93.184.216.34"])
        },
      }),
    ).rejects.toThrow(/loopback or private/)
    expect(resolved).toStrictEqual(["a.example.com", "b.example.com"])
    expect(seen).toStrictEqual(["https://a.example.com/1"])
  })
})

function remoteNode(name: string) {
  return { name, type: "trojan", server: "example.com", port: 443, password: "p" }
}

describe("independent remote source documents", () => {
  test.each(["yaml", "json", "base64", "mixed"])(
    "%s sources are parsed separately and merged in URL order",
    async (format) => {
      const bodies = ["A", "B"].map((name, index) => {
        if (format === "yaml" || (format === "mixed" && index === 0)) {
          return `proxies:\n  - name: ${name}\n    type: trojan\n    server: example.com\n    port: 443\n    password: p\n`
        }
        if (format === "json") return JSON.stringify({ proxies: [remoteNode(name)] })
        return Buffer.from(`trojan://p@example.com:443#${name}`, "utf-8").toString("base64")
      })
      let bothStarted: () => void
      const started = new Promise<void>((resolve) => {
        bothStarted = resolve
      })
      const pending: Array<(response: Response) => void> = []
      const reading = readSubscriptionSource(
        remote("https://a.example.com/1", "https://a.example.com/2"),
        {
          allowedHosts: ["a.example.com"],
          fetch: () =>
            new Promise<Response>((resolve) => {
              pending.push(resolve)
              if (pending.length === 2) bothStarted()
            }),
        },
      )
      await started
      pending[1](ok(bodies[1]))
      pending[0](ok(bodies[0]))
      const outcome = await reading
      expect(outcome.kind).toBe("ready")
      if (outcome.kind !== "ready") throw outcome.error
      expect(outcome.source.contents).toStrictEqual(bodies)
      const compiled = compileNodeList({ source: outcome.source.contents, target: "uri" })
      expect(compiled.renderedNodes.map((entry) => entry.name)).toStrictEqual(["A", "B"])
      expect(compiled.diagnostics).toStrictEqual([])
    },
  )

  test("the total byte budget still applies across response bodies", async () => {
    const { fetcher } = scripted(ok("x".repeat(1024 * 1024)), ok("x".repeat(1024 * 1024 + 1)))
    const outcome = await readSubscriptionSource(
      remote("https://a.example.com/1", "https://a.example.com/2"),
      { allowedHosts: ["a.example.com"], fetch: fetcher },
    )
    expect(outcome.kind).toBe("unavailable")
  })
})

describe("remote response resource ownership", () => {
  test("discards a redirect body before fetching its destination", async () => {
    let cancelled = false
    const body = new ReadableStream({
      cancel() {
        cancelled = true
      },
    })
    let requests = 0
    const outcome = await readSubscriptionSource(remote("https://a.example.com/1"), {
      allowedHosts: ["a.example.com"],
      fetch: () => {
        requests += 1
        if (requests === 1)
          return Promise.resolve(new Response(body, { status: 302, headers: { location: "/2" } }))
        expect(cancelled).toBe(true)
        return Promise.resolve(ok())
      },
    })
    expect(outcome.kind).toBe("ready")
    expect(requests).toBe(2)
  })

  test.each(["declared", "streamed"])(
    "cancels a response that exceeds the %s byte budget",
    async (kind) => {
      let cancelled = false
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          if (kind === "streamed") controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1))
        },
        cancel() {
          cancelled = true
        },
      })
      const response = new Response(body, {
        headers: kind === "declared" ? { "content-length": String(2 * 1024 * 1024 + 1) } : {},
      })
      const outcome = await readSubscriptionSource(remote("https://a.example.com/1"), {
        allowedHosts: ["a.example.com"],
        fetch: () => Promise.resolve(response),
      })
      expect(outcome.kind).toBe("unavailable")
      expect(cancelled).toBe(true)
    },
  )

  test("aborts other in-flight requests when any source fails", async () => {
    let aborted = false
    const outcome = await readSubscriptionSource(
      remote("https://a.example.com/fail", "https://a.example.com/pending"),
      {
        allowedHosts: ["a.example.com"],
        fetch: (url, options) => {
          if (String(url).endsWith("/fail"))
            return Promise.resolve(new Response(null, { status: 503 }))
          const signal = options?.signal
          if (!signal) throw new Error("Missing cancellation signal")
          return new Promise<Response>((_resolve, reject) => {
            const cancel = () => {
              aborted = true
              reject(new DOMException("Aborted", "AbortError"))
            }
            if (signal.aborted) cancel()
            else signal.addEventListener("abort", cancel, { once: true })
          })
        },
      },
    )
    expect(outcome.kind).toBe("unavailable")
    expect(aborted).toBe(true)
  })
})
