import { resolve4, resolve6 } from "node:dns/promises"
import { isIP } from "node:net"

export async function resolvePublicHostname(hostname: string) {
  const normalized = hostname.replaceAll(/^\[|\]$/g, "")
  if (isIP(normalized)) return [normalized]
  const results = await Promise.allSettled([resolve4(normalized), resolve6(normalized)])
  const addresses = results.flatMap((result) => (result.status === "fulfilled" ? result.value : []))
  // This adapter reports only the DNS fact. The source-resolver seam adds the business meaning
  // because it knows what hostname resolution was being used for.
  if (addresses.length === 0) {
    const rejected = results.find((result) => result.status === "rejected")
    throw new Error(`Cannot resolve host ${hostname}.`, {
      cause: rejected?.status === "rejected" ? rejected.reason : undefined,
    })
  }
  return addresses
}
