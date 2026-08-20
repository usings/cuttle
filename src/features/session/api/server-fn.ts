import { createServerFn } from "@tanstack/react-start"
import { adminFunctionMiddleware } from "@/middleware/admin-function"

/**
 * The endpoint is its middleware. Reaching the handler at all is what a working key means, so this
 * reads nothing and answers with nothing — proving a session is not an excuse to fetch a page's
 * data from a page that is not open.
 *
 * A value still has to come back: `undefined` is what TanStack Query treats as a failed query.
 */
export const probeSession = createServerFn({ method: "POST" })
  .middleware([adminFunctionMiddleware])
  .handler(() => ({ ok: true }))
