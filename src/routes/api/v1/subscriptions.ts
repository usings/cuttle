import { createFileRoute } from "@tanstack/react-router"
import { createSubscription, listSubscriptions } from "@/features/subscriptions/api/operations"
import { adminOnly } from "@/middleware/admin-only.server"
import { noStore } from "@/middleware/no-store.server"
import { jsonError } from "@/server/error-response"
import { readJsonBody } from "@/server/request-body"

export const Route = createFileRoute("/api/v1/subscriptions")({
  server: {
    middleware: [noStore, adminOnly],
    handlers: {
      GET: async () => {
        try {
          return Response.json(await listSubscriptions())
        } catch (error) {
          return jsonError(error, "list-subscriptions")
        }
      },
      POST: async ({ request }) => {
        try {
          const payload = await createSubscription({
            draft: await readJsonBody(request),
            origin: request.url,
          })
          return Response.json(payload, { status: 201 })
        } catch (error) {
          return jsonError(error, "create-subscription")
        }
      },
    },
  },
})
