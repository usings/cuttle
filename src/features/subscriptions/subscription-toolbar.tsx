import { IconPlus } from "@tabler/icons-react"
import { cn } from "tailwind-variants"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { SUBSCRIPTION_STATE_LABELS } from "./labels"
import type { SubscriptionState } from "./labels"

export type StatusFilter = SubscriptionState | "all"

const STATUS_OPTIONS: Array<{ label: string; value: StatusFilter }> = [
  { label: "全部状态", value: "all" },
  ...SUBSCRIPTION_STATE_LABELS,
]

/** The status filter and "新建" button. Sits beside the page's own title inside the toolbar row. */
export function SubscriptionToolbar({
  onCreate,
  onStatusChange,
  status,
}: {
  onCreate: () => void
  onStatusChange: (next: StatusFilter) => void
  status: StatusFilter
}) {
  return (
    <div className="flex items-center gap-2.5 md:gap-3">
      <Select
        items={STATUS_OPTIONS}
        value={status}
        onValueChange={(value) => onStatusChange((value as StatusFilter) ?? "all")}
      >
        <SelectTrigger
          aria-label="按状态过滤"
          className={cn(
            "border-border px-2.5 text-[12.5px] max-md:h-11!",
            "hidden lg:flex lg:w-[7.5rem]",
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {/* Same height as the status select beside it. */}
      <Button onClick={onCreate}>
        <IconPlus data-icon="inline-start" />
        <span className="md:hidden">新建</span>
        <span className="max-md:hidden">新建订阅</span>
      </Button>
    </div>
  )
}
