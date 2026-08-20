import type { SubscriptionSource } from "@/core/subscriptions"

export const SOURCE_TYPE_LABELS: Record<SubscriptionSource["type"], string> = {
  raw: "文本",
  remote: "远程",
}
