import { createFileRoute } from "@tanstack/react-router"
import { serveSubscription } from "@/server/serve-subscription"

export const Route = createFileRoute("/subscribe/$token")({
  server: {
    handlers: {
      GET: ({ params, request }) => serveSubscription(request, params.token),
    },
  },
})
