import { TARGET_IDS } from "@/core/nodes"
import type { TargetId } from "@/core/nodes"
import { deliveryResponse } from "./delivery-response"
import { subscriptionDelivery } from "./subscription-services"

function text(status: number, message: string) {
  return new Response(message, {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  })
}

export async function serveSubscription(request: Request, token: string): Promise<Response> {
  const startedAt = Date.now()
  try {
    const requestedTarget = new URL(request.url).searchParams.get("target")
    if (requestedTarget && !TARGET_IDS.includes(requestedTarget as TargetId)) {
      return text(400, `Unsupported target: ${requestedTarget}`)
    }

    const outcome = await subscriptionDelivery().deliver(
      token,
      (requestedTarget as TargetId | null) ?? undefined,
      request.headers.get("If-None-Match"),
    )

    switch (outcome.kind) {
      case "not-found":
        return text(404, "Subscription not found")
      case "disabled":
        return text(410, "Subscription disabled")
      case "unavailable":
        console.error("Subscription unavailable", outcome.error)
        return text(502, "Subscription upstream unavailable")
      case "delivered": {
        const { delivery } = outcome
        console.info("Subscription delivered", {
          subscriptionId: delivery.subscription.id,
          target: delivery.artifact.target,
          nodeCount: delivery.artifact.nodeCount,
          stale: delivery.stale,
          durationMs: Date.now() - startedAt,
        })
        return deliveryResponse(delivery)
      }
    }
  } catch (error) {
    console.error("Unexpected subscription delivery failure", error)
    return text(500, "Internal server error")
  }
}
