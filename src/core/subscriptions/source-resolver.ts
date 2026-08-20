import { ValidationError } from "@/core/errors"
import { MAX_SOURCE_SIZE } from "@/core/nodes"
import { MAX_REMOTE_URLS } from "./schema"
import type { RemoteSubscriptionSource, SubscriptionSource } from "./types"

const MAX_REDIRECTS = 3
const MAX_CONCURRENT_FETCHES = 4

export interface ResolveSourceOptions {
  allowedHosts: string[]
  fetch?: typeof globalThis.fetch
  resolveHost?: (hostname: string) => Promise<string[]>
}

export interface ResolvedSubscriptionSource {
  content: string
  responseHeaders: Record<string, string>
}

export type SourceReadOutcome =
  | { kind: "ready"; source: ResolvedSubscriptionSource }
  | { kind: "unavailable"; error: Error }

class SourceReadError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "SourceReadError"
  }
}

class SourceBudget {
  private used = 0

  constructor(private readonly multipleSources: boolean) {}

  ensureAvailable(length: number) {
    if (length > MAX_SOURCE_SIZE - this.used) this.exceeded()
  }

  consume(length: number) {
    this.ensureAvailable(length)
    this.used += length
  }

  private exceeded(): never {
    throw new SourceReadError(
      this.multipleSources
        ? "The merged remote subscriptions must not exceed 2 MiB."
        : "A remote subscription must not exceed 2 MiB.",
    )
  }
}

const FORWARDED_RESPONSE_HEADERS = [
  "subscription-userinfo",
  "profile-web-page-url",
  "profile-update-interval",
  "profile-title",
  "plan-name",
] as const

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map(Number)
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return false
  }
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    (parts[0] === 198 && [18, 19].includes(parts[1])) ||
    parts[0] === 0 ||
    parts[0] >= 224
  )
}

function isForbiddenAddress(hostname: string) {
  const normalized = hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replaceAll(/^\[|]$/g, "")
  if (normalized === "localhost" || normalized.endsWith(".localhost")) return true
  if (normalized.includes(":")) {
    return (
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("::ffff:") ||
      /^f[cd]/.test(normalized) ||
      /^fe[89ab]/.test(normalized)
    )
  }
  return isPrivateIpv4(normalized)
}

function hostAllowed(hostname: string, allowedHosts: string[]) {
  const normalized = hostname.toLowerCase().replace(/\.$/, "")
  return allowedHosts.some((entry) => {
    const allowed = entry.trim().toLowerCase().replace(/\.$/, "")
    if (!allowed) return false
    // The apex needs no guard of its own: `*.example.com` keeps its leading dot as `.example.com`,
    // and a host ending in that has at least one label in front of it, so `example.com` can never
    // match. A wildcard grants the subdomains and only those.
    if (allowed.startsWith("*.")) return normalized.endsWith(allowed.slice(1))
    return normalized === allowed
  })
}

async function discardResponseBody(response: Response) {
  if (!response.body || response.body.locked) return
  try {
    await response.body.cancel()
  } catch {
    // Cleanup must not replace the validation or upstream error that made the body irrelevant.
  }
}

function parseUrl(value: string) {
  try {
    return new URL(value)
  } catch (error) {
    throw new ValidationError("The remote subscription URL is not valid.", { cause: error })
  }
}

function validateRemoteUrl(value: string, allowedHosts: string[]) {
  const url = parseUrl(value)
  if (!["https:", "http:"].includes(url.protocol)) {
    throw new ValidationError("A remote subscription may only use HTTP(S).")
  }
  if (url.username || url.password) {
    throw new ValidationError("A remote subscription URL must not carry user information.")
  }
  if (isForbiddenAddress(url.hostname)) {
    throw new ValidationError("A remote subscription must not reach a loopback or private address.")
  }
  if (!hostAllowed(url.hostname, allowedHosts)) {
    throw new ValidationError(
      `Remote subscription host ${url.hostname} is not among the hosts this subscription allows.`,
    )
  }
  return url
}

async function validateResolvedHost(url: URL, resolveHost?: ResolveSourceOptions["resolveHost"]) {
  if (!resolveHost) return
  let addresses: string[]
  try {
    addresses = await resolveHost(url.hostname)
  } catch (error) {
    throw new SourceReadError(`Cannot resolve remote subscription host ${url.hostname}.`, {
      cause: error,
    })
  }
  if (addresses.length === 0) {
    throw new SourceReadError(`Cannot resolve remote subscription host ${url.hostname}.`)
  }
  if (addresses.some((address) => isForbiddenAddress(address))) {
    throw new ValidationError(
      `Remote subscription host ${url.hostname} resolves to a loopback or private address.`,
    )
  }
}

export function subscriptionSourceHosts(source: SubscriptionSource): string[] {
  if (source.type === "raw") return []
  const hosts = source.urls.map((url) => validateRemoteUrl(url, [parseUrl(url).hostname]).hostname)
  return [...new Set(hosts)]
}

async function readLimitedBody(response: Response, budget: SourceBudget) {
  const declaredLength = Number(response.headers.get("content-length") ?? 0)
  if (declaredLength > MAX_SOURCE_SIZE) {
    throw new SourceReadError("A remote subscription must not exceed 2 MiB.")
  }
  if (declaredLength > 0) budget.ensureAvailable(declaredLength)
  if (!response.body) return ""

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- Stream chunks are consumed sequentially.
    const { done, value } = await reader.read()
    if (done) break
    length += value.byteLength
    if (length > MAX_SOURCE_SIZE) {
      // oxlint-disable-next-line no-await-in-loop -- Cancellation belongs to the active stream read.
      await reader.cancel()
      throw new SourceReadError("A remote subscription must not exceed 2 MiB.")
    }
    try {
      budget.consume(value.byteLength)
    } catch (error) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- Cancellation belongs to the active stream read.
        await reader.cancel()
      } catch {
        // Cleanup must not replace the shared-budget error.
      }
      throw error
    }
    chunks.push(value)
  }

  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

async function fetchOne(
  target: string,
  options: ResolveSourceOptions,
  budget: SourceBudget,
  batchSignal: AbortSignal,
) {
  const fetcher = options.fetch ?? globalThis.fetch
  let url = validateRemoteUrl(target, options.allowedHosts)
  // The redirect budget is spent on the way out of the loop, not on the way in: every path through
  // the body throws, returns or follows a redirect, so a bounded `for` would leave the exit after it
  // unreachable — and the same refusal written twice is how the two came to drift.
  let redirects = 0
  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- DNS is revalidated for every redirect target.
    await validateResolvedHost(url, options.resolveHost)
    let response: Response
    try {
      // oxlint-disable-next-line no-await-in-loop -- Redirects must be validated sequentially.
      response = await fetcher(url, {
        redirect: "manual",
        headers: { Accept: "text/plain, application/yaml, application/json" },
        signal: AbortSignal.any([batchSignal, AbortSignal.timeout(10_000)]),
      })
    } catch (error) {
      throw new SourceReadError("The remote subscription request failed.", { cause: error })
    }

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      // The redirect body is never consumed, including on every validation failure below.
      // oxlint-disable-next-line no-await-in-loop -- Release it before the next fetch or throw.
      await discardResponseBody(response)
      if (redirects === MAX_REDIRECTS) {
        throw new SourceReadError("The remote subscription redirected too many times.")
      }
      redirects += 1
      const location = response.headers.get("location")
      if (!location)
        throw new SourceReadError("The remote subscription returned an invalid redirect.")
      let redirected: string
      try {
        redirected = new URL(location, url).toString()
      } catch (error) {
        throw new SourceReadError("The remote subscription returned an invalid redirect.", {
          cause: error,
        })
      }
      url = validateRemoteUrl(redirected, options.allowedHosts)
      continue
    }
    if (!response.ok) {
      // oxlint-disable-next-line no-await-in-loop -- This body is intentionally discarded.
      await discardResponseBody(response)
      throw new SourceReadError(`The remote subscription request failed (HTTP ${response.status}).`)
    }
    let content: string
    try {
      // oxlint-disable-next-line no-await-in-loop -- Redirects and their bodies are consumed sequentially.
      content = await readLimitedBody(response, budget)
    } catch (error) {
      // oxlint-disable-next-line no-await-in-loop -- Cleanup belongs to this response read.
      await discardResponseBody(response)
      if (error instanceof SourceReadError) throw error
      throw new SourceReadError("The remote subscription response could not be read.", {
        cause: error,
      })
    }
    return {
      content,
      responseHeaders: Object.fromEntries(
        FORWARDED_RESPONSE_HEADERS.flatMap((name) => {
          const value = response.headers.get(name)
          return value ? [[name, value]] : []
        }),
      ),
    }
  }
}

async function fetchRemote(source: RemoteSubscriptionSource, options: ResolveSourceOptions) {
  if (source.urls.length === 0)
    throw new ValidationError("A remote subscription needs at least one link.")
  if (source.urls.length > MAX_REMOTE_URLS) {
    throw new ValidationError(`A remote subscription must not exceed ${MAX_REMOTE_URLS} links.`)
  }
  const budget = new SourceBudget(source.urls.length > 1)
  const controller = new AbortController()
  const resolved: ResolvedSubscriptionSource[] = []
  let nextIndex = 0
  let failed = false
  let firstError: unknown

  async function worker() {
    while (!failed) {
      const index = nextIndex
      nextIndex += 1
      if (index >= source.urls.length) return
      try {
        // oxlint-disable-next-line no-await-in-loop -- Each worker consumes its bounded queue in order.
        resolved[index] = await fetchOne(source.urls[index], options, budget, controller.signal)
      } catch (error) {
        if (!failed) {
          failed = true
          firstError = error
          controller.abort()
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(MAX_CONCURRENT_FETCHES, source.urls.length) }, () => worker()),
  )
  if (failed) throw firstError
  if (resolved.length === 1) return resolved[0]
  const bodies = resolved.map((item) => item.content).filter(Boolean)
  budget.consume(Math.max(0, bodies.length - 1))
  const content = bodies.join("\n")
  return {
    content,
    responseHeaders: Object.assign({}, ...resolved.map((item) => item.responseHeaders)),
  }
}

export async function readSubscriptionSource(
  source: SubscriptionSource,
  options: ResolveSourceOptions,
): Promise<SourceReadOutcome> {
  if (source.type === "raw") {
    return { kind: "ready", source: { content: source.content, responseHeaders: {} } }
  }
  try {
    return { kind: "ready", source: await fetchRemote(source, options) }
  } catch (error) {
    if (error instanceof SourceReadError) return { kind: "unavailable", error }
    throw error
  }
}
