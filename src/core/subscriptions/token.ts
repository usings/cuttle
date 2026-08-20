import { sha256Hex } from "./digest"

const TOKEN_BYTES = 32
const HINT_LENGTH = 8

/**
 * A token is only ever seen twice: when it is minted and when a subscriber presents it. In between the
 * deployment holds its digest and its last few characters, so a leaked database cannot be turned back
 * into working subscription addresses.
 */
export function mintSubscriptionToken() {
  const bytes = new Uint8Array(TOKEN_BYTES)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** The tail an operator recognises their own subscription by, in a list that shows no full tokens. */
export function tokenHint(token: string) {
  return token.slice(-HINT_LENGTH)
}

/**
 * Whether a string is worth looking up at all. A value outside these bounds cannot be a token this
 * deployment minted, so it is refused before it reaches the database — which also keeps an arbitrarily
 * long path segment from becoming a query.
 */
export function isPlausibleToken(token: string) {
  return token.length >= 32 && token.length <= 256
}

/** The value a token is stored and looked up under. */
export function hashToken(token: string) {
  return sha256Hex(token)
}
