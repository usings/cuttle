import { IconLoader2, IconPlugConnected } from "@tabler/icons-react"
import { useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { useTokenRefused, useTokenUsable } from "@/features/session"
import { useConnectionPanel } from "./connection-panel-state"

/**
 * Decides between the page, the prompt and leaving — and asks the API nothing of its own to do it.
 * No key is proven before it is spent (`session/queries.ts`), so the one this session holds is
 * trusted until something says otherwise, and the something is the page's own first read: any
 * request coming back `unauthorized` flags the key as refused (`session/auth-failure.ts`'s
 * `noteAuthFailure`).
 *
 * That is why there is no probe here. A gate that ran its own would put a second wait in front of a
 * page that is already waiting for its data, and prove with a request what the page's own request
 * proves anyway — the reader would sit through two spinners for one question.
 */
export function ConnectionGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const tokenUsable = useTokenUsable()
  const tokenRefused = useTokenRefused()
  const { open: panelOpen, setOpen: setPanelOpen } = useConnectionPanel()

  // A key the admin API has refused leaves this page rather than being offered a retry on it: there
  // is nothing to show under a session that does not exist, and the navigation does not even list
  // this page while disconnected. The workbench is the one page that works without a key.
  //
  // Refusal alone is the condition, and it carries the rest: nothing can refuse a key the session
  // does not hold, and every path that drops or replaces the key clears the refusal with it
  // (`session/token.ts`).
  //
  // Never while the connection panel is open, though: that is someone re-arming the very key this is
  // reacting to, and navigating out from under them would take the panel with it.
  const leaving = tokenRefused && !panelOpen
  useEffect(() => {
    if (leaving) void navigate({ to: "/", replace: true, viewTransition: true })
  }, [navigate, leaving])

  if (tokenUsable) return children

  // A refused session is one frame away from being somewhere else, so there is nothing to say here
  // that would reach anyone: copy would only be a third sentence in a row for a reader who asked one
  // question.
  if (leaving) {
    return (
      <Empty className="flex-1 border-b">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconLoader2 className="animate-spin" />
          </EmptyMedia>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <Empty className="flex-1 border-b">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <IconPlugConnected />
        </EmptyMedia>
        <EmptyTitle>尚未连接管理 API</EmptyTitle>
        <EmptyDescription>
          订阅数据保存在 D1，需要管理密钥才能读取。密钥只留在当前浏览器会话。
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => setPanelOpen(true)}>
          <IconPlugConnected data-icon="inline-start" />
          输入管理密钥
        </Button>
      </EmptyContent>
    </Empty>
  )
}
