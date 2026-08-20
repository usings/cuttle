import { queryOptions, useQueryClient } from "@tanstack/react-query"
import type { QueryClient } from "@tanstack/react-query"
import { showSuccess } from "@/shared/notify"
import {
  clearAdminToken,
  hasAdminToken,
  persistAdminToken,
  setAdminToken,
  setConnected,
} from "./admin-session"
import * as api from "./api/server-fn"

/**
 * The two `useQueryClient()` call sites session needs. Cache operations are confined to a feature's
 * `queries.ts` — a component or hook file outside it may only call the named hooks this module
 * exports, never reach the client itself.
 */

/**
 * The one read that proves the key, and it reads nothing: a page's data belongs to the page that
 * shows it, so nothing is fetched here on behalf of a route nobody opened. Keyed on its own so
 * dropping it never touches what a page cached.
 */
function sessionQuery() {
  return queryOptions({ queryKey: ["session"], queryFn: () => api.probeSession() })
}

/** Anything already cached was read with the previous key. */
function resetAdminCache(client: QueryClient) {
  client.removeQueries()
}

/**
 * Commits a key and proves it with a single read; nothing else writes the key. Resolves to the
 * failure message so the connection panel can show it inline instead of as a toast.
 */
export function useConnect() {
  const client = useQueryClient()

  return async (draft: string) => {
    // Normalised once, here: everything downstream — the session, sessionStorage and the header the
    // admin middleware builds from it — carries the same trimmed value the API will compare.
    const token = draft.trim()
    // A blank field is not a key: it never reaches the API, and must not clear a working session.
    if (!hasAdminToken(token)) return "管理密钥无效。"
    setAdminToken(token)
    resetAdminCache(client)
    try {
      // One read proves the key; whatever a page needs, that page fetches when it is opened.
      await client.fetchQuery(sessionQuery())
      persistAdminToken(token)
      setConnected(true)
      showSuccess("已连接")
      return null
    } catch (error) {
      setConnected(false)
      return error instanceof Error ? error.message : "加载失败。"
    }
  }
}

/**
 * The way out of a connected session: the key goes, and with it everything that was read under it.
 * Nothing in flight gates this — dropping a credential is not an action to make someone wait for.
 */
export function useDisconnect() {
  const client = useQueryClient()

  return () => {
    clearAdminToken()
    resetAdminCache(client)
    showSuccess("已断开连接", "管理密钥已从这个浏览器会话清除。")
  }
}
