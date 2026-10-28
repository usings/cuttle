import { applyD1Migrations } from "cloudflare:test"
import { beforeEach, describe, expect, test } from "vitest"
import { hashToken, SubscriptionDelivery } from "@/core/subscriptions"
import { D1SubscriptionRepository } from "@/platform/d1/subscription-repository"
import { migration, testEnv } from "../support/migrations"
import { NODE_LINE, NODE_URI } from "../support/subscriptions"

const database = testEnv.MIGRATION_DB
const initial = migration("0001_create_schema.sql")
const upgrade = migration("0002_update_subscriptions.sql")
const repository = new D1SubscriptionRepository(database)

beforeEach(async () => {
  await database.batch(
    [
      "compiled_artifact_chunks",
      "compiled_artifacts",
      "subscription_source_chunks",
      "subscriptions",
      "d1_migrations",
    ].map((table) => database.prepare(`DROP TABLE IF EXISTS ${table}`)),
  )
  await applyD1Migrations(database, [initial])
})

async function legacySubscription(target: string, cachedTarget = target) {
  const id = crypto.randomUUID()
  const token = crypto.randomUUID()
  const source = { type: "raw", content: NODE_URI }
  await database.batch([
    database
      .prepare(`INSERT INTO subscriptions
      (id, token_hash, token_hint, name, source_type, default_target, processors_json, enabled, version, created_at, updated_at)
      VALUES (?, ?, ?, 'Legacy', 'raw', ?, '[{"type":"rename","pattern":"Primary","replacement":"Migrated"}]', 1, 7, '2026-01-01', '2026-01-01')`)
      .bind(id, await hashToken(token), token.slice(-8), target),
    database
      .prepare("INSERT INTO subscription_source_chunks VALUES (?, 0, ?)")
      .bind(id, JSON.stringify(source)),
    database
      .prepare("INSERT INTO compiled_artifacts VALUES (?, ?, 7, '\"old\"', 1, '{}', '2026-01-01')")
      .bind(id, cachedTarget),
    database
      .prepare("INSERT INTO compiled_artifact_chunks VALUES (?, ?, 0, ?)")
      .bind(id, cachedTarget, NODE_LINE),
  ])
  return { id, token, source }
}

function storedTarget(id: string) {
  return database
    .prepare("SELECT default_target, version FROM subscriptions WHERE id = ?")
    .bind(id)
    .first<{ default_target: string; version: number }>()
}

async function cachedRows(id: string) {
  const row = await database
    .prepare("SELECT count(*) AS n FROM compiled_artifacts WHERE subscription_id = ?")
    .bind(id)
    .first<{ n: number }>()
  return row?.n
}

describe("upgrading an existing version 0001 database", () => {
  test("preserves credentials and sources, replaces retired targets, and leaves other subscriptions intact", async () => {
    const [surge, rocket, unchanged] = await Promise.all([
      legacySubscription("surge-mac", "surge"),
      legacySubscription("shadowrocket"),
      legacySubscription("surge"),
    ])
    await applyD1Migrations(database, [initial, upgrade])
    expect(await storedTarget(surge.id)).toStrictEqual({ default_target: "surge", version: 8 })
    expect(await storedTarget(rocket.id)).toStrictEqual({ default_target: "v2ray", version: 8 })
    expect(await storedTarget(unchanged.id)).toStrictEqual({ default_target: "surge", version: 7 })
    expect(await cachedRows(surge.id)).toBe(0)
    expect(await cachedRows(rocket.id)).toBe(0)
    expect(await cachedRows(unchanged.id)).toBe(1)
    const service = new SubscriptionDelivery(repository)
    const deliveries = await Promise.all([
      service.deliver(surge.token),
      service.deliver(rocket.token),
    ])
    expect(deliveries.map((delivery) => delivery.kind)).toStrictEqual(["delivered", "delivered"])
    for (const legacy of [surge, rocket, unchanged]) {
      // oxlint-disable-next-line no-await-in-loop -- Verify each fixture against its own identity.
      expect(await repository.findById(legacy.id)).toMatchObject({
        source: legacy.source,
        processors: [{ type: "rename", pattern: "Primary", replacement: "Migrated" }],
        enabled: true,
      })
    }
    const current = await repository.findById(surge.id)
    if (!current) throw new Error("Migrated subscription disappeared")
    expect(await repository.update({ ...current, name: "winner", version: 9 }, 8)).toBe("updated")
    expect(await repository.update({ ...current, name: "loser", version: 9 }, 8)).toBe("conflict")
    await applyD1Migrations(database, [initial, upgrade])
    expect(await storedTarget(surge.id)).toStrictEqual({ default_target: "surge", version: 9 })
  })

  test("rolls back a failed upgrade and can retry without losing old data", async () => {
    const legacy = await legacySubscription("surge-mac")
    await database
      .prepare(`CREATE TRIGGER fail_upgrade BEFORE UPDATE OF default_target ON subscriptions
      BEGIN SELECT RAISE(ABORT, 'injected upgrade failure'); END`)
      .run()
    await expect(applyD1Migrations(database, [initial, upgrade])).rejects.toThrow(
      "injected upgrade failure",
    )
    expect(await storedTarget(legacy.id)).toStrictEqual({ default_target: "surge-mac", version: 7 })
    expect(await cachedRows(legacy.id)).toBe(1)
    await database.prepare("DROP TRIGGER fail_upgrade").run()
    await applyD1Migrations(database, [initial, upgrade])
    expect(await storedTarget(legacy.id)).toStrictEqual({ default_target: "surge", version: 8 })
    expect(await repository.findMetadataByToken(legacy.token)).toMatchObject({ id: legacy.id })
    expect(await repository.findSource(legacy.id, 8)).toStrictEqual(legacy.source)
  })
})
