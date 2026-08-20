import { useEffect, useState } from "react"
import type { ReactNode } from "react"
import { cn } from "tailwind-variants"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { useMediaQuery } from "@/shared/media-query"

export function SideSurface({
  actions,
  bodyClassName,
  children,
  className,
  description,
  onOpenChange,
  onOpenChangeComplete,
  open,
  title,
}: {
  actions?: ReactNode
  bodyClassName?: string
  children: ReactNode
  className?: string
  description: string
  onOpenChange: (open: boolean) => void
  onOpenChangeComplete?: (open: boolean) => void
  open: boolean
  title: string
}) {
  const wide = useMediaQuery("(min-width: 768px)")
  const [shown, setShown] = useState(false)

  // The one place in this codebase that opens a surface a commit late, and the lateness is the
  // point: `wide` is unreadable until it has been measured, so the first render returns nothing at
  // all, and a surface told to be open in the render that replaces it would mount already open. The
  // committed `open={false}` frame in between is what the enter transition runs from.
  //
  // Deliberately not the render-time adjustment the rule suggests: that re-renders before it
  // commits, which is precisely the frame this needs to keep.
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- The extra commit is the enter animation.
    if (wide !== null) setShown(open)
  }, [wide, open])

  if (wide === null) return null

  if (wide) {
    return (
      <Sheet open={shown} onOpenChange={onOpenChange} onOpenChangeComplete={onOpenChangeComplete}>
        <SheetContent
          className={cn(
            "data-[side=right]:inset-y-5 data-[side=right]:right-5 data-[side=right]:h-auto data-[side=right]:w-[calc(100%-2.5rem)] data-[side=right]:border [--sheet-offset:calc(100%+1.25rem+2px)]",
            className,
          )}
        >
          <SheetHeader className="shrink-0 border-b">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>{description}</SheetDescription>
          </SheetHeader>
          <div className={cn("min-h-0 flex-1 overflow-y-auto px-8 py-6", bodyClassName)}>
            {children}
          </div>
          {actions ? (
            <SheetFooter className="shrink-0 flex-row items-center justify-end border-t">
              {actions}
            </SheetFooter>
          ) : null}
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Drawer
      swipeDirection="up"
      open={shown}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={onOpenChangeComplete}
    >
      <DrawerContent className="rounded-none [--drawer-content-max-height:70dvh]!">
        <DrawerHeader className="shrink-0 border-b px-4 py-4 text-left">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription>{description}</DrawerDescription>
        </DrawerHeader>
        <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 py-6", bodyClassName)}>
          {children}
        </div>
        {actions ? (
          <DrawerFooter className="shrink-0 flex-row flex-wrap items-center justify-end gap-y-2 border-t px-4 py-4">
            {actions}
          </DrawerFooter>
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}
