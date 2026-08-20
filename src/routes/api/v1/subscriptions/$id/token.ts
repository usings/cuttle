import { createFileRoute } from "@tanstack/react-router"
import { rotateSubscriptionToken } from "@/features/subscriptions/api/operations"
import { jsonError } from "@/server/error-response"

// Same reasoning as `../$id.ts`: this route inherits `noStore` and `adminOnly` from
// `/api/v1/subscriptions` through the generated route tree and must not redeclare them.
export const Route = createFileRoute("/api/v1/subscriptions/$id/token")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        try {
          const payload = await rotateSubscriptionToken({
            id: params.id,
            origin: request.url,
          })
          return Response.json(payload)
        } catch (error) {
          return jsonError(error, "rotate-subscription-token")
        }
      },
    },
  },
})
