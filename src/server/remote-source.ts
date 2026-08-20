import { readSubscriptionSource, subscriptionSourceHosts } from "@/core/subscriptions"
import type { SubscriptionSource } from "@/core/subscriptions"
import { resolvePublicHostname } from "@/platform/dns"

// Redirects remain restricted to the caller-provided hosts; DNS checks block private addresses.
export function readRemoteSource(urls: string[]) {
  const source: SubscriptionSource = { type: "remote", urls }
  return readSubscriptionSource(source, {
    allowedHosts: subscriptionSourceHosts(source),
    resolveHost: resolvePublicHostname,
  })
}
