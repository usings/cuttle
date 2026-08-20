import { parseSubscriptionDraft, parseSubscriptionUpdate } from "./schema"
import { subscriptionSourceHosts } from "./source-resolver"
import { mintSubscriptionToken, tokenHint } from "./token"
import type {
  PublishedSubscription,
  SubscriptionPublishingRepository,
  SubscriptionRecord,
} from "./types"

export class SubscriptionPublishing {
  constructor(private readonly repository: SubscriptionPublishingRepository) {}

  list() {
    return this.repository.list()
  }

  get(id: string) {
    return this.repository.findById(id)
  }

  async publish(input: unknown): Promise<PublishedSubscription> {
    const draft = parseSubscriptionDraft(input)
    subscriptionSourceHosts(draft.source)
    const token = mintSubscriptionToken()
    const timestamp = new Date().toISOString()
    const subscription: SubscriptionRecord = {
      ...draft,
      id: crypto.randomUUID(),
      tokenHint: tokenHint(token),
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    await this.repository.create(subscription, token)
    return { ...subscription, token }
  }

  async update(id: string, input: unknown) {
    const current = await this.repository.findById(id)
    if (!current) return null
    const draft = parseSubscriptionUpdate(current, input)
    subscriptionSourceHosts(draft.source)
    const subscription: SubscriptionRecord = {
      ...current,
      ...draft,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      lastError: undefined,
    }
    await this.repository.update(subscription)
    return subscription
  }

  async rotateToken(id: string) {
    const token = mintSubscriptionToken()
    const rotated = await this.repository.rotateToken(
      id,
      token,
      tokenHint(token),
      new Date().toISOString(),
    )
    if (!rotated) return null
    return { token, subscription: await this.readBack(id) }
  }

  private async readBack(id: string) {
    try {
      const subscription = await this.repository.findById(id)
      if (!subscription) {
        console.warn("Rotated subscription could not be read back", { subscriptionId: id })
      }
      return subscription
    } catch (error) {
      console.warn("Unable to read back rotated subscription", { subscriptionId: id, error })
      return null
    }
  }

  revoke(id: string) {
    return this.repository.delete(id)
  }
}
