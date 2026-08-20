import { env } from "cloudflare:workers"
import { SubscriptionDelivery, SubscriptionPublishing } from "@/core/subscriptions"
import { D1SubscriptionRepository } from "@/platform/d1/subscription-repository"
import { resolvePublicHostname } from "@/platform/dns"

function repository() {
  return new D1SubscriptionRepository(env.DB)
}

export function subscriptionPublishing() {
  return new SubscriptionPublishing(repository())
}

export function subscriptionDelivery() {
  return new SubscriptionDelivery(repository(), { resolveHost: resolvePublicHostname })
}
