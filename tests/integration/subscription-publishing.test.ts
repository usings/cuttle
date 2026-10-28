import { env } from "cloudflare:workers"
import { afterEach, describe, expect, test } from "vitest"
import { ConflictError, ValidationError } from "@/core/errors"
import { SubscriptionPublishing } from "@/core/subscriptions"
import { D1SubscriptionRepository } from "@/platform/d1/subscription-repository"
import { artifactFixture, subscriptionStore } from "../support/subscriptions"

const store = subscriptionStore(env.DB)
const { repository } = store
const publishing = new SubscriptionPublishing(repository)
afterEach(() => store.cleanup())

describe("versioned subscription updates", () => {
  test("a stale writer preserves the winning metadata, source and artifact", async () => {
    const { record } = await store.seed()
    const source = { type: "raw", content: "trojan://winner@example.com:443#Winner" } as const
    await publishing.update(record.id, { name: "winner", source, expectedVersion: 1 })
    const cached = artifactFixture(record.id, {
      subscriptionVersion: 2,
      content: "winner artifact",
    })
    await repository.saveArtifactIfCurrent(cached, cached.createdAt)
    expect(await repository.update({ ...record, name: "loser", version: 2 }, 1)).toBe("conflict")
    expect(await repository.findById(record.id)).toMatchObject({
      name: "winner",
      version: 2,
      source,
    })
    expect(await repository.readSnapshot(record.id, "surge")).toStrictEqual(cached)
    await expect(
      publishing.update(record.id, { name: "stale form", expectedVersion: 1 }),
    ).rejects.toBeInstanceOf(ConflictError)
    expect(await repository.findById(record.id)).toMatchObject({
      name: "winner",
      version: 2,
      source,
    })
  })

  test("concurrent publishers cannot both consume the same version", async () => {
    const { record } = await store.seed()
    let release: () => void
    const bothRead = new Promise<void>((resolve) => {
      release = resolve
    })
    let readers = 0
    class ConcurrentRepository extends D1SubscriptionRepository {
      override async findById(id: string) {
        const found = await super.findById(id)
        readers += 1
        if (readers === 2) release()
        await bothRead
        return found
      }
    }
    const service = new SubscriptionPublishing(new ConcurrentRepository(env.DB))
    const outcomes = await Promise.allSettled([
      service.update(record.id, { name: "new name" }),
      service.update(record.id, { enabled: false }),
    ])
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1)
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected")
    expect(rejected).toHaveLength(1)
    expect(rejected[0].reason).toBeInstanceOf(ConflictError)
    const saved = await repository.findById(record.id)
    expect(saved?.version).toBe(2)
    expect([saved?.name === "new name", saved?.enabled === false].filter(Boolean)).toHaveLength(1)
  })

  test("a subscription removed after being read is not recreated by an update", async () => {
    const { record } = await store.seed()
    await repository.delete(record.id)
    expect(await repository.update({ ...record, version: 2 }, 1)).toBe("not-found")
    expect(await repository.findById(record.id)).toBeNull()
    expect(await repository.findSource(record.id, record.version)).toBeNull()
  })

  test.each([0, -1, 1.5, "1", null])(
    "rejects invalid version %s without changing stored data",
    async (expectedVersion) => {
      const { record } = await store.seed()
      await expect(
        publishing.update(record.id, { name: "changed", expectedVersion }),
      ).rejects.toBeInstanceOf(ValidationError)
      expect(await repository.findById(record.id)).toMatchObject({ name: record.name, version: 1 })
    },
  )
})
