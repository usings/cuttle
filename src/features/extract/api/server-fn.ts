import { createServerFn } from "@tanstack/react-start"
import { adminFunctionMiddleware } from "@/middleware/admin-function"
import * as operations from "./operations"

/**
 * The browser's side of the channel, mirroring `subscriptions/api/server-fn.ts`: the handler body
 * is stripped from the client build by the Start plugin, so importing server-only code here is
 * safe, and a stripping failure is a build-time error (`cloudflare:workers` unresolvable), not a
 * silent leak.
 */
export const readRemoteSource = createServerFn({ method: "POST" })
  .middleware([adminFunctionMiddleware])
  .validator((input: { urls: string[] }) => input)
  .handler(({ data }) => operations.readRemoteSource(data))
