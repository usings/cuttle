import { useState } from "react"
import type { SubscriptionSummary } from "@/core/subscriptions"
import type { ConfirmRequest } from "./confirm-dialog"
import { useRemoveSubscription, useRotateToken, useSetSubscriptionEnabled } from "./queries"

/**
 * Owns everything about a subscription row's destructive and toggling actions: the pending
 * confirmation, the one-time credential banner a rotation mints, and enable/disable. Creating and
 * editing stay with the page, since those own the editor's open state and the URL it lives in —
 * this hook only ever answers for a row already on screen.
 */
export function useSubscriptionActions(options?: { onBeforeConfirm?: () => void }) {
  const remove = useRemoveSubscription()
  const rotate = useRotateToken()
  const setEnabled = useSetSubscriptionEnabled()

  const [confirming, setConfirming] = useState<ConfirmRequest | null>(null)
  // Shown once, right after the write that minted it — a rotation's new address, or (via
  // `revealCredential`) a freshly created subscription's.
  const [credentialUrl, setCredentialUrl] = useState("")

  /**
   * Both destructive actions route through the same confirmation, and close whatever asked for it
   * on the way — the caller's detail dialog, most likely — so the prompt is never a child of a
   * surface that is about to unmount.
   */
  function request(action: ConfirmRequest["action"]) {
    return (subscription: SubscriptionSummary) => {
      options?.onBeforeConfirm?.()
      setConfirming({ action, id: subscription.id, name: subscription.name })
    }
  }

  /**
   * Acts on the request the dialog hands back rather than on `confirming`. The dialog outlives the
   * state — it keeps the last request through its own exit animation — so taking the argument is what
   * makes "which subscription was confirmed" a single answer instead of two that have to agree.
   */
  function confirm(pending: ConfirmRequest) {
    setConfirming(null)
    if (pending.action === "delete") {
      remove.mutate(pending.id)
      return
    }
    // A rotation mints a new URL, and it is shown exactly like a freshly created one.
    rotate.mutate(pending.id, {
      onSuccess: (result) => {
        if (result.url) setCredentialUrl(result.url)
      },
    })
  }

  function cancel() {
    setConfirming(null)
  }

  function dismissCredential() {
    setCredentialUrl("")
  }

  /** Lets the page show a newly created subscription's address in the same one-time banner. */
  function revealCredential(url: string) {
    setCredentialUrl(url)
  }

  function toggleEnabled(subscription: SubscriptionSummary, enabled: boolean) {
    setEnabled.mutate({ enabled, subscription })
  }

  return {
    cancel,
    confirm,
    confirming,
    credentialUrl,
    dismissCredential,
    requestDelete: request("delete"),
    requestRotate: request("rotate"),
    revealCredential,
    toggleEnabled,
  }
}
