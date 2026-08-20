import type { CanonicalNode } from "../../types"

/** Clash classic's Shadowsocks ciphers; the 2022 series belongs to mihomo and Stash. */
export const CLASH_CIPHERS = new Set([
  "aes-128-cfb",
  "aes-128-ctr",
  "aes-128-gcm",
  "aes-192-cfb",
  "aes-192-ctr",
  "aes-192-gcm",
  "aes-256-cfb",
  "aes-256-ctr",
  "aes-256-gcm",
  "chacha20-ietf",
  "chacha20-ietf-poly1305",
  "rc4-md5",
  "xchacha20",
  "xchacha20-ietf-poly1305",
])

/** Egern's Shadowsocks ciphers, which are its own list rather than Clash's. */
export const EGERN_CIPHERS = new Set([
  "2022-blake3-aes-128-gcm",
  "2022-blake3-aes-256-gcm",
  "aes-128-cfb",
  "aes-128-ctr",
  "aes-128-gcm",
  "aes-192-cfb",
  "aes-192-ctr",
  "aes-256-cfb",
  "aes-256-ctr",
  "aes-256-gcm",
  "bf-cfb",
  "camellia-128-cfb",
  "camellia-192-cfb",
  "camellia-256-cfb",
  "cast5-cfb",
  "chacha20",
  "chacha20-ietf",
  "chacha20-ietf-poly1305",
  "chacha20-poly1305",
  "des-cfb",
  "idea-cfb",
  "none",
  "rc2-cfb",
  "rc4",
  "rc4-md5",
  "salsa20",
  "seed-cfb",
  "table",
])

/** Surge's Shadowsocks ciphers, which run wider than Clash's and include the 2022 series. */
export const SURGE_CIPHERS = new Set([
  "2022-blake3-aes-128-gcm",
  "2022-blake3-aes-256-gcm",
  "aes-128-cfb",
  "aes-128-ctr",
  "aes-128-gcm",
  "aes-192-cfb",
  "aes-192-ctr",
  "aes-192-gcm",
  "aes-256-cfb",
  "aes-256-ctr",
  "aes-256-gcm",
  "bf-cfb",
  "camellia-128-cfb",
  "camellia-192-cfb",
  "camellia-256-cfb",
  "cast5-cfb",
  "chacha20",
  "chacha20-ietf",
  "chacha20-ietf-poly1305",
  "des-cfb",
  "idea-cfb",
  "none",
  "rc2-cfb",
  "rc4",
  "rc4-md5",
  "salsa20",
  "seed-cfb",
  "xchacha20-ietf-poly1305",
])

/** Surfboard implements a narrower list than Surge: no `none`, and none of the rarer CFB ciphers. */
export const SURFBOARD_CIPHERS = new Set(
  [...SURGE_CIPHERS].filter(
    (cipher) =>
      !["cast5-cfb", "des-cfb", "idea-cfb", "none", "rc2-cfb", "seed-cfb"].includes(cipher),
  ),
)

/** A Shadowsocks node that never said which cipher it uses is plain `none`, not an unknown one. */
export function cipherOf(node: CanonicalNode) {
  return String(node.cipher ?? "none")
}
