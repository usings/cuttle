import { cn } from "tailwind-variants"
import { targetLabel } from "@/core/nodes"
import type { SubscriptionSummary } from "@/core/subscriptions"
import { describeLastCompile } from "./labels"
import { SOURCE_TYPE_LABELS } from "./source-types"
import { EnabledSwitch, LABEL, RowActions, StateLabel } from "./subscription-row"
import type { SubscriptionRowActions } from "./subscription-row"

/** The touch layout: the same subscription as a card, with 44px targets, below md. */
export function SubscriptionCards({
  actions,
  subscriptions,
}: {
  actions: SubscriptionRowActions
  subscriptions: SubscriptionSummary[]
}) {
  return (
    <div className="flex flex-col md:hidden">
      {subscriptions.map((subscription) => {
        const compile = describeLastCompile(subscription)
        return (
          <div
            key={subscription.id}
            data-failed={Boolean(subscription.lastError)}
            className="flex flex-col gap-3 border-b px-4 py-4 data-[failed=true]:bg-destructive/5"
          >
            <div className="flex items-start justify-between gap-3">
              <button
                type="button"
                onClick={() => actions.onSelect(subscription)}
                className="flex min-w-0 flex-col gap-1.25 text-left"
              >
                <span className="text-[15px] leading-tight font-semibold">{subscription.name}</span>
                <StateLabel
                  className="text-[11px] font-semibold tracking-[0.1em] uppercase"
                  dot
                  subscription={subscription}
                />
              </button>
              <EnabledSwitch actions={actions} subscription={subscription} />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 border-t pt-3">
              <div className="flex flex-col gap-0.75">
                <span className={LABEL}>来源</span>
                <span className="text-xs font-medium">
                  {SOURCE_TYPE_LABELS[subscription.sourceType]}
                </span>
              </div>
              <div className="flex flex-col gap-0.75">
                <span className={LABEL}>客户端</span>
                <span className="text-xs font-medium">
                  {targetLabel(subscription.defaultTarget)}
                </span>
              </div>
              <div className="flex flex-col gap-0.75">
                <span className={LABEL}>节点</span>
                <span className="text-xs font-medium">{subscription.nodeCount ?? "—"}</span>
              </div>
              <div className="flex flex-col gap-0.75">
                <span className={LABEL}>最近编译</span>
                <span
                  className={cn(
                    "text-xs font-medium",
                    compile.failed ? "text-destructive" : undefined,
                  )}
                >
                  {compile.text}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t pt-3">
              <span className="min-w-0 flex-1 font-mono text-xs text-muted-foreground">
                token …{subscription.tokenHint}
              </span>
              <RowActions actions={actions} compact subscription={subscription} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
