import { targetDefinition } from "@/core/nodes"
import type { DeliveryResult } from "@/core/subscriptions"

const CACHE_POLICY = "public, max-age=60, stale-while-revalidate=300, stale-if-error=86400"

function safeFileName(value: string) {
  return value.replaceAll(/[^a-zA-Z0-9._-]+/g, "-").replaceAll(/^-+|-+$/g, "") || "cuttle"
}

export function deliveryResponse(delivery: DeliveryResult) {
  const { artifact, content, stale, subscription } = delivery
  // The media type and the extension are the target's answer, not the artifact's: storing them beside
  // the document would keep serving the old ones after a client's definition changed.
  const target = targetDefinition(artifact.target)

  const headers = new Headers({
    "Cache-Control": CACHE_POLICY,
    "CDN-Cache-Control": CACHE_POLICY,
    "ETag": artifact.etag,
    "X-Cuttle-Stale": stale ? "1" : "0",
  })

  if (content !== null) {
    headers.set("Content-Type", target.contentType)
    headers.set(
      "Content-Disposition",
      `inline; filename="${safeFileName(subscription.name)}.${target.fileExtension}"`,
    )
    headers.set("X-Node-Count", String(artifact.nodeCount))
  }

  // The source resolver restricts these to headers that cannot override response policy.
  for (const [name, value] of Object.entries(artifact.responseHeaders)) {
    headers.set(name, value)
  }
  if (stale) headers.set("Warning", '110 - "Response is stale"')

  // A 304 must restate cache policy because validator headers replace stored headers.
  if (content === null) return new Response(null, { status: 304, headers })
  return new Response(content, { headers })
}
