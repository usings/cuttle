import { cn } from "tailwind-variants"
import type { SubscriptionSummary } from "@/core/subscriptions"
import { subscriptionState } from "./labels"
import { LABEL } from "./subscription-row"

export function SubscriptionMetrics({ subscriptions }: { subscriptions: SubscriptionSummary[] }) {
  const enabled = subscriptions.filter((item) => subscriptionState(item) === "enabled").length
  const failed = subscriptions.filter((item) => subscriptionState(item) === "failed").length
  const nodes = subscriptions.reduce((total, item) => total + (item.nodeCount ?? 0), 0)

  const metrics = [
    { label: "订阅总数", note: "全部持久化", value: subscriptions.length },
    { label: "已启用", note: "对外可取", value: enabled },
    { label: "最近失败", note: "需要处理", value: failed, alert: failed > 0 },
    { label: "节点总数", note: "最新快照", value: nodes },
  ]

  return (
    <div className="grid flex-none grid-cols-2 border-b bg-sidebar md:grid-cols-4">
      {metrics.map((metric) => (
        <div
          key={metric.label}
          className="flex flex-col gap-1 border-border px-4 py-3.5 not-last:border-r max-md:nth-[-n+2]:border-b md:gap-1.5 md:px-5 md:py-4"
        >
          <span className={LABEL}>{metric.label}</span>
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                "text-[22px] leading-none font-semibold -tracking-[0.01em] lg:text-[28px] lg:-tracking-[0.02em]",
                metric.alert ? "text-destructive" : "text-foreground",
              )}
            >
              {metric.value}
            </span>
            <span className="hidden text-xs text-muted-foreground lg:inline">{metric.note}</span>
          </span>
        </div>
      ))}
    </div>
  )
}
