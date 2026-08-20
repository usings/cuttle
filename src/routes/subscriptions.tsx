import { createFileRoute } from "@tanstack/react-router"
import { AppShell, ConnectionGate } from "@/features/shell"
import { SubscriptionManager } from "@/features/subscriptions"

export interface SubscriptionsSearch {
  id?: string
  mode?: "edit" | "create"
}

/**
 * Input from the address bar is not to be trusted: junk falls back to the default state rather than
 * throwing, because a hand-mangled URL should open a working page and not an error one.
 *
 * `mode` is one union rather than two booleans — "editing and creating at once" is not a reachable
 * state, so the type must not let it be expressed. "Creating while pointing at an existing
 * subscription" is not reachable either, which is why `id` is dropped along with it when
 * `mode === "create"`.
 */
export function parseSubscriptionsSearch(input: Record<string, unknown>): SubscriptionsSearch {
  const mode = input.mode === "edit" || input.mode === "create" ? input.mode : undefined
  if (mode === "create") return { mode }

  const id = typeof input.id === "string" && input.id.length > 0 ? input.id : undefined
  const search: SubscriptionsSearch = {}
  if (id !== undefined) search.id = id
  if (mode !== undefined) search.mode = mode
  return search
}

/**
 * This route has no loader, and that is not an omission.
 *
 * The admin key lives only in sessionStorage, so a server render holds no credential and any loader
 * running there would get a 401. The data is fetched by a query when the page mounts — which is also
 * why the Router–Query SSR dehydrate integration is not installed: there is nothing to prefetch on
 * the server.
 */
export const Route = createFileRoute("/subscriptions")({
  validateSearch: parseSubscriptionsSearch,
  component: SubscriptionsPage,
})

function SubscriptionsPage() {
  return (
    <AppShell active="subscriptions">
      <ConnectionGate>
        <SubscriptionManager />
      </ConnectionGate>
    </AppShell>
  )
}
