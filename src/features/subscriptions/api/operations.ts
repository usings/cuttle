import { ValidationError } from "@/core/errors"
import { TARGET_IDS } from "@/core/nodes"
import type { TargetId } from "@/core/nodes"
import { subscriptionDelivery, subscriptionPublishing } from "@/server/subscription-services"
import { AdminFailure } from "@/shared/admin-error"
import type { CredentialPayload, SubscriptionListPayload, SubscriptionPayload } from "./contract"

export async function listSubscriptions(): Promise<SubscriptionListPayload> {
  return { subscriptions: await subscriptionPublishing().list() }
}

export async function getSubscription({ id }: { id: string }): Promise<SubscriptionPayload> {
  const subscription = await subscriptionPublishing().get(id)
  if (!subscription) throw new AdminFailure("not_found", "Subscription not found.")
  return { subscription }
}

export async function createSubscription({
  draft,
  origin,
}: {
  draft: unknown
  origin: string
}): Promise<CredentialPayload> {
  try {
    const { token, ...subscription } = await subscriptionPublishing().publish(draft)
    return { subscription, token, url: new URL(`/subscribe/${token}`, origin).toString() }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new AdminFailure("invalid_definition", error.message, { cause: error })
    }
    throw error
  }
}

export async function updateSubscription({
  id,
  patch,
}: {
  id: string
  patch: unknown
}): Promise<SubscriptionPayload> {
  try {
    const subscription = await subscriptionPublishing().update(id, patch)
    if (!subscription) throw new AdminFailure("not_found", "Subscription not found.")
    return { subscription }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new AdminFailure("invalid_definition", error.message, { cause: error })
    }
    throw error
  }
}

export async function readSubscriptionSnapshot({
  id,
  target,
}: {
  id: string
  target: string
}): Promise<{
  snapshot: { content: string; nodeCount: number; subscriptionVersion: number } | null
}> {
  if (!TARGET_IDS.includes(target as TargetId)) {
    throw new AdminFailure("invalid_request", `Unsupported client: ${target}`)
  }
  const artifact = await subscriptionDelivery().readSnapshot(id, target as TargetId)
  if (!artifact) return { snapshot: null }
  return {
    snapshot: {
      content: artifact.content,
      nodeCount: artifact.nodeCount,
      subscriptionVersion: artifact.subscriptionVersion,
    },
  }
}

export async function removeSubscription({ id }: { id: string }): Promise<void> {
  if (!(await subscriptionPublishing().revoke(id))) {
    throw new AdminFailure("not_found", "Subscription not found.")
  }
}

export async function rotateSubscriptionToken({
  id,
  origin,
}: {
  id: string
  origin: string
}): Promise<CredentialPayload> {
  const rotated = await subscriptionPublishing().rotateToken(id)
  if (!rotated) throw new AdminFailure("not_found", "Subscription not found.")
  return {
    subscription: rotated.subscription,
    token: rotated.token,
    url: new URL(`/subscribe/${rotated.token}`, origin).toString(),
  }
}
