import { createAtom } from "@tanstack/react-store"
import type { BaseAtom } from "@tanstack/react-store"
import { useCallback, useSyncExternalStore } from "react"

const TOKEN_STORAGE_KEY = "cuttle-admin-token"

const adminTokenAtom = createAtom("")
const connectedAtom = createAtom(false)
const restoredAtom = createAtom(false)

// Pin hydration to the server's initial value; session restoration can run before streamed chunks hydrate.
function useAtomValue<T>(atom: BaseAtom<T>, initial: T) {
  const subscribe = useCallback(
    (onChange: () => void) => atom.subscribe(onChange).unsubscribe,
    [atom],
  )
  const get = useCallback(() => atom.get(), [atom])
  const server = useCallback(() => initial, [initial])
  return useSyncExternalStore(subscribe, get, server)
}

export function readAdminToken() {
  return adminTokenAtom.get()
}

/**
 * Whether this session holds a key at all. What the key is worth is the API's answer, never this
 * module's: the operator chooses the token, so its shape carries no local verdict.
 *
 * Trimmed to match `authorizeAdminRequest` (`@/server/admin-auth`), which decides what surrounding
 * whitespace means. Blank is not a key.
 */
export function hasAdminToken(token: string) {
  return token.trim().length > 0
}

export function setAdminToken(token: string) {
  adminTokenAtom.set(token)
}

export function persistAdminToken(token: string) {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token)
}

export function setConnected(connected: boolean) {
  connectedAtom.set(connected)
}

export function useConnected() {
  return useAtomValue(connectedAtom, false)
}

export function useRestored() {
  return useAtomValue(restoredAtom, false)
}

export function restoreAdminToken() {
  const stored = (sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? "").trim()
  if (stored) {
    setAdminToken(stored)
    setConnected(true)
  }
  restoredAtom.set(true)
}

export function clearAdminToken() {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY)
  setAdminToken("")
  setConnected(false)
}

export function useAdminToken() {
  return useAtomValue(adminTokenAtom, "")
}

export function useHasAdminToken() {
  return hasAdminToken(useAdminToken())
}
