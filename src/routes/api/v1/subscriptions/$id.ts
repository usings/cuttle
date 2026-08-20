import { createFileRoute } from "@tanstack/react-router"
import {
  getSubscription,
  removeSubscription,
  updateSubscription,
} from "@/features/subscriptions/api/operations"
import { jsonError } from "@/server/error-response"
import { readJsonBody } from "@/server/request-body"

/**
 * No `server.middleware` here on purpose. This route is a child of `/api/v1/subscriptions` in the
 * generated route tree, and the framework composes `server.middleware` from every matched ancestor,
 * so `noStore` and `adminOnly` already reach every request here. Declaring them again would not add
 * a layer of safety — it would only run the same authorization twice.
 *
 * Nothing pins that inheritance. Detaching this route from its parent, or the parent dropping either
 * middleware, would leave a management route unauthenticated with nothing here saying so.
 */
export const Route = createFileRoute("/api/v1/subscriptions/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          return Response.json(await getSubscription({ id: params.id }))
        } catch (error) {
          return jsonError(error, "get-subscription")
        }
      },
      PATCH: async ({ params, request }) => {
        try {
          const payload = await updateSubscription({
            id: params.id,
            patch: await readJsonBody(request),
          })
          return Response.json(payload)
        } catch (error) {
          return jsonError(error, "update-subscription")
        }
      },
      DELETE: async ({ params }) => {
        try {
          await removeSubscription({ id: params.id })
          return new Response(null, { status: 204 })
        } catch (error) {
          return jsonError(error, "remove-subscription")
        }
      },
    },
  },
})
