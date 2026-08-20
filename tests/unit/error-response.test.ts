import { describe, expect, test, vi } from "vitest"
import { jsonError } from "@/server/error-response"
import { AdminFailure } from "@/shared/admin-error"

describe("management error adapter", () => {
  test.each([
    ["invalid_request", 400],
    ["unauthorized", 401],
    ["not_found", 404],
    ["invalid_definition", 422],
    ["upstream_unavailable", 502],
  ] as const)("maps an application rejection", async (code, status) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const response = jsonError(new AdminFailure(code, "message"), "test-operation")

    expect(response.status).toBe(status)
    await expect(response.json()).resolves.toStrictEqual({ code, error: "message" })
    expect(log).toHaveBeenCalledTimes(status >= 500 ? 1 : 0)
    log.mockRestore()
  })

  test("sanitizes and logs an unknown exception", async () => {
    const error = new SyntaxError("database JSON leaked here")
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const response = jsonError(error, "test-operation")

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toStrictEqual({
      code: "internal",
      error: "Internal server error.",
    })
    expect(log).toHaveBeenCalledWith("test-operation", error)
    log.mockRestore()
  })

  test("never exposes the message of an explicitly internal rejection", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const response = jsonError(new AdminFailure("internal", "secret diagnostic"), "test-operation")

    await expect(response.json()).resolves.toStrictEqual({
      code: "internal",
      error: "Internal server error.",
    })
    log.mockRestore()
  })
})
