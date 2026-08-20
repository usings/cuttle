/**
 * SHA-256 as lower-case hex. Two things in this domain are identified by their digest rather than by
 * their content: a subscription token, which is indexed by it so the token itself is never stored,
 * and a compiled artifact, whose digest is the ETag a client revalidates against.
 */
export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}
