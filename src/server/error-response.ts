import { AdminFailure, INTERNAL_MESSAGE } from "@/shared/admin-error"
import type { AdminErrorCode } from "@/shared/admin-error"

const HTTP_STATUS: Record<AdminErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  not_found: 404,
  payload_too_large: 413,
  invalid_definition: 422,
  internal: 500,
  upstream_unavailable: 502,
}

export function jsonError(error: unknown, operation: string): Response {
  if (error instanceof AdminFailure) {
    const status = HTTP_STATUS[error.code]
    if (status >= 500) console.error(operation, error)
    return Response.json(
      { error: error.code === "internal" ? INTERNAL_MESSAGE : error.message, code: error.code },
      { status },
    )
  }

  console.error(operation, error)
  return Response.json({ error: INTERNAL_MESSAGE, code: "internal" }, { status: 500 })
}
