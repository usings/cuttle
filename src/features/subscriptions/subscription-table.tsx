import { cn } from "tailwind-variants"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { targetLabel } from "@/core/nodes"
import type { SubscriptionSummary } from "@/core/subscriptions"
import { describeLastCompile } from "./labels"
import { SOURCE_TYPE_LABELS } from "./source-types"
import { EnabledSwitch, META, RowActions, RowControls, StateLabel } from "./subscription-row"
import type { SubscriptionRowActions } from "./subscription-row"

/** The pointer layout: one scannable row per subscription, from md up. */
export function SubscriptionTable({
  actions,
  subscriptions,
}: {
  actions: SubscriptionRowActions
  subscriptions: SubscriptionSummary[]
}) {
  return (
    <div className="hidden md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead className="hidden lg:table-cell">来源</TableHead>
            <TableHead className="hidden lg:table-cell">客户端</TableHead>
            <TableHead className="lg:hidden">来源 / 客户端</TableHead>
            <TableHead className="text-right">节点</TableHead>
            <TableHead className="hidden lg:table-cell">最近编译</TableHead>
            <TableHead>状态</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subscriptions.map((subscription) => {
            const compile = describeLastCompile(subscription)
            return (
              <TableRow
                key={subscription.id}
                data-failed={Boolean(subscription.lastError)}
                className="cursor-pointer data-[failed=true]:bg-destructive/5"
                onClick={() => actions.onSelect(subscription)}
              >
                <TableCell>
                  <button
                    type="button"
                    onClick={(event) => {
                      // The row already opens the dialog; this button is here for the keyboard.
                      event.stopPropagation()
                      actions.onSelect(subscription)
                    }}
                    className="flex flex-col gap-0.5 text-left"
                  >
                    <span className="text-sm font-medium">{subscription.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      token …{subscription.tokenHint}
                    </span>
                  </button>
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <span className="flex flex-col gap-0.5">
                    <span className={META}>{SOURCE_TYPE_LABELS[subscription.sourceType]}</span>
                    <span className="text-xs text-muted-foreground">
                      {subscription.processorCount} 条规则
                    </span>
                  </span>
                </TableCell>
                <TableCell className={cn(META, "hidden text-muted-foreground lg:table-cell")}>
                  {targetLabel(subscription.defaultTarget)}
                </TableCell>
                <TableCell className={cn(META, "lg:hidden")}>
                  {SOURCE_TYPE_LABELS[subscription.sourceType]} ·{" "}
                  <span className="text-muted-foreground">
                    {targetLabel(subscription.defaultTarget)}
                  </span>
                </TableCell>
                <TableCell className="text-right text-sm font-semibold tabular-nums">
                  {subscription.nodeCount ?? "—"}
                </TableCell>
                <TableCell
                  className={cn(
                    "hidden text-xs lg:table-cell",
                    compile.failed ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {compile.text}
                </TableCell>
                <TableCell>
                  <RowControls className="flex items-center gap-2.5">
                    <EnabledSwitch actions={actions} subscription={subscription} />
                    <StateLabel className="text-xs" subscription={subscription} />
                  </RowControls>
                </TableCell>
                <TableCell>
                  <RowActions actions={actions} compact={false} subscription={subscription} />
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
