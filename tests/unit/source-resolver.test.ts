import { describe, expect, test } from "vitest"
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
