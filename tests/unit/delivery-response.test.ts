import { describe, expect, test } from "vitest"
import { targetDefinition } from "@/core/nodes"
import type { DeliveryResult } from "@/core/subscriptions"
import { deliveryResponse } from "@/server/delivery-response"

/**
 * The media type and the file extension a subscriber is served come from the target definition and
 * from nowhere else. There is no column left to store them in, so this is the whole of that promise:
 * change what a client's documents are, and every already-compiled artifact is described the new way
 * on its next delivery rather than keeping the media type it was written under.
 */
function delivery(overrides: Partial<DeliveryResult> = {}): DeliveryResult {
  return {
    subscription: {
      id: "s",
      tokenHint: "hint",
      name: "my nodes",
      defaultTarget: "mihomo",
      enabled: true,
      version: 1,
      createdAt: "2026-08-18T00:00:00.000Z",
      updatedAt: "2026-08-18T00:00:00.000Z",
    },
    artifact: {
      subscriptionId: "s",
      target: "mihomo",
      subscriptionVersion: 1,
      etag: '"etag"',
      nodeCount: 3,
      responseHeaders: {},
      createdAt: "2026-08-18T00:00:00.000Z",
    },
    content: "proxies: []\n",
    stale: false,
    ...overrides,
  }
}

describe("what a delivered subscription says about itself", () => {
  test("the media type and the extension are the target's, not the artifact's", () => {
    const definition = targetDefinition("mihomo")

    const response = deliveryResponse(delivery())

    expect(response.headers.get("Content-Type")).toBe(definition.contentType)
    expect(response.headers.get("Content-Disposition")).toBe(
      `inline; filename="my-nodes.${definition.fileExtension}"`,
    )
  })

  test("the filename is stripped of anything a header cannot carry", () => {
    const response = deliveryResponse(
      delivery({ subscription: { ...delivery().subscription, name: '香港 "节点"' } }),
    )

    expect(response.headers.get("Content-Disposition")).toBe('inline; filename="cuttle.yaml"')
  })

  test("a caller that already holds the artifact gets no body and no media type", () => {
    // A 304 restates cache policy — validator headers replace the stored ones — but describes no
    // document, because it is not sending one.
    const response = deliveryResponse(delivery({ content: null }))

    expect(response.status).toBe(304)
    expect(response.headers.get("Content-Type")).toBeNull()
    expect(response.headers.get("ETag")).toBe('"etag"')
  })

  test("the upstream's own traffic metadata is forwarded unchanged", () => {
    const response = deliveryResponse(
      delivery({
        artifact: {
          ...delivery().artifact,
          responseHeaders: { "subscription-userinfo": "upload=0; download=1" },
        },
      }),
    )

    expect(response.headers.get("subscription-userinfo")).toBe("upload=0; download=1")
  })
})
