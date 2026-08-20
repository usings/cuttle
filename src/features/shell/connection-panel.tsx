import { IconPlugConnected, IconPlugConnectedX } from "@tabler/icons-react"
import { useNavigate, useSearch } from "@tanstack/react-router"
import { useState } from "react"
import { SideSurface } from "@/components/side-surface"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  hasAdminToken,
  useAdminBusy,
  useAdminToken,
  useConnect,
  useConnected,
  useDisconnect,
} from "@/features/session"

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
  // `strict: false`: this panel is mounted from `AppShell`, under both `/` and `/subscriptions`, so
  // it cannot be bound to either route's own search type — only the root's `connect` matters here.
  const search = useSearch({ strict: false })
  const adminToken = useAdminToken()
  const connected = useConnected()
  const connectionOpen = search.connect === true
  const loading = useAdminBusy()
  const connect = useConnect()
  const disconnect = useDisconnect()
  // The field edits a draft: nothing reaches the session, sessionStorage or the admin API until the
  // footer button commits it, so half-typed keys never drop the connection that is already working.
  const [draft, setDraft] = useState(adminToken)
  const [failure, setFailure] = useState("")
  // The key on screen is the one already working, so there is nothing to commit — what the session
  // still needs from here is the way out of it.
  const committed = connected && draft === adminToken

  // Reopening the panel, or the session's key changing under it, discards whatever was half-typed.
  // Adjusted while rendering rather than in an effect: the reset belongs to the same commit the
  // panel opens in, and `connectionOpen` is a reason to reset rather than a value the reset reads —
  // which is exactly the shape an effect dependency list cannot express.
  const [tracked, setTracked] = useState({ adminToken, connectionOpen })
  if (tracked.adminToken !== adminToken || tracked.connectionOpen !== connectionOpen) {
    setTracked({ adminToken, connectionOpen })
    setDraft(adminToken)
    setFailure("")
  }

  function setConnectionOpen(open: boolean) {
    void navigate({ to: ".", search: (prev) => ({ ...prev, connect: open ? true : undefined }) })
  }

  async function commit() {
    const reason = await connect(draft)
    // Failures stay inline in the field; a success has nothing left to say here, so the panel goes.
    setFailure(reason ?? "")
    if (!reason) setConnectionOpen(false)
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
          <Button variant="outline" onClick={disconnect}>
            <IconPlugConnectedX data-icon="inline-start" />
            断开连接
          </Button>
        ) : (
          <Button onClick={() => void commit()} disabled={loading || !hasAdminToken(draft)}>
            <IconPlugConnected data-icon="inline-start" />
            {loading ? "连接中" : "连接"}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-6">
        <Field data-invalid={Boolean(failure)}>
          <FieldLabel htmlFor="admin-token">管理密钥</FieldLabel>
          <Input
            id="admin-token"
            type="password"
            autoComplete="off"
            value={draft}
            placeholder="CUTTLE_TOKEN"
            aria-invalid={Boolean(failure)}
            onChange={(event) => {
              setDraft(event.target.value)
              setFailure("")
            }}
          />
          {failure ? <FieldError>{failure}</FieldError> : null}
        </Field>
      </div>
    </SideSurface>
  )
}
