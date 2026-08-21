import { IconDatabase, IconMenu2, IconTransform } from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import { useState } from "react"
import type { ComponentType, RefObject } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useTokenUsable } from "@/features/session"

export type AppPage = "extract" | "subscriptions"

interface NavEntry {
  /** Reads from the admin API, so it stays hidden until the key works. */
  admin: boolean
  compactLabel: string
  icon: ComponentType<{ className?: string }>
  label: string
  page: AppPage
  to: string
}

const NAV_ENTRIES: NavEntry[] = [
  {
    page: "extract",
    to: "/",
    label: "提取转换",
    compactLabel: "转换",
    icon: IconTransform,
    admin: false,
  },
  {
    page: "subscriptions",
    to: "/subscriptions",
    label: "订阅管理",
    compactLabel: "订阅",
    icon: IconDatabase,
    admin: true,
  },
]

export function visibleNavEntries(tokenUsable: boolean) {
  return NAV_ENTRIES.filter((entry) => tokenUsable || !entry.admin)
}

export function NavMenu({
  active,
  anchor,
}: {
  active: AppPage
  anchor: RefObject<HTMLElement | null>
}) {
  const tokenUsable = useTokenUsable()
  const [open, setOpen] = useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label="打开导航"
            className="inline-flex size-10 items-center justify-center"
          />
        }
      >
        <IconMenu2 className="size-4.25" />
      </PopoverTrigger>
      {/* Anchored to the header, not the button: the strip is as wide as its anchor and sits flush
          under the header's bottom border. `collisionPadding={0}` is what keeps a viewport-wide
          popup from being nudged inwards — the default 5px padding cannot fit it, so the shift
          middleware would push it past the right edge and give the page something to scroll. */}
      <PopoverContent
        align="center"
        anchor={anchor}
        backdrop
        collisionPadding={0}
        sideOffset={0}
        className="w-(--anchor-width) gap-0 border-b p-0 ring-0"
      >
        <nav className="flex flex-col">
          {visibleNavEntries(tokenUsable).map((entry) => (
            <Link
              key={entry.page}
              to={entry.to}
              viewTransition
              onClick={() => setOpen(false)}
              data-active={active === entry.page}
              className="flex h-14 items-center gap-3 border-b px-4 text-xs font-semibold tracking-widest text-muted-foreground uppercase last:border-b-0 data-[active=true]:bg-muted data-[active=true]:text-foreground"
            >
              <entry.icon className="size-4" />
              {entry.label}
            </Link>
          ))}
        </nav>
      </PopoverContent>
    </Popover>
  )
}
