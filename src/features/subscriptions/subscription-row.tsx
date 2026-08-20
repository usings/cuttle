import { IconEdit, IconKey, IconTrash } from "@tabler/icons-react"
import type { MouseEvent, ReactNode } from "react"
import { cn } from "tailwind-variants"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import type { SubscriptionSummary } from "@/core/subscriptions"
import { describeSubscriptionState } from "./labels"

export const META = "text-[10px] font-semibold tracking-[0.14em] uppercase"
export const LABEL = "text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase"

export interface SubscriptionRowActions {
  onEdit: (subscription: SubscriptionSummary) => void
  onRemove: (subscription: SubscriptionSummary) => void
  onRotate: (subscription: SubscriptionSummary) => void
  onSelect: (subscription: SubscriptionSummary) => void
  onToggleEnabled: (subscription: SubscriptionSummary, enabled: boolean) => void
}

/** Wraps the controls inside a clickable row so operating them never opens the detail dialog. */
export function RowControls({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={className}
      onClick={(event: MouseEvent) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      role="presentation"
    >
      {children}
    </div>
  )
}

export function StateLabel({
  className,
  dot,
  subscription,
}: {
  className?: string
  dot?: boolean
  subscription: SubscriptionSummary
}) {
  const state = describeSubscriptionState(subscription)
  return (
    <span className={cn("inline-flex items-center gap-1.5", state.tone, className)}>
      {dot ? <span aria-hidden className="size-1.5 shrink-0 bg-current" /> : null}
      {state.text}
    </span>
  )
}

export function EnabledSwitch({
  actions,
  subscription,
}: {
  actions: SubscriptionRowActions
  subscription: SubscriptionSummary
}) {
  return (
    <Switch
      aria-label={`${subscription.name} 启用状态`}
      checked={subscription.enabled}
      onCheckedChange={(checked) => actions.onToggleEnabled(subscription, checked)}
    />
  )
}

/** `compact` is the touch layout, where every target is 44px rather than an icon button. */
export function RowActions({
  actions,
  compact,
  subscription,
}: {
  actions: SubscriptionRowActions
  compact: boolean
  subscription: SubscriptionSummary
}) {
  return (
    <RowControls className="flex justify-end gap-1.5">
      <Button
        variant="outline"
        size="icon-xs"
        aria-label="编辑"
        className={compact ? "size-10" : undefined}
        onClick={() => actions.onEdit(subscription)}
      >
        <IconEdit />
      </Button>
      <Button
        variant="outline"
        size="icon-xs"
        aria-label="轮换 token"
        className={compact ? "size-10" : undefined}
        onClick={() => actions.onRotate(subscription)}
      >
        <IconKey />
      </Button>
      <Button
        variant="destructive"
        size="icon-xs"
        aria-label="删除"
        className={compact ? "size-10" : undefined}
        onClick={() => actions.onRemove(subscription)}
      >
        <IconTrash />
      </Button>
    </RowControls>
  )
}
