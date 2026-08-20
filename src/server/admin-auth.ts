import { env } from "cloudflare:workers"

/** workerd's own addition to WebCrypto; the DOM lib this project also compiles against omits it. */
const subtle = crypto.subtle as SubtleCrypto & {
  timingSafeEqual: (a: ArrayBuffer, b: ArrayBuffer) => boolean
}

function providedAdminToken(request: Request) {
  const authorization = request.headers.get("Authorization")
  return authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : ""
}

type AdminAuthorization = "authorized" | "unauthorized"

/**
 * A request that carries no credential at all, or arrives at a deployment with none configured, is
 * turned away immediately. Everything past that point compares digests in constant time, so a wrong
 * key reveals nothing by how long it took to reject.
 *
 * The token's own strength is the operator's choice: any non-empty value is honoured. An absent,
 * empty or blank one authorizes nothing, because a request must present something and no digest
 * matches it.
 *
 * Both sides are trimmed, and this is the only place that decides what a token's surrounding
 * whitespace means: a secret hand-written into a dotenv file carries a stray newline far more often
 * than anyone intends one, and a credential nobody can type is worse than a short one.
 *
 * Both doors — `adminOnly` (`@/middleware/admin-only.server`) for `/api/v1/*` and
 * `adminFunctionMiddleware` (`@/middleware/admin-function`) for the server function channel — call
 * this same function, so the timing-safe comparison has one implementation.
 *
 * Server-only, and unavoidably so: `env` does not resolve in a browser. That matters because
 * `adminFunctionMiddleware` (`@/middleware/admin-function`) is loaded by the browser in full, and
 * `vite dev` evaluates every top-level import of a loaded file regardless of which export a caller
 * uses. What keeps this module out of the browser is the Start plugin stripping the `.server()`
 * callback body — and its import of this file with it — from the client build. That stripping is
 * the entire guarantee, so changing the imports here means re-checking it: load an admin page under
 * `vite dev` and confirm the client transform of `admin-function.ts` never mentions
 * `cloudflare:workers`. `adminOnly` needs none of this and lives under `src/middleware/` with a
 * `.server.ts` suffix, which the browser never loads at all.
 */
export async function authorizeAdminRequest(request: Request): Promise<AdminAuthorization> {
  const provided = providedAdminToken(request)
  // Whatever the binding type says, a deployment that never set the secret has no value here.
  const expected = env.CUTTLE_TOKEN?.trim()
  if (!provided || !expected) return "unauthorized"
  const encoder = new TextEncoder()
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ])
  return subtle.timingSafeEqual(providedHash, expectedHash) ? "authorized" : "unauthorized"
}
