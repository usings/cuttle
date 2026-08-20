import { IconError404, IconHome } from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import { cn } from "tailwind-variants"
import { buttonVariants } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

/**
 * Deliberately outside `AppShell`: an address that does not exist has no page to be a header
 * for, and no navigation of its own worth offering beyond the way back.
 */
export function NotFound() {
  return (
    <Empty className="h-dvh border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconError404 />
        </EmptyMedia>
        <EmptyTitle>找不到这个页面</EmptyTitle>
        <EmptyDescription>这个地址不存在，或者已经被删掉了。</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link to="/" viewTransition className={cn(buttonVariants(), "max-md:h-11 max-md:w-full")}>
          <IconHome data-icon="inline-start" />
          回首页
        </Link>
      </EmptyContent>
    </Empty>
  )
}
