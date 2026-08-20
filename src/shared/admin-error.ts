export const ADMIN_ERROR_CODES = [
  "invalid_request",
  "unauthorized",
  "not_found",
  "payload_too_large",
  "invalid_definition",
  "upstream_unavailable",
  "internal",
] as const

export type AdminErrorCode = (typeof ADMIN_ERROR_CODES)[number]

/**
 * The two answers neither door may vary. `internal` never states what actually broke — that goes to
 * the log — and `unauthorized` never says why, so a caller cannot probe for the reason. Both doors
 * (`middleware/admin-only.server.ts` for `/api/v1/*`, `middleware/admin-function.ts` for the server
 * function channel) read them from here rather than each spelling them out.
 */
export const INTERNAL_MESSAGE = "Internal server error."
export const UNAUTHORIZED_MESSAGE = "Unauthorized."

export class AdminFailure extends Error {
  constructor(
    readonly code: AdminErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = "AdminFailure"
  }
}
