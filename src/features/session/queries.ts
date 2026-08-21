import { useQueryClient } from "@tanstack/react-query"
import type { QueryClient } from "@tanstack/react-query"
import { showSuccess } from "@/shared/notify"
import { clearToken, commitToken, hasToken } from "./token"

/**
 * The two `useQueryClient()` call sites session needs. Cache operations are confined to a feature's
 * `queries.ts` — a component or hook file outside it may only call the named hooks this module
 * exports, never reach the client itself.
 */

/** Anything already cached was read with the previous key. */
function resetAdminCache(client: QueryClient) {
  client.removeQueries()
}

/**
 * Commits a key, and asks nothing of it: whether the key is any good is the admin API's answer, and
 * the first read that actually needs one is where it gives it — `./auth-failure.ts` flags the key as
 * refused on `unauthorized`, and the gate takes the reader off a page it can no longer read. Committing writes the key and nothing else:
 * whether the session can use it follows from holding it (`useTokenUsable`), so there is no second
 * flag here to keep in step.
 *
 * A probe would have proven the key on one path out of two anyway: a reload seeds the key straight
 * out of sessionStorage (`./token.ts`), so every reload already means a session that holds a key
 * rather than one the API has vouched for. One meaning is worth more than a guarantee that only
 * holds until the next refresh.
 *
 * The cost is that an unproven key reaches sessionStorage, so a mistyped one keeps coming back usable
 * across reloads until the panel disconnects — see `useDisconnect`.
 */
export function useConnect() {
  const client = useQueryClient()

  return (draft: string) => {
    // Normalised once, here: everything downstream — the session, sessionStorage and the header the
    // admin middleware builds from it — carries the same trimmed value the API will compare.
    const token = draft.trim()
    // A blank field is not a key, and must not clear a working session. The panel's button is
    // disabled on one, so this is the floor under that rather than a message for anybody.
    if (!hasToken(token)) return
    commitToken(token)
    resetAdminCache(client)
  }
}

/**
 * The way out: the key goes, and with it everything that was read under it.
 * Nothing in flight gates this — dropping a credential is not an action to make someone wait for.
 */
export function useDisconnect() {
  const client = useQueryClient()

  return () => {
    clearToken()
    resetAdminCache(client)
    showSuccess("已断开连接", "管理密钥已从这个浏览器会话清除。")
  }
}
