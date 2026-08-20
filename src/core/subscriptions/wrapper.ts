import type { CompileResult, TargetId } from "@/core/nodes"
import { sha256Hex } from "./digest"
import type { DeliveryArtifact, SubscriptionMetadata } from "./types"

/**
 * The compiled document turned into the thing that is stored and served: its digest, how many nodes
 * it carries, and whatever traffic metadata the upstream stated. Separate from `delivery.ts`, whose
 * subject is when an artifact may be reused rather than what one is.
 *
 * Nothing here restates what the target already answers. A media type or a file extension stored
 * beside the document would keep serving the old one after a client's definition changed, so
 * `delivery-response.ts` asks the target instead.
 */
export async function wrapArtifact(input: {
  compiled: CompileResult
  subscription: SubscriptionMetadata
  target: TargetId
  responseHeaders: Record<string, string>
}): Promise<DeliveryArtifact> {
  const { compiled, subscription, target, responseHeaders } = input
  return {
    subscriptionId: subscription.id,
    target,
    subscriptionVersion: subscription.version,
    etag: `"${await sha256Hex(compiled.content)}"`,
    content: compiled.content,
    nodeCount: compiled.renderedNodes.length,
    responseHeaders,
    createdAt: new Date().toISOString(),
  }
}
