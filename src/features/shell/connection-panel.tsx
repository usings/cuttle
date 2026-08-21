import { IconPlugConnected, IconPlugConnectedX } from "@tabler/icons-react"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { SideSurface } from "@/components/side-surface"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { hasToken, useConnect, useDisconnect, useToken, useTokenUsable } from "@/features/session"
import { useConnectionPanel } from "./connection-panel-state"

export function ConnectionDot({ connected }: { connected: boolean }) {
  return (
    <span
      aria-hidden
      data-connected={connected}
      className="size-1.5 shrink-0 bg-border data-[connected=true]:bg-primary data-[connected=true]:animate-bounce"
    />
  )
}

export function ConnectionPanel() {
  const navigate = useNavigate()
  const adminToken = useToken()
  const tokenUsable = useTokenUsable()
  const { open: connectionOpen, setOpen: setConnectionOpen } = useConnectionPanel()
  const connect = useConnect()
  const disconnect = useDisconnect()
  // The field edits a draft: nothing reaches the session, sessionStorage or the admin API until the
  // footer button commits it, so half-typed keys never drop the connection that is already working.
  const [draft, setDraft] = useState(adminToken)
  // The key on screen is the one the session is already using, so there is nothing to commit — what
  // the session still needs from here is the way out of it.
  const committed = tokenUsable && draft === adminToken

  // Reopening the panel, or the session's key changing under it, discards whatever was half-typed.
  // Adjusted while rendering rather than in an effect: the reset belongs to the same commit the
  // panel opens in, and `connectionOpen` is a reason to reset rather than a value the reset reads —
  // which is exactly the shape an effect dependency list cannot express.
  const [tracked, setTracked] = useState({ adminToken, connectionOpen })
  if (tracked.adminToken !== adminToken || tracked.connectionOpen !== connectionOpen) {
    setTracked({ adminToken, connectionOpen })
    setDraft(adminToken)
  }

  // The panel lives in the URL, so one navigation both closes it and leaves the page the session
  // just lost the right to read: `/` is the one page that works without a key, and the navigation
  // does not even list the others while disconnected. Same exit the gate takes when the API refuses
  // a key (`connection-gate.tsx`) — a refused session and a deliberate one leave the same way.
  function disconnectAndLeave() {
    disconnect()
    void navigate({ to: "/", replace: true, viewTransition: true })
  }

  // Committing a key asks the API nothing (`session/queries.ts`), so there is no verdict to wait for
  // and none to report: the panel has said everything it can and goes. What the key is worth shows
  // up where it is spent — the first admin read either returns the page or takes the reader off it.
  function commit() {
    connect(draft)
    setConnectionOpen(false)
  }

  return (
    <SideSurface
      className="data-[side=right]:sm:max-w-md"
      description="管理密钥只保存在当前浏览器会话，不会写入 D1，也不会随订阅一起持久化。"
      onOpenChange={setConnectionOpen}
      open={connectionOpen}
      title="管理连接"
      actions={
        committed ? (
          <Button variant="outline" onClick={disconnectAndLeave}>
            <IconPlugConnectedX data-icon="inline-start" />
            断开连接
          </Button>
        ) : (
          <Button onClick={commit} disabled={!hasToken(draft)}>
            <IconPlugConnected data-icon="inline-start" />
            连接
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-6">
        <Field>
          <FieldLabel htmlFor="admin-token">管理密钥</FieldLabel>
          <Input
            id="admin-token"
            type="password"
            autoComplete="off"
            value={draft}
            placeholder="CUTTLE_TOKEN"
            onChange={(event) => setDraft(event.target.value)}
          />
        </Field>
      </div>
    </SideSurface>
  )
}
