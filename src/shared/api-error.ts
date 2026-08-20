import { ADMIN_ERROR_CODES } from "@/shared/admin-error"
import type { AdminErrorCode } from "@/shared/admin-error"

export class ApiError extends Error {
  constructor(
    readonly code: AdminErrorCode,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

function isErrorCode(value: unknown): value is AdminErrorCode {
  return typeof value === "string" && (ADMIN_ERROR_CODES as readonly string[]).includes(value)
}

// TanStack serializes server-function errors as message only, so the code travels in that message.
const CODE_SEPARATOR = "\u0000"

export function messageWithCode(code: AdminErrorCode, message: string) {
  return `${code}${CODE_SEPARATOR}${message}`
}

export function apiErrorFromMessage(error: unknown): unknown {
  if (error instanceof ApiError || !(error instanceof Error)) return error
  const separator = error.message.indexOf(CODE_SEPARATOR)
  if (separator === -1) return error
  const code = error.message.slice(0, separator)
  return isErrorCode(code) ? new ApiError(code, error.message.slice(separator + 1)) : error
}
