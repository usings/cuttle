import type { TargetId } from "@/core/nodes"
import { hashToken } from "@/core/subscriptions"
import type {
  DeliveryArtifact,
  SubscriptionDeliveryRepository,
  SubscriptionPublishingRepository,
  SubscriptionRecord,
} from "@/core/subscriptions"
import {
  ARTIFACT_COLUMNS,
  artifactFromRow,
  LISTED_SUBSCRIPTION_COLUMNS,
  metadataFromRow,
  recordFromRow,
  sourceFromJson,
  SUBSCRIPTION_COLUMNS,
  summaryFromRow,
} from "./rows"
import type { ArtifactRow, ContentChunkRow, SubscriptionRow } from "./rows"
import { fromChunks, toChunks } from "./stored-content"

export class D1SubscriptionRepository
  implements SubscriptionPublishingRepository, SubscriptionDeliveryRepository
{
  constructor(private readonly database: D1Database) {}

  private async source(subscriptionId: string) {
    let result: D1Result<ContentChunkRow>
    try {
      result = await this.database
        .prepare(
          `SELECT content FROM subscription_source_chunks
           WHERE subscription_id = ? ORDER BY chunk_index ASC`,
        )
        .bind(subscriptionId)
        .all<ContentChunkRow>()
    } catch (error) {
      throw new Error(`Unable to read source for subscription ${subscriptionId}.`, { cause: error })
    }
    if (result.results.length === 0) return null
    return fromChunks(result.results)
  }

  private async record(row: SubscriptionRow | null) {
    if (!row) return null
    return recordFromRow(row, (await this.source(row.id)) ?? "")
  }

  private sourceChunkStatements(subscriptionId: string, chunks: string[]) {
    return chunks.map((content, index) =>
      this.database
        .prepare(
          `INSERT INTO subscription_source_chunks (subscription_id, chunk_index, content) VALUES (?, ?, ?)`,
        )
        .bind(subscriptionId, index, content),
    )
  }

  async findMetadataByToken(token: string) {
    const row = await this.database
      .prepare(`SELECT ${SUBSCRIPTION_COLUMNS} FROM subscriptions WHERE token_hash = ?`)
      .bind(await hashToken(token))
      .first<SubscriptionRow>()
    return row ? metadataFromRow(row) : null
  }

  async findSource(id: string) {
    const json = await this.source(id)
    return json ? sourceFromJson(id, json) : null
  }

  async findById(id: string) {
    const row = await this.database
      .prepare(`SELECT ${SUBSCRIPTION_COLUMNS} FROM subscriptions WHERE id = ?`)
      .bind(id)
      .first<SubscriptionRow>()
    return this.record(row)
  }

  async list() {
    const result = await this.database
      .prepare(
        `SELECT ${LISTED_SUBSCRIPTION_COLUMNS}, artifact.node_count
           FROM subscriptions AS subscription
           LEFT JOIN compiled_artifacts AS artifact
             ON artifact.subscription_id = subscription.id
            AND artifact.target = subscription.default_target
            AND artifact.subscription_version = subscription.version
          ORDER BY subscription.updated_at DESC`,
      )
      .all<SubscriptionRow>()
    return result.results.map(summaryFromRow)
  }

  async create(subscription: SubscriptionRecord, token: string) {
    const tokenHash = await hashToken(token)
    const chunks = toChunks(JSON.stringify(subscription.source))
    await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO subscriptions (
            id, token_hash, token_hint, name, source_type, default_target, processors_json,
            enabled, version, created_at, updated_at, last_success_at, last_error
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          subscription.id,
          tokenHash,
          subscription.tokenHint,
          subscription.name,
          subscription.source.type,
          subscription.defaultTarget,
          subscription.processors ? JSON.stringify(subscription.processors) : null,
          subscription.enabled ? 1 : 0,
          subscription.version,
          subscription.createdAt,
          subscription.updatedAt,
          subscription.lastSuccessAt ?? null,
          subscription.lastError ?? null,
        ),
      ...this.sourceChunkStatements(subscription.id, chunks),
    ])
  }

  async update(subscription: SubscriptionRecord) {
    const exists = await this.database
      .prepare("SELECT id FROM subscriptions WHERE id = ?")
      .bind(subscription.id)
      .first<{ id: string }>()
    if (!exists) throw new Error(`Subscription ${subscription.id} disappeared during update.`)
    const chunks = toChunks(JSON.stringify(subscription.source))
    await this.database.batch([
      this.database
        .prepare(
          `UPDATE subscriptions SET
             name = ?, source_type = ?, default_target = ?, processors_json = ?, enabled = ?,
             version = ?, updated_at = ?, last_error = ?
           WHERE id = ?`,
        )
        .bind(
          subscription.name,
          subscription.source.type,
          subscription.defaultTarget,
          subscription.processors ? JSON.stringify(subscription.processors) : null,
          subscription.enabled ? 1 : 0,
          subscription.version,
          subscription.updatedAt,
          subscription.lastError ?? null,
          subscription.id,
        ),
      this.database
        .prepare("DELETE FROM subscription_source_chunks WHERE subscription_id = ?")
        .bind(subscription.id),
      ...this.sourceChunkStatements(subscription.id, chunks),
      this.database
        .prepare("DELETE FROM compiled_artifacts WHERE subscription_id = ?")
        .bind(subscription.id),
    ])
  }

  async rotateToken(id: string, token: string, tokenHint: string, updatedAt: string) {
    const result = await this.database
      .prepare(
        "UPDATE subscriptions SET token_hash = ?, token_hint = ?, updated_at = ? WHERE id = ?",
      )
      .bind(await hashToken(token), tokenHint, updatedAt, id)
      .run()
    return result.meta.changes > 0
  }

  async delete(id: string) {
    const result = await this.database
      .prepare("DELETE FROM subscriptions WHERE id = ?")
      .bind(id)
      .run()
    return result.meta.changes > 0
  }

  async findArtifact(subscriptionId: string, target: TargetId) {
    const row = await this.database
      .prepare(
        `SELECT ${ARTIFACT_COLUMNS} FROM compiled_artifacts WHERE subscription_id = ? AND target = ?`,
      )
      .bind(subscriptionId, target)
      .first<ArtifactRow>()
    return row ? artifactFromRow(row) : null
  }

  async readArtifact(subscriptionId: string, target: TargetId) {
    const [row, chunks] = await this.database.batch([
      this.database
        .prepare(
          `SELECT ${ARTIFACT_COLUMNS} FROM compiled_artifacts WHERE subscription_id = ? AND target = ?`,
        )
        .bind(subscriptionId, target),
      this.database
        .prepare(
          `SELECT content FROM compiled_artifact_chunks
           WHERE subscription_id = ? AND target = ? ORDER BY chunk_index ASC`,
        )
        .bind(subscriptionId, target),
    ])
    const artifactRow = (row.results as ArtifactRow[])[0]
    const contentRows = chunks.results as ContentChunkRow[]
    if (!artifactRow) return null
    // Metadata without body rows is an inconsistent cache entry; rebuilding is the recovery.
    if (contentRows.length === 0) {
      console.warn("Artifact cache has no body chunks; rebuilding", { subscriptionId, target })
      return null
    }
    return { ...artifactFromRow(artifactRow), content: fromChunks(contentRows) }
  }

  async saveArtifactIfCurrent(artifact: DeliveryArtifact, successAt: string) {
    const chunks = toChunks(artifact.content)
    await this.database.batch([
      this.database
        .prepare(
          `INSERT INTO compiled_artifacts (
             subscription_id, target, subscription_version, etag,
             node_count, response_headers_json, created_at
           )
           SELECT ?, ?, ?, ?, ?, ?, ?
           FROM subscriptions
           WHERE id = ? AND version = ?
           ON CONFLICT(subscription_id, target) DO UPDATE SET
             subscription_version = excluded.subscription_version,
             etag = excluded.etag,
             node_count = excluded.node_count,
             response_headers_json = excluded.response_headers_json,
             created_at = excluded.created_at`,
        )
        .bind(
          artifact.subscriptionId,
          artifact.target,
          artifact.subscriptionVersion,
          artifact.etag,
          artifact.nodeCount,
          JSON.stringify(artifact.responseHeaders),
          artifact.createdAt,
          artifact.subscriptionId,
          artifact.subscriptionVersion,
        ),
      this.database
        .prepare(
          `DELETE FROM compiled_artifact_chunks
           WHERE subscription_id = ? AND target = ?
             AND EXISTS (
               SELECT 1 FROM compiled_artifacts
               WHERE subscription_id = ? AND target = ? AND subscription_version = ?
             )`,
        )
        .bind(
          artifact.subscriptionId,
          artifact.target,
          artifact.subscriptionId,
          artifact.target,
          artifact.subscriptionVersion,
        ),
      ...chunks.map((content, index) =>
        this.database
          .prepare(
            `INSERT INTO compiled_artifact_chunks (subscription_id, target, chunk_index, content)
             SELECT ?, ?, ?, ?
             WHERE EXISTS (
               SELECT 1 FROM compiled_artifacts
               WHERE subscription_id = ? AND target = ? AND subscription_version = ?
             )`,
          )
          .bind(
            artifact.subscriptionId,
            artifact.target,
            index,
            content,
            artifact.subscriptionId,
            artifact.target,
            artifact.subscriptionVersion,
          ),
      ),
      this.database
        .prepare(
          `UPDATE subscriptions SET last_success_at = ?, last_error = NULL
           WHERE id = ? AND version = ?`,
        )
        .bind(successAt, artifact.subscriptionId, artifact.subscriptionVersion),
    ])
  }

  async recordDelivery(
    id: string,
    version: number,
    result: { successAt?: string; error?: string },
  ) {
    await this.database
      .prepare(
        `UPDATE subscriptions SET
           last_success_at = COALESCE(?, last_success_at), last_error = ?
         WHERE id = ? AND version = ?`,
      )
      .bind(result.successAt ?? null, result.error ?? null, id, version)
      .run()
  }
}
