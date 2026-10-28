import { env } from "cloudflare:workers"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { TargetId } from "@/core/nodes"
import { SubscriptionDelivery } from "@/core/subscriptions"
import { D1SubscriptionRepository } from "@/platform/d1/subscription-repository"
import { artifactFixture, NODE_URI, subscriptionStore } from "../support/subscriptions"

const NOW = Date.parse("2026-10-28T00:00:00.000Z")
const store = subscriptionStore(env.DB)
const { repository } = store
const service = new SubscriptionDelivery(repository, {
  resolveHost: () => Promise.resolve(["93.184.216.34"]),
})
const remote = { type: "remote", urls: ["https://example.com/subscription"] } as const

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
  vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(async () => {
  await store.cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function upstream(...bodies: string[]) {
  let index = 0
  const fetcher = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      new Response(bodies[Math.min(index++, bodies.length - 1)], {
        headers: { "subscription-userinfo": "upload=7; download=11" },
      }),
    ),
  )
  vi.stubGlobal("fetch", fetcher)
  return fetcher
}

function seededRemote() {
  return store.seed({ source: { type: "remote", urls: [...remote.urls] } })
}

describe("subscription delivery with D1 artifacts", () => {
  test("reuses output for 60 seconds, revalidates its ETag, then refreshes at the boundary", async () => {
    const { record, token } = await seededRemote()
    const fetcher = upstream(NODE_URI, NODE_URI.replace("Primary", "Updated"))
    const first = await service.deliver(token)
    if (first.kind !== "delivered") throw new Error("Initial delivery failed")
    expect(first.delivery.content).toContain(
      'Primary = trojan, example.com, 443, password="password"',
    )
    expect(first.delivery.artifact).toMatchObject({
      nodeCount: 1,
      subscriptionVersion: 1,
      responseHeaders: { "subscription-userinfo": "upload=7; download=11" },
    })
    const stored = await repository.readSnapshot(record.id, "surge")
    expect(stored?.content).toBe(first.delivery.content)
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(first.delivery.content ?? ""),
    )
    const hex = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("")
    expect(first.delivery.artifact.etag).toBe(`"cuttle-v2-${hex}"`)

    vi.setSystemTime(NOW + 59999)
    expect(await service.deliver(token, undefined, first.delivery.artifact.etag)).toMatchObject({
      kind: "delivered",
      delivery: { content: null, stale: false },
    })
    expect(fetcher).toHaveBeenCalledOnce()
    vi.setSystemTime(NOW + 60000)
    const refreshed = await service.deliver(token, undefined, first.delivery.artifact.etag)
    expect(refreshed).toMatchObject({ kind: "delivered", delivery: { stale: false } })
    if (refreshed.kind !== "delivered") throw new Error("Refresh failed")
    expect(refreshed.delivery.content).toContain("Updated = trojan")
    expect(refreshed.delivery.artifact.etag).not.toBe(first.delivery.artifact.etag)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  test("serves same-version stale output on upstream failure, but refuses it after seven days", async () => {
    const { record, token } = await seededRemote()
    upstream(NODE_URI)
    const first = await service.deliver(token)
    if (first.kind !== "delivered") throw new Error("Initial delivery failed")
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(null, { status: 503 })))
    vi.setSystemTime(NOW + 60000)
    expect(await service.deliver(token)).toMatchObject({
      kind: "delivered",
      delivery: { content: first.delivery.content, stale: true },
    })
    expect(await repository.findById(record.id)).toMatchObject({
      lastError: expect.stringContaining("503"),
    })
    vi.setSystemTime(NOW + 7 * 24 * 60 * 60 * 1000)
    expect(await service.deliver(token)).toMatchObject({ kind: "unavailable" })
  })

  test("a retained old-version artifact cannot serve as fallback", async () => {
    const { record, token } = await seededRemote()
    upstream(NODE_URI)
    expect(await service.deliver(token)).toMatchObject({ kind: "delivered" })
    // Simulate a legacy cache left behind by an edit. The normal update path deletes it, which
    // would leave this test unable to exercise version isolation on an existing artifact.
    await env.DB.prepare("UPDATE subscriptions SET version = 2, processors_json = ? WHERE id = ?")
      .bind(JSON.stringify([{ type: "filter", pattern: "blocked" }]), record.id)
      .run()
    vi.setSystemTime(NOW + 60000)
    vi.stubGlobal("fetch", () => Promise.resolve(new Response(null, { status: 503 })))
    expect(await service.deliver(token)).toMatchObject({ kind: "unavailable" })
    const retained = await repository.readSnapshot(record.id, "surge")
    expect(retained).toMatchObject({
      subscriptionVersion: 1,
      content: expect.stringContaining("Primary = trojan"),
    })
  })

  test.each([false, true])(
    "rebuilds a missing cache body with conditional request=%s",
    async (conditional) => {
      const { record, token } = await seededRemote()
      upstream(NODE_URI, NODE_URI.replace("Primary", "Recovered"))
      const first = await service.deliver(token)
      if (first.kind !== "delivered") throw new Error("Initial delivery failed")
      await env.DB.prepare("DELETE FROM compiled_artifact_chunks WHERE subscription_id = ?")
        .bind(record.id)
        .run()
      const recovered = await service.deliver(
        token,
        undefined,
        conditional ? first.delivery.artifact.etag : undefined,
      )
      if (recovered.kind !== "delivered") throw new Error("Cache recovery failed")
      expect(recovered.delivery.content).toContain("Recovered = trojan")
      const stored = await repository.readSnapshot(record.id, "surge")
      expect(stored?.content).toBe(recovered.delivery.content)
      expect(recovered.delivery.artifact.etag).not.toBe(first.delivery.artifact.etag)
    },
  )

  test("a cache write failure does not discard a successfully compiled response", async () => {
    const { record, token } = await store.seed()
    await env.DB.prepare(`CREATE TRIGGER fail_artifact_write BEFORE INSERT ON compiled_artifacts
      BEGIN SELECT RAISE(ABORT, 'injected cache failure'); END`).run()
    try {
      const outcome = await service.deliver(token)
      if (outcome.kind !== "delivered")
        throw new Error("Compilation should survive a cache write failure")
      expect(outcome.delivery.content).toContain("Primary = trojan")
      expect(await repository.findArtifact(record.id, "surge", record.version)).toBeNull()
    } finally {
      await env.DB.prepare("DROP TRIGGER fail_artifact_write").run()
    }
  })

  test("does not publish an empty document when no node survives the rule chain", async () => {
    const { record, token } = await store.seed({
      processors: [{ type: "filter", pattern: "absent" }],
    })
    expect(await service.deliver(token)).toMatchObject({ kind: "unavailable" })
    expect(await repository.findArtifact(record.id, "surge", record.version)).toBeNull()
  })

  test("disabled or unknown credentials never fetch an upstream source", async () => {
    const { token } = await store.seed({
      enabled: false,
      source: { type: "remote", urls: [...remote.urls] },
    })
    const fetcher = upstream(NODE_URI)
    expect(await service.deliver(token)).toStrictEqual({ kind: "disabled" })
    expect(await service.deliver(crypto.randomUUID())).toStrictEqual({ kind: "not-found" })
    expect(await service.deliver("short")).toStrictEqual({ kind: "not-found" })
    expect(fetcher).not.toHaveBeenCalled()
  })

  test("a definition changed before source reading is retried with its new rules", async () => {
    const { record, token } = await store.seed()
    let changed = false
    class EditingRepository extends D1SubscriptionRepository {
      override async findSource(id: string, version: number) {
        if (!changed) {
          changed = true
          await repository.update(
            {
              ...record,
              version: 2,
              source: {
                type: "raw",
                content:
                  "trojan://public@example.com:443#Allowed\ntrojan://private@example.com:443#Secret",
              },
              processors: [{ type: "filter", pattern: "^Allowed$" }],
            },
            1,
          )
        }
        return super.findSource(id, version)
      }
    }
    const outcome = await new SubscriptionDelivery(new EditingRepository(env.DB)).deliver(token)
    if (outcome.kind !== "delivered") throw new Error("New definition should be delivered")
    expect(outcome.delivery.subscription.version).toBe(2)
    expect(outcome.delivery.artifact.subscriptionVersion).toBe(2)
    expect(outcome.delivery.content).toContain(
      'Allowed = trojan, example.com, 443, password="public"',
    )
    expect(outcome.delivery.content).not.toContain("private")
    expect(outcome.delivery.artifact.nodeCount).toBe(1)
  })

  test("an old token cannot read the new cached body between metadata and body reads", async () => {
    const { record, token } = await store.seed()
    await service.deliver(token)
    class RotatingRepository extends D1SubscriptionRepository {
      override async readArtifact(id: string, target: TargetId, version: number) {
        await repository.update(
          {
            ...record,
            version: 2,
            source: { type: "raw", content: "trojan://new-secret@example.com:443#New" },
          },
          1,
        )
        const newToken = crypto.randomUUID()
        await repository.rotateToken(id, newToken, "rotated", new Date().toISOString())
        await service.deliver(newToken)
        return super.readArtifact(id, target, version)
      }
    }
    const outcome = await new SubscriptionDelivery(new RotatingRepository(env.DB)).deliver(token)
    expect(outcome).toStrictEqual({ kind: "not-found" })
    const cached = await repository.readSnapshot(record.id, "surge")
    expect(cached?.content).toContain("new-secret")
  })

  test.each(["rotate", "disable", "delete"] as const)(
    "%s during upstream reading invalidates the in-flight origin response",
    async (action) => {
      const { record, token } = await seededRemote()
      let markStarted!: () => void
      const started = new Promise<void>((resolve) => {
        markStarted = resolve
      })
      let release!: (response: Response) => void
      const response = new Promise<Response>((resolve) => {
        release = resolve
      })
      vi.stubGlobal("fetch", () => {
        markStarted()
        return response
      })
      const pending = service.deliver(token)
      try {
        await started
        if (action === "rotate") {
          await repository.rotateToken(
            record.id,
            crypto.randomUUID(),
            "rotated",
            new Date().toISOString(),
          )
        } else if (action === "disable") {
          await repository.update({ ...record, enabled: false, version: 2 }, 1)
        } else {
          await repository.delete(record.id)
        }
      } finally {
        release(new Response(NODE_URI))
      }
      expect(await pending).toStrictEqual({ kind: action === "disable" ? "disabled" : "not-found" })
    },
  )

  test("an ETag hit is also rejected if its token rotated during the cache read", async () => {
    const { record, token } = await store.seed()
    const first = await service.deliver(token)
    if (first.kind !== "delivered") throw new Error("Missing initial artifact")
    class RotatingRepository extends D1SubscriptionRepository {
      override async findArtifact(id: string, target: TargetId, version: number) {
        const found = await super.findArtifact(id, target, version)
        await repository.rotateToken(id, crypto.randomUUID(), "rotated", new Date().toISOString())
        return found
      }
    }
    expect(
      await new SubscriptionDelivery(new RotatingRepository(env.DB)).deliver(
        token,
        undefined,
        first.delivery.artifact.etag,
      ),
    ).toStrictEqual({ kind: "not-found" })
    expect(await repository.findById(record.id)).not.toBeNull()
  })

  test("continually changing definitions stop after the one permitted retry", async () => {
    const { record, token } = await store.seed()
    let changes = 0
    class EditingRepository extends D1SubscriptionRepository {
      override async findSource(id: string, version: number) {
        changes += 1
        await repository.update({ ...record, version: changes + 1 }, changes)
        return super.findSource(id, version)
      }
    }
    const outcome = await new SubscriptionDelivery(new EditingRepository(env.DB)).deliver(token)
    expect(outcome).toMatchObject({ kind: "unavailable" })
    expect(changes).toBe(2)
    expect(await repository.readSnapshot(record.id, "surge")).toBeNull()
  })

  test.each([0, 60000])(
    "old output at age %s cannot bypass new capability checks or serve as fallback",
    async (age) => {
      const { record, token } = await store.seed({
        defaultTarget: "uri",
        source: {
          type: "raw",
          content: JSON.stringify({
            proxies: [
              {
                name: "Secure",
                type: "socks5-tls",
                server: "example.com",
                port: 443,
                username: "user",
                password: "secret",
              },
            ],
          }),
        },
      })
      const old = artifactFixture(record.id, {
        target: "uri",
        etag: `"cuttle-v1-${"a".repeat(64)}"`,
        content: "socks://dXNlcjpzZWNyZXQ=@example.com:443#Secure",
        createdAt: new Date(NOW - age).toISOString(),
      })
      await repository.saveArtifactIfCurrent(old, old.createdAt)
      expect(await service.deliver(token, undefined, old.etag)).toMatchObject({
        kind: "unavailable",
      })
    },
  )

  test("a legacy writer replacing a current cached body forces recompilation", async () => {
    const { record, token } = await store.seed()
    await service.deliver(token)
    class LegacyWriterRepository extends D1SubscriptionRepository {
      override async readArtifact(id: string, target: TargetId, version: number) {
        const old = artifactFixture(id, { content: "old serialization" })
        await repository.saveArtifactIfCurrent(old, old.createdAt)
        return super.readArtifact(id, target, version)
      }
    }
    const outcome = await new SubscriptionDelivery(new LegacyWriterRepository(env.DB)).deliver(
      token,
    )
    if (outcome.kind !== "delivered") throw new Error("Output should be rebuilt")
    expect(outcome.delivery.content).toContain(
      'Primary = trojan, example.com, 443, password="password"',
    )
    expect(outcome.delivery.artifact.etag).toMatch(/^"cuttle-v2-[a-f0-9]{64}"$/)
    expect(await repository.findById(record.id)).not.toBeNull()
  })
})
