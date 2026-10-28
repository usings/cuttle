import { describe, expect, test } from "vitest"
import type { TargetId } from "@/core/nodes"
import type { DeliveryResult } from "@/core/subscriptions"
import { deliveryResponse } from "@/server/delivery-response"
import { artifactFixture, NODE_LINE, subscriptionFixture } from "../support/subscriptions"

function delivery(overrides: Partial<DeliveryResult> = {}): DeliveryResult {
  const subscription = subscriptionFixture({ name: "my nodes" })
  return {
    subscription,
    artifact: artifactFixture(subscription.id),
    content: NODE_LINE,
    stale: false,
    ...overrides,
  }
}

const CACHE_POLICY = "public, max-age=60, stale-while-revalidate=300, stale-if-error=86400"

describe("subscriber HTTP responses", () => {
  test.each([
    ["surge", "text/plain; charset=utf-8", "conf"],
    ["mihomo", "text/yaml; charset=utf-8", "yaml"],
    ["sing-box", "application/json; charset=utf-8", "json"],
  ] satisfies Array<[TargetId, string, string]>)(
    "describes a %s document",
    async (target, mediaType, extension) => {
      const input = delivery()
      input.artifact.target = target
      const response = deliveryResponse(input)
      expect(response.status).toBe(200)
      expect(response.headers.get("Content-Type")).toBe(mediaType)
      expect(response.headers.get("Content-Disposition")).toBe(
        `inline; filename="my-nodes.${extension}"`,
      )
      expect(response.headers.get("X-Node-Count")).toBe("1")
      expect(await response.text()).toBe(NODE_LINE)
    },
  )

  test("sanitizes a Unicode or quoted filename before putting it in a header", () => {
    const input = delivery()
    input.subscription.name = '香港 "节点"'
    expect(deliveryResponse(input).headers.get("Content-Disposition")).toBe(
      'inline; filename="cuttle.conf"',
    )
  })

  test("a conditional response restates validators and cache policy without a document body", async () => {
    const response = deliveryResponse(delivery({ content: null }))
    expect(response.status).toBe(304)
    expect(await response.text()).toBe("")
    expect(response.headers.get("Content-Type")).toBeNull()
    expect(response.headers.get("X-Node-Count")).toBeNull()
    expect(response.headers.get("ETag")).toBe('"fixture-etag"')
    expect(response.headers.get("Cache-Control")).toBe(CACHE_POLICY)
    expect(response.headers.get("CDN-Cache-Control")).toBe(CACHE_POLICY)
  })

  test.each([false, true])(
    "stale=%s is observable alongside upstream traffic metadata",
    (stale) => {
      const response = deliveryResponse(delivery({ stale }))
      expect(response.headers.get("X-Cuttle-Stale")).toBe(stale ? "1" : "0")
      expect(response.headers.get("Warning")).toBe(stale ? '110 - "Response is stale"' : null)
      expect(response.headers.get("subscription-userinfo")).toBe("upload=1")
    },
  )
})
