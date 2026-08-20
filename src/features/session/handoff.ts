import type { NodeProcessor, TargetId } from "@/core/nodes"
import type { SubscriptionSource } from "@/core/subscriptions"

/** The workbench's draft, handed to the subscription editor when "存为订阅" is used. */
export interface WorkbenchHandoff {
  defaultTarget: TargetId
  processors: NodeProcessor[]
  source: SubscriptionSource
}

/**
 * History state rather than the Store: the draft carries up to 2 MiB of source text, and living in
 * a module-scope atom would keep it alive across navigation until something cleared it by hand.
 * History state is scoped to the navigation instead — a refresh drops it, which is exactly right for
 * a 2 MiB draft that has no business surviving one. It cannot go in the URL either, for the same
 * reason of size.
 */
declare module "@tanstack/react-router" {
  interface HistoryState {
    subscriptionDraft?: WorkbenchHandoff
  }
}
