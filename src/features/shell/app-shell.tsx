import { IconLoader2 } from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import { useRef, useState } from "react"
import type { ReactNode } from "react"
import { Separator } from "@/components/ui/separator"
import { useTokenUsable } from "@/features/session"
import { useHydrated } from "@/shared/hydrated"
import { ConnectionDot, ConnectionPanel } from "./connection-panel"
import { useConnectionPanel } from "./connection-panel-state"
import { NavMenu, visibleNavEntries } from "./navigation"
import type { AppPage } from "./navigation"

export function AppShell({ active, children }: { active: AppPage; children: ReactNode }) {
  const tokenUsable = useTokenUsable()
  const { setOpen: setPanelOpen } = useConnectionPanel()
  const [maskGone, setMaskGone] = useState(false)
  const header = useRef<HTMLElement>(null)
  const hydrated = useHydrated()

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {maskGone ? null : (
        <div
          role="status"
          aria-label="正在确认管理连接"
          data-settled={hydrated}
          onTransitionEnd={() => setMaskGone(true)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-background transition-opacity duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] data-[settled=true]:pointer-events-none data-[settled=true]:opacity-0"
        >
          <IconLoader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}

      <header ref={header} className="z-50 shrink-0 border-b bg-background">
        <div className="mx-auto flex h-12 w-full max-w-340 items-center justify-between gap-4 px-4 md:h-13 md:px-5">
          <Link
            to="/"
            viewTransition
            className="font-heading text-sm font-semibold tracking-[0.08em] text-foreground uppercase md:text-[15px] lg:text-[17px]"
          >
            <span>Cuttle</span>
          </Link>

          <div className="hidden items-center gap-3 md:flex lg:gap-3.5">
            {visibleNavEntries(tokenUsable).map((entry) => (
              <Link
                key={entry.page}
                to={entry.to}
                viewTransition
                data-active={active === entry.page}
                className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase transition-colors hover:text-foreground data-[active=true]:text-foreground lg:gap-1.75 lg:text-xs"
              >
                <entry.icon className="size-3.5" />
                <span className="lg:hidden">{entry.compactLabel}</span>
                <span className="hidden lg:inline">{entry.label}</span>
              </Link>
            ))}
            <Separator orientation="vertical" className="h-3.5 lg:h-4" />
            <button
              type="button"
              onClick={() => setPanelOpen(true)}
              className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase transition-colors hover:text-foreground"
            >
              <ConnectionDot connected={tokenUsable} />
              {tokenUsable ? "已连接" : "未连接"}
            </button>
          </div>

          <div className="flex items-center gap-1 md:hidden">
            <button
              type="button"
              aria-label="管理连接"
              onClick={() => setPanelOpen(true)}
              className="inline-flex size-10 items-center justify-center"
            >
              <ConnectionDot connected={tokenUsable} />
            </button>
            {tokenUsable ? <NavMenu active={active} anchor={header} /> : null}
          </div>
        </div>
      </header>

      {/* border-x closes the frame once the viewport is wider than the content column. */}
      <main className="mx-auto flex w-full max-w-340 min-h-0 flex-1 flex-col overflow-y-auto lg:border-x">
        {children}
      </main>

      <ConnectionPanel />
    </div>
  )
}
