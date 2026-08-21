import {
  IconAlertTriangle,
  IconCheck,
  IconChevronUp,
  IconClipboard,
  IconCode,
  IconDatabase,
  IconDownload,
  IconListDetails,
  IconSparkles,
} from "@tabler/icons-react"
import { getRouteApi } from "@tanstack/react-router"
import { useEffect, useMemo, useState } from "react"
import { cn } from "tailwind-variants"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { EMPTY_RULE_CHAIN, RuleChain, ruleChainToProcessors } from "@/features/rules"
import type { RuleChainState } from "@/features/rules"
import { useTokenUsable } from "@/features/session"
import type { WorkbenchHandoff } from "@/features/session"
import { SOURCE_TYPE_LABELS } from "@/features/subscriptions/source-types"
import { splitSourceUrls } from "@/features/subscriptions/source-urls"
import { DEFAULT_TARGET, TARGET_OPTIONS } from "@/features/subscriptions/targets"
import { useMediaQuery } from "@/shared/media-query"
import { NodeTable } from "./node-table"
import { useReadRemoteSource } from "./remote-source"
import { isStale, useExtractRun } from "./use-extract-run"
import type { ExtractInputs } from "./use-extract-run"
import { MONO_BLOCK, PANEL_HEAD, PanelHead } from "./workbench-panels"

export type StepKey = "source" | "process" | "output"

const STEPS: Array<{ index: string; key: StepKey; label: string }> = [
  { key: "source", index: "01", label: "源" },
  { key: "process", index: "02", label: "处理" },
  { key: "output", index: "03", label: "输出" },
]

/**
 * Both tabs empty out for the same reason, and it is the one a user is least likely to guess: the
 * source parsed and the rules ran, and then the client refused what came out. Stated once so the two
 * cannot drift into blaming different things for one situation.
 */
const NOTHING_RENDERED =
  "没有节点输出为当前客户端——检查节点源与规则链，也可能是这个客户端带不了它们。"

/** The two output tabs are one control; only their icon and label differ. */
const OUTPUT_TAB =
  "h-10 flex-none px-2.5 after:hidden data-active:shadow-[inset_0_-2px_0_var(--foreground)]"

const routeApi = getRouteApi("/")

export function ExtractWorkbench() {
  const navigate = routeApi.useNavigate()
  const search = routeApi.useSearch()
  const tokenUsable = useTokenUsable()
  const readRemoteSource = useReadRemoteSource()
  const { generated, errorMessage, generating, run } = useExtractRun()

  const [source, setSource] = useState("")
  const [sourceMode, setSourceMode] = useState<"local" | "remote">("local")
  const [sourceUrl, setSourceUrl] = useState("")
  const [target, setTarget] = useState(DEFAULT_TARGET)
  const [rules, setRules] = useState<RuleChainState>(EMPTY_RULE_CHAIN)
  const activeStep = search.step ?? "source"
  const [outputTab, setOutputTab] = useState("output")
  const [copied, setCopied] = useState(false)
  // Which nodes were skipped is detail; that some were is the headline. Each run starts folded so a
  // long list cannot bury the output it belongs to.
  const [skippedOpen, setSkippedOpen] = useState(false)

  const processors = useMemo(() => ruleChainToProcessors(rules), [rules])

  const wide = useMediaQuery("(min-width: 768px)") === true

  useEffect(() => {
    if (!wide || search.step === undefined) return
    void navigate({ search: ({ step: _step, ...rest }) => rest, replace: true })
  }, [navigate, search.step, wide])

  // The tick is an acknowledgement, not a state the button stays in: without this it stood until the
  // next run, so a copy made minutes ago still read as one that had just happened.
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  function setActiveStep(step: StepKey) {
    if (wide) return
    void navigate({ search: (prev) => ({ ...prev, step }), replace: true })
  }

  const remoteMode = tokenUsable && sourceMode === "remote"
  const input = remoteMode ? sourceUrl : source

  const inputs: ExtractInputs = { source: input, target, processors }
  const fresh = generated !== null && !isStale(generated, inputs)

  const nodeCount = fresh ? generated.renderedNodes.length : 0
  /**
   * One line per step, in the two lengths the layout has room for: the sentence a panel header shows,
   * and the suffix the compact step strip can fit after the step's own label. Together rather than in
   * two tables, so a step cannot end up saying different things about itself.
   */
  const stepStatus: Record<StepKey, { compact: string; full: string }> = {
    source: {
      compact: "",
      full: input.trim() ? (remoteMode ? "远程链接" : `${input.length} 个字符`) : "等待输入",
    },
    process: {
      compact: processors.length > 0 ? ` · ${processors.length}` : "",
      full: processors.length > 0 ? `${processors.length} 条规则生效` : "未配置规则",
    },
    output: {
      compact: fresh ? ` · ${nodeCount}` : "",
      full: fresh ? `${nodeCount} 个节点` : generated ? "待重新生成" : "暂未生成",
    },
  }
  async function generate() {
    let text = source
    if (remoteMode) {
      const content = await readRemoteSource
        .mutateAsync(splitSourceUrls(sourceUrl))
        .catch(() => null)
      if (content === null) return
      text = content
    }
    // The panel is set up for the run rather than for its result: the compile answers from a worker
    // now, so there is nothing to wait for here, and a run that ends in a refusal has to land on the
    // panel that shows it — under the old ordering a failed run left the user on 节点源 with an
    // error alert two steps away.
    setCopied(false)
    setSkippedOpen(false)
    setOutputTab("output")
    setActiveStep("output")
    run(inputs, text)
  }

  async function copyOutput() {
    if (!generated) return
    await navigator.clipboard.writeText(generated.content)
    setCopied(true)
  }

  function downloadOutput() {
    if (!generated) return
    const url = URL.createObjectURL(new Blob([generated.content], { type: generated.contentType }))
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `cuttle.${generated.fileExtension}`
    anchor.click()
    // Revoked on the next task, not on this one: `click()` only queues the download, and a URL
    // already released by the time the browser reads it hands back a file that never saves.
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  function saveAsSubscription() {
    const urls = splitSourceUrls(sourceUrl)
    const draft: WorkbenchHandoff = {
      defaultTarget: target,
      processors,
      source: remoteMode ? { type: "remote", urls } : { type: "raw", content: source },
    }
    void navigate({
      to: "/subscriptions",
      search: { mode: "create" },
      state: (prev) => ({ ...prev, subscriptionDraft: draft }),
      viewTransition: true,
    })
  }

  const targetPicker = (
    <Select
      items={TARGET_OPTIONS}
      value={target}
      onValueChange={(value) => setTarget(value as typeof target)}
    >
      <SelectTrigger
        aria-label="目标客户端"
        className="flex-1 border-input px-2.5 max-md:h-11! max-md:bg-background"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {TARGET_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )

  const primaryButton =
    fresh && tokenUsable ? (
      <Button className="max-md:h-11 max-md:px-4.5" onClick={saveAsSubscription}>
        <IconDatabase data-icon="inline-start" />
        存为订阅
      </Button>
    ) : (
      <Button
        className="max-md:h-11 max-md:px-4.5"
        onClick={() => void generate()}
        disabled={!input.trim() || generating}
      >
        <IconSparkles data-icon="inline-start" />
        {generating ? "生成中" : "生成"}
      </Button>
    )

  const outputControls = (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {targetPicker}
      <ButtonGroup>
        {primaryButton}
        <Button
          variant="outline"
          className="max-md:size-11"
          aria-label={copied ? "已复制" : "复制正文"}
          onClick={() => void copyOutput()}
          disabled={!generated}
        >
          {copied ? <IconCheck /> : <IconClipboard />}
        </Button>
        <Button
          variant="outline"
          className="max-md:size-11"
          aria-label="下载正文"
          onClick={downloadOutput}
          disabled={!generated}
        >
          <IconDownload />
        </Button>
      </ButtonGroup>
    </div>
  )

  return (
    <div className="flex flex-1 flex-col md:min-h-0 md:overflow-hidden">
      {/* Below md only: from md up the three panels carry their own `PanelHead`, which is where the
          step marker and the full status line live. Nothing here needs an `md:` variant. */}
      <div className="grid grid-cols-3 border-b bg-sidebar md:hidden">
        {STEPS.map((step, index) => (
          <button
            key={step.key}
            type="button"
            onClick={() => setActiveStep(step.key)}
            data-active={step.key === activeStep}
            className={cn(
              "group/step flex flex-col gap-0.5 px-3 py-2.5 text-left",
              index < STEPS.length - 1 && "border-r",
              "data-[active=true]:shadow-[inset_0_-2px_0_var(--foreground)]",
            )}
          >
            <span className="font-mono text-[10px] text-muted-foreground">{step.index}</span>
            <span className="text-xs font-semibold tracking-widest text-muted-foreground uppercase group-data-[active=true]/step:text-foreground">
              {step.label}
              {stepStatus[step.key].compact}
            </span>
          </button>
        ))}
      </div>

      <div className="grid flex-1 grid-cols-1 md:min-h-0 md:grid-cols-2 md:grid-rows-2 lg:grid-cols-3 lg:grid-rows-1">
        <section
          data-active={activeStep === "source"}
          className="flex flex-col border-b max-md:data-[active=false]:hidden md:col-start-1 md:row-start-1 md:min-h-0 md:border-r lg:border-b-0"
        >
          <PanelHead index="01" title="节点源" status={stepStatus.source.full}>
            <ButtonGroup>
              <Button
                variant={remoteMode ? "outline" : "default"}
                size="xs"
                aria-pressed={!remoteMode}
                onClick={() => setSourceMode("local")}
              >
                {SOURCE_TYPE_LABELS.raw}
              </Button>
              <Button
                variant={remoteMode ? "default" : "outline"}
                size="xs"
                aria-pressed={remoteMode}
                disabled={!tokenUsable}
                onClick={() => setSourceMode("remote")}
              >
                {SOURCE_TYPE_LABELS.remote}
              </Button>
            </ButtonGroup>
          </PanelHead>
          <div className="flex min-h-0 flex-1 flex-col p-4 md:p-5">
            <Textarea
              aria-label={remoteMode ? "远程订阅链接" : "节点源"}
              placeholder="多个链接需要换行或者使用 | 分隔"
              value={input}
              onChange={(event) =>
                remoteMode ? setSourceUrl(event.target.value) : setSource(event.target.value)
              }
              spellCheck={false}
              className={cn(
                MONO_BLOCK,
                "min-h-42 flex-1 resize-y border border-input px-3.5 py-3 md:min-h-0",
              )}
            />
          </div>
        </section>

        <section
          data-active={activeStep === "process"}
          className="flex flex-col border-b max-md:data-[active=false]:hidden md:col-start-1 md:row-start-2 md:min-h-0 md:border-r md:border-b-0 lg:col-start-2 lg:row-start-1"
        >
          <PanelHead index="02" title="规则链" status={stepStatus.process.full} />
          <RuleChain className="min-h-0 overflow-y-auto" value={rules} onChange={setRules} />
        </section>

        <section
          data-active={activeStep === "output"}
          className="flex min-w-0 flex-col max-md:data-[active=false]:hidden md:col-start-2 md:row-span-2 md:row-start-1 md:min-h-0 lg:col-start-3 lg:row-span-1"
        >
          <div className={cn(PANEL_HEAD, "hidden md:flex")}>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">03</span>
            {outputControls}
          </div>

          {errorMessage ? (
            <div className="p-4 md:p-5">
              <Alert variant="destructive">
                <IconAlertTriangle />
                <AlertTitle>无法处理输入</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            </div>
          ) : (
            <>
              <Tabs
                value={outputTab}
                onValueChange={(value) => setOutputTab(value as string)}
                className="min-h-0 flex-1 gap-0"
              >
                <TabsList
                  variant="line"
                  className="h-auto! w-full justify-start gap-1 border-b px-4 py-0 md:px-5"
                >
                  <TabsTrigger value="output" className={OUTPUT_TAB}>
                    <IconCode data-icon="inline-start" />
                    正文
                  </TabsTrigger>
                  <TabsTrigger value="nodes" className={OUTPUT_TAB}>
                    <IconListDetails data-icon="inline-start" />
                    节点
                  </TabsTrigger>
                  <span className="ml-auto self-center truncate text-xs text-muted-foreground">
                    {stepStatus.output.full}
                  </span>
                </TabsList>

                <TabsContent value="output" className="flex min-h-0 flex-col">
                  {generated?.content ? (
                    <pre
                      className={cn(
                        MONO_BLOCK,
                        "m-4 min-h-0 flex-1 overflow-auto bg-muted p-3.5 text-[11px] leading-[1.9] md:m-5",
                      )}
                    >
                      {generated.content}
                    </pre>
                  ) : (
                    <Empty>
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <IconCode />
                        </EmptyMedia>
                        <EmptyTitle>暂无正文</EmptyTitle>
                        <EmptyDescription>
                          {generated
                            ? NOTHING_RENDERED
                            : "选择客户端后点击生成，转换结果会显示在这里。"}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </TabsContent>

                <TabsContent value="nodes" className="flex min-h-0 min-w-0 flex-col p-4 md:p-5">
                  {generated?.renderedNodes.length ? (
                    <NodeTable className="min-h-0 flex-1" nodes={generated.renderedNodes} />
                  ) : (
                    <Empty className="p-8">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <IconListDetails />
                        </EmptyMedia>
                        <EmptyTitle>暂无节点</EmptyTitle>
                        <EmptyDescription>
                          {generated
                            ? NOTHING_RENDERED
                            : "点击生成后，输出到当前客户端的节点会显示在这里。"}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                </TabsContent>
              </Tabs>

              {/* Outside the tabs on purpose: what a run skipped is a property of the run, not of
                  the view you happen to be looking at, so it reads the same from 正文 and 节点. */}
              {generated?.diagnostics.length ? (
                <div className="px-4 pb-4 md:px-5 md:pb-5">
                  <Alert variant="destructive" className="relative">
                    {/* Stays a direct child: the alert's grid puts its icon in column one and spans
                        it down both rows, and only a direct `svg` matches that rule. */}
                    <IconAlertTriangle />
                    <AlertTitle>
                      <button
                        type="button"
                        onClick={() => setSkippedOpen(!skippedOpen)}
                        aria-expanded={skippedOpen}
                        className="flex w-full items-center gap-2 text-left"
                      >
                        {generated.diagnostics.some((diagnostic) => diagnostic.level === "error")
                          ? "转换未完成"
                          : "部分节点未输出"}{" "}
                        · {generated.diagnostics.length} 条
                        <IconChevronUp
                          className={cn(
                            "ml-auto size-3.5 shrink-0 transition-transform duration-150 ease-out",
                            skippedOpen && "rotate-180",
                          )}
                        />
                      </button>
                    </AlertTitle>
                    <AlertDescription
                      inert={!skippedOpen}
                      data-open={skippedOpen}
                      className="absolute -inset-x-px bottom-full z-10 mb-1 border bg-card p-2.5 shadow-md transition-[opacity,translate] duration-150 ease-out data-[open=false]:translate-y-1 data-[open=false]:opacity-0"
                    >
                      <ul className="mask-b-from-85% max-h-40 list-disc space-y-1 overflow-y-auto pb-6 pl-4">
                        {generated.diagnostics.map((diagnostic, index) => (
                          <li key={`${diagnostic.code}-${diagnostic.line ?? index}`}>
                            {diagnostic.message}
                          </li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                </div>
              ) : null}
            </>
          )}
        </section>
      </div>

      {activeStep === "output" ? (
        <div className="sticky bottom-0 z-20 border-t bg-sidebar px-4 py-3 md:hidden">
          {outputControls}
        </div>
      ) : null}
    </div>
  )
}
