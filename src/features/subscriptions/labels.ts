import type { SubscriptionSource, SubscriptionSummary } from "@/core/subscriptions"
import { SOURCE_TYPE_LABELS } from "./source-types"

/** One-liner for a resolved source; a lone remote link is short enough to show in full. */
export function describeSource(source: SubscriptionSource) {
  const label = SOURCE_TYPE_LABELS[source.type]
  if (source.type === "raw") return `${label} · ${source.content.length} 个字符`
  return source.urls.length === 1
    ? `${label} · ${source.urls[0]}`
    : `${label} · ${source.urls.length} 个链接`
}

const RELATIVE_TIME = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" })

function formatRelativeTime(value: string) {
  const stamp = Date.parse(value)
  if (Number.isNaN(stamp)) return "—"
  const seconds = Math.round((stamp - Date.now()) / 1000)
  const magnitude = Math.abs(seconds)
  if (magnitude < 60) return RELATIVE_TIME.format(seconds, "second")
  if (magnitude < 3600) return RELATIVE_TIME.format(Math.round(seconds / 60), "minute")
  if (magnitude < 86_400) return RELATIVE_TIME.format(Math.round(seconds / 3600), "hour")
  if (magnitude < 2_592_000) return RELATIVE_TIME.format(Math.round(seconds / 86_400), "day")
  if (magnitude < 31_536_000) return RELATIVE_TIME.format(Math.round(seconds / 2_592_000), "month")
  return RELATIVE_TIME.format(Math.round(seconds / 31_536_000), "year")
}

/** A failed compile outranks the last success: the delivered snapshot is stale either way. */
export function describeLastCompile(subscription: SubscriptionSummary) {
  if (subscription.lastError) return { failed: true, text: "编译失败" }
  if (subscription.lastSuccessAt) {
    return { failed: false, text: formatRelativeTime(subscription.lastSuccessAt) }
  }
  return { failed: false, text: "尚未编译" }
}

const SUBSCRIPTION_STATES = {
  failed: { text: "最近失败", tone: "text-destructive" },
  enabled: { text: "已启用", tone: "text-success" },
  disabled: { text: "已停用", tone: "text-muted-foreground" },
} as const

export type SubscriptionState = keyof typeof SUBSCRIPTION_STATES

export const SUBSCRIPTION_STATE_LABELS = Object.entries(SUBSCRIPTION_STATES).map(
  ([value, state]) => ({ label: state.text, value: value as SubscriptionState }),
)

/**
 * The one classification behind the row label, the status filter and the metric. A failed compile
 * outranks enabled/disabled because that is what the row already says the subscription is: a filter
 * or a count that disagreed with the visible label would describe a different set than the one on
 * screen.
 */
export function subscriptionState(subscription: SubscriptionSummary): SubscriptionState {
  if (subscription.lastError) return "failed"
  return subscription.enabled ? "enabled" : "disabled"
}

export function describeSubscriptionState(subscription: SubscriptionSummary) {
  return SUBSCRIPTION_STATES[subscriptionState(subscription)]
}
