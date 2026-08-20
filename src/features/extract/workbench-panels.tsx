import type { ReactNode } from "react"
import { cn } from "tailwind-variants"

const PANEL_TITLE = "font-heading text-base font-semibold tracking-[0.05em] uppercase"
const PANEL_META =
  "text-[10px] font-semibold tracking-[0.14em] text-muted-foreground uppercase whitespace-nowrap"
export const MONO_BLOCK =
  "font-mono text-xs leading-[1.8] wrap-anywhere whitespace-pre-wrap outline-none"
/** One header band per column so the three panels line up, whatever the column layout is. */
export const PANEL_HEAD =
  "flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4 md:px-5"

/**
 * The step marker lives in the panel it belongs to. A single strip above the grid can only line up
 * with columns, and from md up "源" and "处理" share one column, so no strip position fits both.
 */
export function PanelHead({
  children,
  index,
  status,
  title,
}: {
  children?: ReactNode
  index: string
  status?: string
  title: string
}) {
  const statusNode = status ? <span className={cn(PANEL_META, "truncate")}>{status}</span> : null
  return (
    <div className={PANEL_HEAD}>
      <div className="flex min-w-0 items-baseline gap-2.5">
        {/* Below md the strip above is the step marker, so this would just repeat it. */}
        <span className="hidden font-mono text-[11px] text-muted-foreground md:inline">
          {index}
        </span>
        <h2 className={PANEL_TITLE}>{title}</h2>
        {/* Controls own the right edge when there are any; otherwise the status takes it. */}
        {children ? statusNode : null}
      </div>
      {children ?? statusNode}
    </div>
  )
}
