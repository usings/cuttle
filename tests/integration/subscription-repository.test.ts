import { env } from "cloudflare:workers"
import { afterEach, describe, expect, test } from "vitest"
import { artifactFixture, NODE_URI, subscriptionStore } from "../support/subscriptions"

const store = subscriptionStore(env.DB)
const { repository } = store

afterEach(() => store.cleanup())

describe("persisted subscription and artifact contracts", () => {
  test.each([
    ["short ASCII", "small content"],
    ["large ordered Unicode", `${"甲".repeat(131071)}😀${"乙".repeat(140000)}尾`],
  ])("preserves %s sources and artifacts through D1", async (_name, content) => {
    const { record, token } = await store.seed({ source: { type: "raw", content } })
    const saved = artifactFixture(record.id, { content })
    await repository.saveArtifactIfCurrent(saved, saved.createdAt)
    const found = await repository.findById(record.id)
    expect(found?.source).toStrictEqual({ type: "raw", content })
    expect(await repository.findSource(record.id, record.version)).toStrictEqual({
      type: "raw",
      content,
    })
    expect(await repository.readSnapshot(record.id, "surge")).toStrictEqual(saved)
    expect(await repository.findMetadataByToken(token)).toMatchObject({ id: record.id, version: 1 })
    expect(await repository.findMetadataByToken("unrelated credential")).toBeNull()
  })

  test("replacing a large source invalidates all previously compiled output", async () => {
    const { record } = await store.seed({ source: { type: "raw", content: "old".repeat(100000) } })
    await repository.saveArtifactIfCurrent(artifactFixture(record.id), record.createdAt)
    await repository.saveArtifactIfCurrent(
      artifactFixture(record.id, { target: "uri" }),
      record.createdAt,
    )
    expect(
      await repository.update(
        { ...record, version: 2, source: { type: "raw", content: NODE_URI } },
        1,
      ),
    ).toBe("updated")
    expect(await repository.findSource(record.id, 1)).toBeNull()
    expect(await repository.findSource(record.id, 2)).toStrictEqual({
      type: "raw",
      content: NODE_URI,
    })
    const removed = await env.DB.batch([
      env.DB.prepare("SELECT count(*) AS n FROM compiled_artifacts WHERE subscription_id = ?").bind(
        record.id,
      ),
      env.DB.prepare(
        "SELECT count(*) AS n FROM compiled_artifact_chunks WHERE subscription_id = ?",
      ).bind(record.id),
    ])
    expect(removed.map((result) => result.results)).toStrictEqual([[{ n: 0 }], [{ n: 0 }]])
  })

  test("a late compilation cannot overwrite the current version's artifact", async () => {
    const { record } = await store.seed({ version: 2 })
    const current = artifactFixture(record.id, { subscriptionVersion: 2, content: "current" })
    await repository.saveArtifactIfCurrent(current, current.createdAt)
    await repository.saveArtifactIfCurrent(
      artifactFixture(record.id, { content: "obsolete" }),
      record.createdAt,
    )
    expect(await repository.readSnapshot(record.id, "surge")).toStrictEqual(current)
  })

  test("a missing cache body is recoverable as a cache miss", async () => {
    const { record } = await store.seed()
    await repository.saveArtifactIfCurrent(artifactFixture(record.id), record.createdAt)
    await env.DB.prepare("DELETE FROM compiled_artifact_chunks WHERE subscription_id = ?")
      .bind(record.id)
      .run()
    expect(await repository.readSnapshot(record.id, "surge")).toBeNull()
  })

  test("rotation replaces only the credential; deletion removes the subscription's stored data", async () => {
    const { record, token } = await store.seed()
    await repository.saveArtifactIfCurrent(artifactFixture(record.id), record.createdAt)
    const rotated = crypto.randomUUID()
    expect(
      await repository.rotateToken(record.id, rotated, rotated.slice(-8), record.updatedAt),
    ).toBe(true)
    expect(await repository.findMetadataByToken(token)).toBeNull()
    expect(await repository.findMetadataByToken(rotated)).toMatchObject({
      id: record.id,
      version: 1,
    })
    expect(await repository.findSource(record.id, record.version)).toStrictEqual(record.source)
    expect(await repository.delete(record.id)).toBe(true)
    expect(await repository.findById(record.id)).toBeNull()
    expect(await repository.findSource(record.id, record.version)).toBeNull()
    expect(await repository.readSnapshot(record.id, "surge")).toBeNull()
    expect(await repository.findMetadataByToken(rotated)).toBeNull()
    expect(await repository.delete(record.id)).toBe(false)
  })
})
