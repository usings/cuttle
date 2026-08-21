import { ApiError } from "@/shared/api-error"
import { showError } from "@/shared/notify"
import { noteTokenRefused } from "./token"

/**
 * What the admin API's refusal does to the session, in one place. Wired into the query and mutation
 * caches (`@/router`), so it runs for every admin read and write any feature makes — which is why it
 * lives here rather than beside the pages that happen to make them.
 *
 * It also reports, because nowhere else can. A key is never proven before it is spent
 * (`./queries.ts`), so this is where an operator finds out theirs is not one — and marking the key
 * refused makes the gate swap the page out in the same commit the error lands in, which unmounts
 * whatever was rendering under it. No effect down there survives to say anything, so the notice a page
 * keeps for its own failures never reaches the eye on this path. This runs from the cache, outside
 * every page.
 *
 * A mutation that is refused reports twice — once for the mutation, once for the session it just lost.
 * Both are true, and the second is what explains the redirect that follows.
 */
export function noteAuthFailure(error: unknown) {
  if (!(error instanceof ApiError) || error.code !== "unauthorized") return
  noteTokenRefused()
  showError(error, "管理密钥未通过验证。")
}
