import { useNavigate, useSearch } from "@tanstack/react-router"

/**
 * Whether the connection panel is open, and the only place that decides it.
 *
 * The state lives in the URL so a reader can be sent straight to it and so the back button closes
 * the panel rather than leaving the page. `connect` is owned by the root route: the panel is mounted
 * from `AppShell` under both `/` and `/subscriptions`, so nothing narrower can own it — which is also
 * why the reads are loosely typed (`strict: false`) and the writes go through `to: "."` rather than a
 * route this hook cannot commit to.
 *
 * Every consumer of that param goes through here: the header button, the gate's prompt and the panel
 * itself, which previously each spelled the same incantation out by hand.
 */
export function useConnectionPanel() {
  const navigate = useNavigate()
  const search = useSearch({ strict: false })

  function setOpen(open: boolean) {
    void navigate({ to: ".", search: (prev) => ({ ...prev, connect: open ? true : undefined }) })
  }

  return { open: search.connect === true, setOpen }
}
