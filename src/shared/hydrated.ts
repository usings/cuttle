import { useSyncExternalStore } from "react"

/**
 * Nothing to subscribe to: the answer changes once, and React itself is what changes it — the
 * unsubscribe is returned only because the signature asks for one.
 */
const noStore = () => () => {
  // nothing to unsubscribe from
}
const onClient = () => true
const onServer = () => false

/**
 * Whether this render is a post-hydration one.
 *
 * `false` during the server render and during the hydration render that has to match its HTML, then
 * `true` for every render after. React drives the flip itself: `useSyncExternalStore` renders the
 * server snapshot while hydrating and re-renders with the client one once it is done, which is the
 * same mechanism that lets `session/token.ts` seed a key at module scope without tearing hydration.
 *
 * For callers whose markup cannot describe what the browser knows yet — a session key in
 * sessionStorage, a viewport measurement — and who would rather cover the frame than render a claim
 * they are about to retract.
 */
export function useHydrated() {
  return useSyncExternalStore(noStore, onClient, onServer)
}
