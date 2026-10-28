import { expect, test as base } from "@playwright/test"
import { adminToken } from "./admin-token"

export const adminHeaders = { Authorization: `Bearer ${adminToken()}` }

interface SubscriptionFixture {
  id: string
  url: string
}

export const test = base.extend<{ subscription: SubscriptionFixture }>({
  subscription: async ({ request }, provide, info) => {
    const response = await request.post("/api/v1/subscriptions", {
      headers: adminHeaders,
      data: {
        name: `e2e-${info.testId}`,
        source: { type: "raw", content: "trojan://password@example.com:443#Primary" },
        defaultTarget: "surge",
        enabled: true,
      },
    })
    expect(response.status()).toBe(201)
    const payload = await response.json()
    try {
      await provide({ id: payload.subscription.id, url: payload.url })
    } finally {
      const removed = await request.delete(`/api/v1/subscriptions/${payload.subscription.id}`, {
        headers: adminHeaders,
      })
      expect([204, 404]).toContain(removed.status())
    }
  },
})
