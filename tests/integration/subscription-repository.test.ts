import { env } from "cloudflare:workers"
import { describe, expect, test } from "vitest"
import type { DeliveryArtifact, SubscriptionRecord, SubscriptionSource } from "@/core/subscriptions"
import { D1SubscriptionRepository } from "@/platform/d1/subscription-repository"

const TARGET = "clash"

// Storage is shared across the tests in this file, so every case owns a distinct subscription.
function subscription(id: string, overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    id,
    tokenHint: "wxyz",
    name: "primary",
    source: { type: "remote", urls: ["https://example.com/sub?token=upstream-secret"] },
    defaultTarget: TARGET,
    enabled: true,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

function artifact(
  subscriptionId: string,
  overrides: Partial<DeliveryArtifact> = {},
): DeliveryArtifact {
  return {
    subscriptionId,
    target: TARGET,
    subscriptionVersion: 1,
    etag: '"v1"',
    nodeCount: 3,
    responseHeaders: { "subscription-userinfo": "upload=1" },
    createdAt: "2026-01-01T00:00:00.000Z",
    content: "proxies: []\n",
    ...overrides,
  }
}

async function seeded(id: string, overrides: Partial<SubscriptionRecord> = {}) {
  const repository = new D1SubscriptionRepository(env.DB)
  const record = subscription(id, overrides)
  await repository.create(record, `token-for-${id}`)
  return { repository, record }
}

function countRows(table: string, subscriptionId: string) {
  return env.DB.prepare(`SELECT count(*) AS n FROM ${table} WHERE subscription_id = ?`)
    .bind(subscriptionId)
    .first<{ n: number }>()
    .then((row) => row?.n ?? 0)
}

function storedContent(table: string, subscriptionId: string) {
  return env.DB.prepare(
    `SELECT content FROM ${table} WHERE subscription_id = ? AND chunk_index = 0`,
  )
    .bind(subscriptionId)
    .first<{ content: string }>()
    .then((row) => row?.content)
}

describe("the subscription source in D1", () => {
  test("a created subscription reads its source back", async () => {
    const { repository, record } = await seeded("sub-read")

    const found = await repository.findById(record.id)
    expect(found?.source).toStrictEqual(record.source)
    expect(await repository.findSource(record.id)).toStrictEqual(record.source)
  })

  test("the stored column holds the source verbatim", async () => {
    const { record } = await seeded("sub-verbatim")

    expect(await storedContent("subscription_source_chunks", record.id)).toBe(
      JSON.stringify(record.source),
    )
  })

  test("a source larger than one column spans rows and rejoins", async () => {
    const source: SubscriptionSource = { type: "raw", content: "x".repeat(200_000) }
    const { repository, record } = await seeded("sub-large", { source })

    expect(await countRows("subscription_source_chunks", record.id)).toBeGreaterThan(1)
    expect(await repository.findSource(record.id)).toStrictEqual(source)
  })

  test("an update replaces the previous rows instead of appending to them", async () => {
    const { repository } = await seeded("sub-update", {
      source: { type: "raw", content: "y".repeat(200_000) },
    })
    const replaced = subscription("sub-update", {
      source: { type: "raw", content: "short" },
      version: 2,
      updatedAt: "2026-01-02T00:00:00.000Z",
    })
    await repository.update(replaced)

    expect(await countRows("subscription_source_chunks", replaced.id)).toBe(1)
    expect(await repository.findSource(replaced.id)).toStrictEqual(replaced.source)
  })
})

describe("the compiled artifact cache in D1", () => {
  test("a saved artifact reads its body back", async () => {
    const { repository, record } = await seeded("sub-artifact")
    const cached = artifact(record.id)
    await repository.saveArtifactIfCurrent(cached, "2026-01-01T00:00:01.000Z")

    const read = await repository.readArtifact(record.id, TARGET)
    expect(read?.content).toBe(cached.content)
    expect(read?.nodeCount).toBe(cached.nodeCount)
    expect(read?.etag).toBe(cached.etag)
  })

  test("the stored column holds the body verbatim", async () => {
    const { repository, record } = await seeded("sub-body")
    const cached = artifact(record.id)
    await repository.saveArtifactIfCurrent(cached, "2026-01-01T00:00:01.000Z")

    expect(await storedContent("compiled_artifact_chunks", record.id)).toBe(cached.content)
  })

  test("a body larger than one column spans rows and rejoins", async () => {
    const { repository, record } = await seeded("sub-large-body")
    const cached = artifact(record.id, { content: "z".repeat(200_000) })
    await repository.saveArtifactIfCurrent(cached, "2026-01-01T00:00:01.000Z")

    expect(await countRows("compiled_artifact_chunks", record.id)).toBeGreaterThan(1)
    const read = await repository.readArtifact(record.id, TARGET)
    expect(read?.content).toBe(cached.content)
  })

  test("metadata left without a body is a cache miss, not a failure", async () => {
    const { repository, record } = await seeded("sub-cache-miss")
    await repository.saveArtifactIfCurrent(artifact(record.id), "2026-01-01T00:00:01.000Z")
    await env.DB.prepare("DELETE FROM compiled_artifact_chunks WHERE subscription_id = ?")
      .bind(record.id)
      .run()

    expect(await repository.readArtifact(record.id, TARGET)).toBeNull()
    expect(await repository.findArtifact(record.id, TARGET)).not.toBeNull()
  })

  test("an artifact for a superseded version is not written", async () => {
    const { repository, record } = await seeded("sub-stale", { version: 2 })
    await repository.saveArtifactIfCurrent(
      artifact(record.id, { subscriptionVersion: 1 }),
      "2026-01-01T00:00:01.000Z",
    )

    expect(await repository.readArtifact(record.id, TARGET)).toBeNull()
    expect(await countRows("compiled_artifact_chunks", record.id)).toBe(0)
  })
})
