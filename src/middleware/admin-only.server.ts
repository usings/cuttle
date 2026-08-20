import { createMiddleware } from "@tanstack/react-start"
import { authorizeAdminRequest } from "@/server/admin-auth"
import { jsonError } from "@/server/error-response"
import { AdminFailure, UNAUTHORIZED_MESSAGE } from "@/shared/admin-error"

export const adminOnly = createMiddleware({ type: "request" }).server(async ({ next, request }) => {
  let result: Awaited<ReturnType<typeof authorizeAdminRequest>>
  try {
    result = await authorizeAdminRequest(request)
  } catch (error) {
    return jsonError(error, "authorize-admin-request")
  }
  if (result === "authorized") return next()
  return jsonError(
    new AdminFailure("unauthorized", UNAUTHORIZED_MESSAGE),
    "authorize-admin-request",
  )
})
