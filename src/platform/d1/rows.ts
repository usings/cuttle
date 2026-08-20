import { targetDefinition } from "@/core/nodes"
import type { TargetId } from "@/core/nodes"
import { parseSubscriptionMetadata, parseSubscriptionSource } from "@/core/subscriptions"
import type {
  DeliveryArtifactMetadata,
  SubscriptionMetadata,
  SubscriptionRecord,
  SubscriptionSource,
  SubscriptionSummary,
} from "@/core/subscriptions"

export interface SubscriptionRow {
  id: string
  token_hash: string
  token_hint: string
  name: string
  source_type: "raw" | "remote"
  default_target: string
  processors_json: string | null
  enabled: number
  version: number
  created_at: string
  updated_at: string
  last_success_at: string | null
  last_error: string | null
  node_count?: number | null
}

export interface ArtifactRow {
  subscription_id: string
  target: string
  subscription_version: number
  etag: string
  node_count: number
  response_headers_json: string
  created_at: string
}

export interface ContentChunkRow {
  content: string
}

export const SUBSCRIPTION_COLUMNS = `
  id, token_hash, token_hint, name, source_type, default_target, processors_json,
  enabled, version, created_at, updated_at, last_success_at, last_error
`

/**
 * Named rather than `SELECT *`, for the reason the subscription columns are: `ArtifactRow` is a
 * claim about what a row holds, and a column added by a later migration would quietly widen every
 * row this reads — including the one handed to `artifactFromRow`, which is stored and served.
 */
export const ARTIFACT_COLUMNS = `
  subscription_id, target, subscription_version, etag, node_count, response_headers_json, created_at
`

export const LISTED_SUBSCRIPTION_COLUMNS = SUBSCRIPTION_COLUMNS.split(",")
  .map((column) => `subscription.${column.trim()}`)
  .join(", ")

function unreadable<T>(subscriptionId: string, read: () => T): T {
  try {
    return read()
  } catch (error) {
    throw new Error(`Unable to parse stored subscription ${subscriptionId}.`, { cause: error })
  }
}

export function recordFromRow(row: SubscriptionRow, sourceJson: string): SubscriptionRecord {
  return { ...metadataFromRow(row), source: sourceFromJson(row.id, sourceJson) }
}

export function metadataFromRow(row: SubscriptionRow): SubscriptionMetadata {
  const fields = unreadable(row.id, () =>
    parseSubscriptionMetadata({
      name: row.name,
      defaultTarget: row.default_target,
      processors: row.processors_json ? (JSON.parse(row.processors_json) as unknown) : undefined,
      enabled: row.enabled === 1,
    }),
  )
  return {
    ...fields,
    id: row.id,
    tokenHint: row.token_hint,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSuccessAt: row.last_success_at ?? undefined,
    lastError: row.last_error ?? undefined,
  }
}

export function sourceFromJson(subscriptionId: string, sourceJson: string): SubscriptionSource {
  return unreadable(subscriptionId, () =>
    parseSubscriptionSource(JSON.parse(sourceJson) as unknown),
  )
}

export function summaryFromRow(row: SubscriptionRow): SubscriptionSummary {
  let processorCount = 0
  try {
    const processors = row.processors_json ? (JSON.parse(row.processors_json) as unknown) : []
    processorCount = Array.isArray(processors) ? processors.length : 0
  } catch {
    processorCount = 0
  }
  return {
    id: row.id,
    tokenHint: row.token_hint,
    name: row.name,
    sourceType: row.source_type,
    defaultTarget: row.default_target as TargetId,
    enabled: row.enabled === 1,
    version: row.version,
    processorCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSuccessAt: row.last_success_at ?? undefined,
    lastError: row.last_error ?? undefined,
    nodeCount: row.node_count ?? undefined,
  }
}

export function artifactFromRow(row: ArtifactRow): DeliveryArtifactMetadata {
  // Through `targetDefinition` rather than a cast: a row naming a target this build no longer has is
  // a stored artifact nothing can serve, and it says so here rather than downstream.
  const target = targetDefinition(row.target as TargetId)
  return {
    subscriptionId: row.subscription_id,
    target: target.id,
    subscriptionVersion: row.subscription_version,
    etag: row.etag,
    nodeCount: row.node_count,
    responseHeaders: JSON.parse(row.response_headers_json) as Record<string, string>,
    createdAt: row.created_at,
  }
}
