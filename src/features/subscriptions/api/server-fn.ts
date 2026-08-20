import { createServerFn } from "@tanstack/react-start"
import { getRequest } from "@tanstack/react-start/server"
import { adminFunctionMiddleware } from "@/middleware/admin-function"
import * as operations from "./operations"

/**
 * The browser's side of the channel. Return types are inferred from `operations`'s own signatures, so
 * a call site writes no path, unwraps no envelope and asserts nothing about the response shape.
 *
 * The handler bodies are stripped from the client build by the Start plugin, which is what makes
 * importing server-only code here safe. A stripping failure is a build-time error (`cloudflare:workers`
 * unresolvable), not a silent leak.
 *
 * `.validator()` rather than `.inputValidator()`: the latter is marked `@deprecated` in the installed
 * version and behaves identically.
 *
 * A handler's ctx (`ServerFnCtx`) carries no `request` — that field belongs to `type: "request"`
 * middleware alone — so `origin` comes from `getRequest().url`. `new URL(path, origin)` reads only the
 * scheme and host, and `/_serverFn/*` is same-origin with the page, so which request's url it came
 * from cannot change the result.
 */
export const listSubscriptions = createServerFn({ method: "POST" })
  .middleware([adminFunctionMiddleware])
  .handler(() => operations.listSubscriptions())

export const getSubscription = createServerFn({ method: "POST" })
  .middleware([adminFunctionMiddleware])
  .validator((input: { id: string }) => input)
  .handler(({ data }) => operations.getSubscription(data))

export const createSubscription = createServerFn({ method: "POST" })
  .middleware([adminFunctionMiddleware])
  .validator((input: { draft: unknown }) => input)
  .handler(({ data }) =>
    operations.createSubscription({ draft: data.draft, origin: getRequest().url }),
  )

export const updateSubscription = createServerFn({ method: "POST" })
  .middleware([adminFunctionMiddleware])
  .validator((input: { id: string; patch: unknown }) => input)
  .handler(({ data }) => operations.updateSubscription(data))

export const readSubscriptionSnapshot = createServerFn({ method: "POST" })
  .middleware([adminFunctionMiddleware])
  .validator((input: { id: string; target: string }) => input)
  .handler(({ data }) => operations.readSubscriptionSnapshot(data))

export const removeSubscription = createServerFn({ method: "POST" })
  .middleware([adminFunctionMiddleware])
  .validator((input: { id: string }) => input)
  .handler(({ data }) => operations.removeSubscription(data))

export const rotateSubscriptionToken = createServerFn({ method: "POST" })
  .middleware([adminFunctionMiddleware])
  .validator((input: { id: string }) => input)
  .handler(({ data }) =>
    operations.rotateSubscriptionToken({ id: data.id, origin: getRequest().url }),
  )
