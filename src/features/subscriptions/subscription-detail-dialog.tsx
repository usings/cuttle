import {
  IconChevronRight,
  IconEdit,
  IconKey,
  IconListDetails,
  IconLoader2,
  IconTrash,
  IconX,
} from "@tabler/icons-react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"
import { cn } from "tailwind-variants"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { targetLabel } from "@/core/nodes"
import type { CanonicalNode } from "@/core/nodes"
import { DEFAULT_FRESH_ARTIFACT_MS } from "@/core/subscriptions"
import type { SubscriptionRecord, SubscriptionSummary } from "@/core/subscriptions"
import { NodeTable } from "@/features/extract/node-table"
import { describeProcessor } from "@/features/rules"
import { useWebWorker } from "@/shared/web-worker"
import { inspectSnapshot } from "./inspect-snapshot"
import type { InspectedSnapshot } from "./inspect-snapshot"
import type { InspectRequest, InspectResponse } from "./inspect-snapshot.worker"
import { describeLastCompile, describeSource } from "./labels"
import { useSubscriptionSnapshot } from "./queries"
import { SOURCE_TYPE_LABELS } from "./source-types"
import { LABEL, StateLabel } from "./subscription-row"
import type { SubscriptionRowActions } from "./subscription-row"

/** Kept out of the hook so the same worker module is never described two ways. */
function createInspectWorker() {
  return new Worker(new URL("./inspect-snapshot.worker.ts", import.meta.url), { type: "module" })
}

function Stat({ label, tone, value }: { label: string; tone?: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5 p-3.5 not-last:border-r md:px-4">
      <span className={LABEL}>{label}</span>
      <span className={cn("text-[15px] font-semibold -tracking-[0.01em]", tone)}>{value}</span>
    </div>
  )
}

function NumberedLine({ children, index }: { children: string; index: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="inline-flex size-4.5 shrink-0 items-center justify-center bg-muted text-[10px] font-semibold"
      >
        {index}
      </span>
      <span className="text-[12.5px] leading-snug">{children}</span>
    </span>
  )
}

type NodePreview =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "failed"; message: string }
  | { status: "ready"; nodes: CanonicalNode[]; recorded: number; version: number }

/**
 * The nodes in the document this subscription last handed a subscriber — read out of storage, never
 * recompiled. That is the whole point of previewing here rather than in the workbench: the count in
 * the stat above comes from this same artifact, so the two cannot disagree about what went out.
 *
 * Two steps, and neither runs on the main thread's critical path: read the stored document, then
 * parse a node list back out of it in a worker. The parse is the expensive half for a large document
 * — off the main thread it leaves the trigger's spinner actually spinning, which an effect on this
 * thread could not do: it would paint the spinner and then freeze it.
 *
 * Nothing happens until `wanted`. Afterwards the query keeps its cache and this keeps its state, so
 * collapsing and expanding again costs neither a request nor a reparse.
 */
function useNodePreview(subscription: SubscriptionSummary, wanted: boolean): NodePreview {
  const { failure, loaded, snapshot } = useSubscriptionSnapshot(
    subscription.id,
    subscription.defaultTarget,
    wanted,
  )
  const {
    data: answer,
    error: workerError,
    isSupported,
    post,
  } = useWebWorker<InspectRequest, InspectResponse>(createInspectWorker)
  // Keyed on the snapshot it came from, by reference: an answer that arrives after a refetch has
  // replaced the document must not be shown as a description of the new one.
  const [parsed, setParsed] = useState<{ from: object; result: InspectedSnapshot } | null>(null)
  const posted = useRef<{ from: object; id: number } | null>(null)
  const nextId = useRef(0)

  // No worker to hand it to, so the parse runs here — a frozen frame beats no preview. Derived in
  // render rather than pushed into state by an effect: with nothing asynchronous to wait for, the
  // answer is a function of the snapshot, and state would only re-render to say what render knew.
  const onThisThread = useMemo(
    () => (isSupported || !snapshot ? null : inspectSnapshot(snapshot.content)),
    [isSupported, snapshot],
  )

  useEffect(() => {
    if (!snapshot || !isSupported) return
    nextId.current += 1
    posted.current = { from: snapshot, id: nextId.current }
    post({ content: snapshot.content, id: nextId.current })
  }, [isSupported, post, snapshot])

  useEffect(() => {
    const request = posted.current
    if (!answer || !request || answer.id !== request.id) return
    setParsed({ from: request.from, result: { error: answer.error, nodes: answer.nodes } })
  }, [answer])

  if (failure) return { status: "failed", message: failure.message }
  if (workerError) return { status: "failed", message: workerError }
  if (!loaded) return { status: "loading" }
  if (!snapshot) return { status: "empty" }
  const preview = onThisThread ? { from: snapshot, result: onThisThread } : parsed
  if (preview?.from !== snapshot) return { status: "loading" }
  if (preview.result.error)
    return { status: "failed", message: `快照无法解析：${preview.result.error}` }
  return {
    nodes: preview.result.nodes,
    recorded: snapshot.nodeCount,
    status: "ready",
    version: snapshot.subscriptionVersion,
  }
}

/**
 * Never rendered while the preview is still loading — the surface stays shut until then, so there is
 * no in-place spinner to write copy for.
 *
 * A parse that finds a different number than the artifact recorded is reported rather than smoothed
 * over: it would mean this client's format cannot round-trip, and hiding that would make the table
 * quietly wrong.
 */
function NodePreviewBody({
  definitionVersion,
  preview,
}: {
  definitionVersion: number
  preview: NodePreview
}) {
  if (preview.status === "loading") return null
  if (preview.status === "failed") return <PreviewNote>{preview.message}</PreviewNote>
  if (preview.status === "empty") {
    return <PreviewNote>还没有编译过快照，下一次有人拉取这条订阅时才会生成。</PreviewNote>
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Rare but reachable: editing a subscription drops its artifacts, so an older one survives
          only when a delivery that was already compiling wrote it afterwards. Saying so beats a
          table that silently describes a definition the operator has since changed. */}
      {preview.version === definitionVersion ? null : (
        <PreviewNote>
          这份快照编译自 v{preview.version}，当前定义已经是 v{definitionVersion}
          ——下一次拉取会重新编译。
        </PreviewNote>
      )}
      {preview.nodes.length === preview.recorded ? null : (
        <PreviewNote>
          快照记录了 {preview.recorded} 个节点，但从它的正文里只解析回
          {preview.nodes.length} 个：这个客户端的格式无法完整往回解析。
        </PreviewNote>
      )}
      <NodeTable nodes={preview.nodes} />
    </div>
  )
}

function PreviewNote({ children }: { children: ReactNode }) {
  return <span className="text-[12.5px] leading-relaxed text-muted-foreground">{children}</span>
}

/**
 * Opened by clicking a row in the subscription table. Stays a centred dialog at every width — the
 * content is a read-only summary, so there is nothing here that a Drawer's reachability would buy.
 */
export function SubscriptionDetailDialog({
  detail,
  actions,
  onOpenChange,
  onOpenChangeComplete,
  open,
  subscription,
}: {
  detail: SubscriptionRecord | null
  actions: SubscriptionRowActions
  onOpenChange: (open: boolean) => void
  onOpenChangeComplete?: (open: boolean) => void
  open: boolean
  subscription: SubscriptionSummary
}) {
  const processors = detail?.processors ?? []
  const compile = describeLastCompile(subscription)
  // What the operator asked for, which is not yet what the surface shows: the preview opens only
  // once it has something to open onto.
  const [previewWanted, setPreviewWanted] = useState(false)
  const preview = useNodePreview(subscription, previewWanted)
  const previewOpen = previewWanted && preview.status !== "loading"

  return (
    <Dialog open={open} onOpenChange={onOpenChange} onOpenChangeComplete={onOpenChangeComplete}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[92svh] flex-col gap-0 p-0 sm:max-w-2xl"
      >
        <DialogHeader className="flex-none flex-row items-start justify-between gap-4 border-b p-4 md:px-6 md:py-5">
          <div className="flex min-w-0 flex-col gap-1.5">
            <DialogTitle className="md:text-xl">{subscription.name}</DialogTitle>
            {/* A div, not the default `p`: the meta line carries separators, which `p` cannot hold. */}
            <DialogDescription
              render={<div />}
              className={cn("flex flex-wrap items-center gap-2.5 md:gap-3", LABEL)}
            >
              <span>
                {detail
                  ? describeSource(detail.source)
                  : `${SOURCE_TYPE_LABELS[subscription.sourceType]} · 读取中`}
              </span>
              <Separator orientation="vertical" className="h-2.75" />
              <StateLabel dot subscription={subscription} />
            </DialogDescription>
          </div>
          <DialogClose
            render={<Button variant="ghost" size="icon-xs" className="flex-none max-md:size-10" />}
            aria-label="关闭"
          >
            <IconX />
          </DialogClose>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="grid grid-cols-2 border-b md:grid-cols-4">
            <Stat label="节点数" value={subscription.nodeCount?.toString() ?? "—"} />
            <Stat label="客户端" value={targetLabel(subscription.defaultTarget)} />
            <Stat
              label="最近编译"
              value={compile.text}
              tone={compile.failed ? "text-destructive" : undefined}
            />
            <Stat label="快照版本" value={`v${subscription.version}`} />
          </div>

          <Collapsible className="border-b" open={previewOpen} onOpenChange={setPreviewWanted}>
            <CollapsibleTrigger
              render={
                <button
                  type="button"
                  className="flex h-11 w-full items-center gap-2.5 px-4 text-left md:px-6"
                />
              }
            >
              <IconListDetails className="size-3.5 shrink-0 text-muted-foreground" />
              <span className={LABEL}>预览节点</span>
              {previewWanted && !previewOpen ? (
                <IconLoader2 className="ml-auto size-3.5 shrink-0 animate-spin text-muted-foreground" />
              ) : (
                <IconChevronRight
                  className={cn(
                    "ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out",
                    previewOpen && "rotate-90",
                  )}
                />
              )}
            </CollapsibleTrigger>
            <CollapsibleContent className="px-4 pb-4 md:px-6">
              <NodePreviewBody definitionVersion={subscription.version} preview={preview} />
            </CollapsibleContent>
          </Collapsible>

          {subscription.lastError ? (
            <div className="flex flex-col gap-1 border-b bg-destructive/5 p-4 md:px-6">
              <span className={cn(LABEL, "text-destructive")}>最近错误</span>
              <span className="text-[12.5px] leading-relaxed text-destructive">
                {subscription.lastError}
              </span>
            </div>
          ) : null}

          <div className="flex flex-col gap-2.5 p-4 md:px-6 md:py-4.5">
            <span className={LABEL}>规则链 · {processors.length} 条</span>
            {detail === null ? (
              <span className="text-[12.5px] text-muted-foreground">读取中</span>
            ) : processors.length === 0 ? (
              <span className="text-[12.5px] text-muted-foreground">未配置规则</span>
            ) : (
              processors.map((processor, index) => (
                // A rule chain is ordered and read-only here, so position is the identity.
                // oxlint-disable-next-line react/no-array-index-key
                <NumberedLine key={index} index={index + 1}>
                  {describeProcessor(processor)}
                </NumberedLine>
              ))
            )}
            <span className="mt-1 border-t pt-2.5 text-xs leading-relaxed text-muted-foreground">
              同版本快照 {DEFAULT_FRESH_ARTIFACT_MS / 1000} 秒内直接复用，配置改动会立即失效。
            </span>
          </div>
        </div>

        <DialogFooter className="flex-none flex-row gap-2 border-t p-3 md:px-6 md:py-3.5">
          <Button
            variant="outline"
            size="lg"
            className="flex-1 md:h-10 md:flex-none"
            onClick={() => actions.onRotate(subscription)}
          >
            <IconKey data-icon="inline-start" />
            轮换
          </Button>
          <Button
            variant="destructive"
            size="lg"
            className="flex-1 md:h-10 md:flex-none"
            onClick={() => actions.onRemove(subscription)}
          >
            <IconTrash data-icon="inline-start" />
            删除
          </Button>
          <Button
            size="lg"
            className="flex-[1.4] md:h-10 md:flex-none"
            onClick={() => actions.onEdit(subscription)}
          >
            <IconEdit data-icon="inline-start" />
            编辑订阅
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
