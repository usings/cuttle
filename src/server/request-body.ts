import { AdminFailure } from "@/shared/admin-error"

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new AdminFailure("invalid_request", "The request body must be valid JSON.", {
        cause: error,
      })
    }
    throw error
  }
}
