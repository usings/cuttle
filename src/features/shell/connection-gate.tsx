import { IconLoader2, IconPlugConnected } from "@tabler/icons-react"
import { useNavigate, useSearch } from "@tanstack/react-router"
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
import { useConnected, useHasAdminToken, useRestored } from "@/features/session"

/**
 * Decides between the page, the prompt and leaving — and asks the API nothing of its own to do it.
 * Only a key that already answered gets stored, so a restored one is trusted until something says
 * otherwise, and the something is the page's own first read: any request coming back `unauthorized`
 * clears `connected` (`subscriptions/queries.ts`'s `noteAuthFailure`).
 *
 * That is why there is no probe here. A gate that ran its own would put a second wait in front of a
 * page that is already waiting for its data, and prove with a request what the page's own request
 * proves anyway — the reader would sit through two spinners for one question.
 */
export function ConnectionGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  // `strict: false` for the same reason the connection panel needs it: this gate is mounted from a
  // route that does not own `connect`, the root does.
  const search = useSearch({ strict: false })
  const hasToken = useHasAdminToken()
  const connected = useConnected()
  const restored = useRestored()

  // A key the admin API has refused leaves this page rather than being offered a retry on it: there
  // is nothing to show under a session that does not exist, and the navigation does not even list
  // this page while disconnected. The workbench is the one page that works without a key.
  //
  // Never while the connection panel is open, though: that is someone fixing the very key this is
  // reacting to, and navigating out from under them would take the panel — and the inline reason
  // the API just gave — with it.
  const refused = restored && hasToken && !connected && search.connect !== true
  useEffect(() => {
    if (refused) void navigate({ to: "/", replace: true, viewTransition: true })
  }, [navigate, refused])

  if (connected) return children

  // Nothing to say in either case that reaches it: the shell's mask covers the whole frame until
  // the key lookup returns, and a refused session is one frame away from being somewhere else. Copy
  // here would only be a third sentence in a row for a reader who asked one question.
  if (!restored || refused) {
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
        <Button
          onClick={() => void navigate({ to: ".", search: (prev) => ({ ...prev, connect: true }) })}
        >
          <IconPlugConnected data-icon="inline-start" />
          输入管理密钥
        </Button>
      </EmptyContent>
    </Empty>
  )
}
