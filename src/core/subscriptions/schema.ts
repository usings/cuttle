import { MAX_SOURCE_SIZE, parseProcessors, TARGET_IDS } from "@/core/nodes"
import type { TargetId } from "@/core/nodes"
import { asRecord } from "@/core/nodes/values"
import { fail, onlyKeys, text } from "@/core/validation"
import type { SubscriptionDraft, SubscriptionSource } from "./types"

export const MAX_REMOTE_URLS = 32
export const MAX_SUBSCRIPTION_NAME_LENGTH = 100

export function parseSubscriptionSource(value: unknown): SubscriptionSource {
  const input = asRecord(value) ?? fail("source must be an object.")
  if (input.type === "raw") {
    onlyKeys(input, ["type", "content"], "source")
    const content = text(input.content, "source.content", MAX_SOURCE_SIZE, true)
    if (new TextEncoder().encode(content).byteLength > MAX_SOURCE_SIZE) {
      fail("source.content must not exceed 2 MiB.")
    }
    return { type: "raw", content }
  }
  if (input.type === "remote") {
    onlyKeys(input, ["type", "urls"], "source")
    if (!Array.isArray(input.urls) || input.urls.length === 0) {
      fail("source.urls must be a non-empty array.")
    }
    if (input.urls.length > MAX_REMOTE_URLS) {
      fail(`source.urls may hold at most ${MAX_REMOTE_URLS} links.`)
    }
    const urls = input.urls.map((entry, index) => {
      const rawUrl = text(entry, `source.urls[${index}]`, 4096)
      let url: URL
      try {
        url = new URL(rawUrl)
      } catch {
        return fail(`source.urls[${index}] is not a valid URL.`)
      }
      if (!["http:", "https:"].includes(url.protocol)) {
        fail(`source.urls[${index}] may only use HTTP(S).`)
      }
      if (url.username || url.password)
        fail(`source.urls[${index}] must not carry user information.`)
      return url.toString()
    })
    return { type: "remote", urls }
  }
  return fail("source.type must be raw or remote.")
}

function target(value: unknown): TargetId {
  if (!TARGET_IDS.includes(value as TargetId)) {
    fail(`defaultTarget must be one of ${TARGET_IDS.join(", ")}.`)
  }
  return value as TargetId
}

const DRAFT_KEYS = ["name", "source", "defaultTarget", "processors", "enabled"]

function fieldsBeforeSource(input: Record<string, unknown>) {
  if (input.enabled != null && typeof input.enabled !== "boolean")
    fail("enabled must be a boolean.")
  const processors = parseProcessors(input.processors ?? [])
  return {
    name: text(input.name, "name", MAX_SUBSCRIPTION_NAME_LENGTH),
    processors: processors.length > 0 ? processors : undefined,
    enabled: input.enabled !== false,
  }
}

export function parseSubscriptionMetadata(value: unknown): Omit<SubscriptionDraft, "source"> {
  const input = asRecord(value) ?? fail("A subscription definition must be an object.")
  const fields = fieldsBeforeSource(input)
  return { ...fields, defaultTarget: target(input.defaultTarget) }
}

export function parseSubscriptionDraft(value: unknown): SubscriptionDraft {
  const input = asRecord(value) ?? fail("A subscription definition must be an object.")
  onlyKeys(input, DRAFT_KEYS, "The subscription definition")
  const fields = fieldsBeforeSource(input)
  const source = parseSubscriptionSource(input.source)
  return { ...fields, source, defaultTarget: target(input.defaultTarget) }
}

export function parseSubscriptionUpdate(current: SubscriptionDraft, value: unknown) {
  const input = asRecord(value) ?? fail("A subscription update must be an object.")
  const allowed = new Set(DRAFT_KEYS)
  if (!Object.keys(input).some((key) => allowed.has(key)))
    fail("The subscription update has no modifiable field.")
  return parseSubscriptionDraft({
    name: current.name,
    source: current.source,
    defaultTarget: current.defaultTarget,
    processors: current.processors,
    enabled: current.enabled,
    ...input,
  })
}
