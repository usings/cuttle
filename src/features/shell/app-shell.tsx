import { IconLoader2 } from "@tabler/icons-react"
import { Link, useNavigate } from "@tanstack/react-router"
import { useRef, useState } from "react"
import type { ReactNode } from "react"
import { Separator } from "@/components/ui/separator"
import { useConnected, useRestored } from "@/features/session"
import { ConnectionDot, ConnectionPanel } from "./connection-panel"
import { NavMenu, visibleNavEntries } from "./navigation"
import type { AppPage } from "./navigation"

export function AppShell({ active, children }: { active: AppPage; children: ReactNode }) {
  const navigate = useNavigate()
  const connected = useConnected()
  const restored = useRestored()
  const [maskGone, setMaskGone] = useState(false)
  const header = useRef<HTMLElement>(null)

  // Root-level search param: this shell mounts under both `/` and `/subscriptions`, so nothing
  // narrower than the root route can own whether the connection panel is open. `to: "."` is what
  // buys loosely-typed search here instead of a `from` this component cannot commit to.
  function openConnectPanel() {
    void navigate({ to: ".", search: (prev) => ({ ...prev, connect: true }) })
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* The key lives in sessionStorage, which no server render and no hydration render can read.
          Until the lookup returns, every session-shaped thing on screen would be a claim about a
          session nobody has looked up yet: the header would read 未连接 and the navigation would
          drop the admin entry, both only to correct themselves a frame later. The mask lifts when
          `restoreAdminToken` reports back — which is also the moment the page becomes interactive,
          so nothing under it was worth touching earlier either.

          It fades rather than cuts: what is underneath on the admin page is another wait, and two
          waits swapped in one frame read as a flicker rather than as progress. `pointer-events-none`
          comes with the fade, so the frame is live for the whole of it; the element leaves the tree
          when the transition reports it is over. */}
      {maskGone ? null : (
        <div
          role="status"
          aria-label="正在确认管理连接"
          data-settled={restored}
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
            {visibleNavEntries(connected).map((entry) => (
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
              onClick={openConnectPanel}
              className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase transition-colors hover:text-foreground"
            >
              <ConnectionDot connected={connected} />
              {connected ? "已连接" : "未连接"}
            </button>
          </div>

          <div className="flex items-center gap-1 md:hidden">
            <button
              type="button"
              aria-label="管理连接"
              onClick={openConnectPanel}
              className="inline-flex size-10 items-center justify-center"
            >
              <ConnectionDot connected={connected} />
            </button>
            {connected ? <NavMenu active={active} anchor={header} /> : null}
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
