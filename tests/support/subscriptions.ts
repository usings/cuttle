import type { DeliveryArtifact, SubscriptionRecord } from "@/core/subscriptions"
import { D1SubscriptionRepository } from "@/platform/d1/subscription-repository"

export const NODE_URI = "trojan://password@example.com:443#Primary"
export const NODE_LINE = 'Primary = trojan, example.com, 443, password="password", tls=true'

export function subscriptionFixture(
  overrides: Partial<SubscriptionRecord> = {},
): SubscriptionRecord {
  return {
    id: crypto.randomUUID(),
    tokenHint: "fixture",
    name: "Test subscription",
    source: { type: "raw", content: NODE_URI },
    defaultTarget: "surge",
    enabled: true,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

export function artifactFixture(
  subscriptionId: string,
  overrides: Partial<DeliveryArtifact> = {},
): DeliveryArtifact {
  return {
    subscriptionId,
    target: "surge",
    subscriptionVersion: 1,
    etag: '"fixture-etag"',
    nodeCount: 1,
    content: NODE_LINE,
    responseHeaders: { "subscription-userinfo": "upload=1" },
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  }
}

/** Each test owns its rows; cleanup leaves other test files and fixtures intact. */
export function subscriptionStore(database: D1Database) {
  const repository = new D1SubscriptionRepository(database)
  const owned = new Set<string>()
  return {
    repository,
    async seed(overrides: Partial<SubscriptionRecord> = {}) {
      const record = subscriptionFixture(overrides)
      const token = crypto.randomUUID()
      owned.add(record.id)
      await repository.create(record, token)
      return { record, token }
    },
    async cleanup() {
      await Promise.all([...owned].map((id) => repository.delete(id)))
      owned.clear()
    },
  }
}
