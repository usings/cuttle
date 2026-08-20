import { createMiddleware } from "@tanstack/react-start"

/**
 * Management answers carry subscription data, and on creation and rotation the subscription token
 * itself; none of it may be held by a proxy or a browser cache. Stated once per route rather than
 * once per response, because the way that guarantee breaks is a handler added later whose author
 * did not know it existed.
 *
 * List it first. `next()` resolves after everything downstream has run, so the response it hands
 * back is whatever the route settled on — a handler's, or a middleware's own short-circuit, which
 * is why neither of those has to set the header itself. A handler that throws never reaches here,
 * but that answer comes from the framework and carries no subscription data to protect.
 */
export const noStore = createMiddleware({ type: "request" }).server(async ({ next }) => {
  const result = await next()
  result.response.headers.set("Cache-Control", "no-store")
  return result
})
