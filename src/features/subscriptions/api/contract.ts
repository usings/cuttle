import type { SubscriptionRecord, SubscriptionSummary } from "@/core/subscriptions"

/**
 * Payload shapes shared by both channels. The browser goes through server functions, whose types
 * are inferred from `operations`'s own signatures and so never need these names; they exist for
 * `/api/v1/*`'s external callers — turning what used to live only in a README table into an
 * importable type.
 */
export interface SubscriptionListPayload {
  subscriptions: SubscriptionSummary[]
}

export interface SubscriptionPayload {
  subscription: SubscriptionRecord
}

/**
 * Create and rotate answer a one-time token and the subscription's address; every other write
 * answers no credential at all.
 *
 * `subscription` here is the full `SubscriptionRecord`, not `SubscriptionSummary`: the deployed
 * `/api/v1/*` response body for both already carries that full shape, so narrowing it would be a
 * contract change.
 *
 * `subscription` is nullable because rotation's re-read can fail even though the rotation itself
 * already committed (`publishing.ts`'s `rotateToken` swallows that failure on purpose — the old
 * address is invalid either way, so the caller must leave with the new token regardless of whether
 * the record can be read back). `create` never hits this: `publish()` returns the record it just
 * built in memory, not one read back from storage.
 */
export interface CredentialPayload {
  subscription: SubscriptionRecord | null
  token: string
  url: string
}
