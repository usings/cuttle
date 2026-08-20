import type { CanonicalNode } from "./types"

/**
 * Which version of a protocol a node speaks, for the protocols where that is not a field anyone
 * states outright.
 *
 * Both rules were already shared, and neither was findable: `tuicIsV5` sat in `transport.ts`, which
 * is about the stream a proxy runs over and not about how it authenticates, and `snellVersion` in
 * `targets/shared/ciphers.ts`, which is about cipher lists. Two answers to one kind of question,
 * in two modules named after other things.
 *
 * They belong together because every caller asks them for the same reason: a client's capability
 * list and its spelling both turn on the version, so the rule has to be the same one in the
 * capability check and in the renderer that runs after it.
 */

/**
 * Whether a TUIC node speaks version 5.
 *
 * The two differ by credential rather than by a field a source states: v5 authenticates with a uuid
 * and a password, v4 with a single token — and a v4 URI carries that token where a v5 one carries its
 * uuid, so the password is the only thing telling them apart. Every client that reads TUIC hangs
 * something on this, so the rule is stated once rather than re-derived per renderer.
 */
export function tuicIsV5(node: CanonicalNode) {
  return node.password !== undefined
}

/** Snell v4 and later are mihomo-era; Clash classic and Stash stop at 3, Egern at 5. */
export function snellVersion(node: CanonicalNode) {
  return Number(node.version ?? 1)
}
