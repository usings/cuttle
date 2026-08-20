import { ValidationError } from "@/core/errors"
import { readRemoteSource as read } from "@/server/remote-source"
import { AdminFailure } from "@/shared/admin-error"

function requestedUrls(input: unknown): string[] {
  const urls = (input as { urls?: unknown } | null)?.urls
  if (!Array.isArray(urls)) return []
  return urls
    .filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    .map((url) => url.trim())
}

export async function readRemoteSource(input: unknown) {
  const urls = requestedUrls(input)
  if (urls.length === 0)
    throw new AdminFailure("invalid_request", "urls must be a non-empty array of strings.")
  try {
    const resolved = await read(urls)
    if (resolved.kind === "unavailable") {
      throw new AdminFailure("upstream_unavailable", resolved.error.message, {
        cause: resolved.error,
      })
    }
    return { content: resolved.source.content }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new AdminFailure("invalid_definition", error.message, { cause: error })
    }
    throw error
  }
}
