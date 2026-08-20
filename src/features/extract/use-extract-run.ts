import { useCallback, useEffect, useRef, useState } from "react"
import type { NodeProcessor, TargetId } from "@/core/nodes"
import { useWebWorker } from "@/shared/web-worker"
import { compileForWorkbench } from "./compile"
import type { CompiledOutput, CompileOutcome } from "./compile"
import type { CompileAnswer, CompileMessage } from "./compile.worker"

/** Kept out of the hook so the same worker module is never described two ways. */
function createCompileWorker() {
  return new Worker(new URL("./compile.worker.ts", import.meta.url), { type: "module" })
}

/** What a compile run is compiled from — the workbench's own comparison of "did this go stale". */
export interface ExtractInputs {
  source: string
  target: TargetId
  processors: NodeProcessor[]
}

/**
 * A compile result plus the inputs it was compiled from, so staleness (see `isStale`) is a plain
 * comparison rather than something re-derived from component state on every render.
 */
export interface Generated extends CompiledOutput {
  inputs: ExtractInputs
}

/**
 * Change the source, the client or any rule and the result goes stale, which flips the primary
 * button from "存为订阅" back to "生成". One function, so it can be tested without rendering anything.
 *
 * Nothing generated yet is not the same as stale — a fresh page has no result to be stale about.
 * Processor order is compared too (via `JSON.stringify`, so order counts): a rule chain reordered
 * is a different chain even though the same rules are all still there.
 */
export function isStale(generated: Generated | null, inputs: ExtractInputs): boolean {
  if (!generated) return false
  return (
    generated.inputs.source !== inputs.source ||
    generated.inputs.target !== inputs.target ||
    JSON.stringify(generated.inputs.processors) !== JSON.stringify(inputs.processors)
  )
}

/**
 * Owns the workbench's compile run: what came out, what went wrong, and whether one is in flight.
 * The caller resolves its own input text (a pasted source or a fetched remote one) and passes the
 * resolved text in separately from `inputs`, since reading a remote source is the caller's concern
 * (it goes through the admin API) and has nothing to do with what a compile run is.
 *
 * The run happens in a worker. A megabyte of source is most of a second of pure computation, and on
 * this thread that second is one frozen frame: the button could not repaint to say it was working,
 * so `generating` was a flag nothing could ever observe — set and cleared inside a single commit.
 *
 * `inputs` stays here rather than travelling with the request. In local mode `inputs.source` *is*
 * the text, and posting both would structured-clone the whole source twice.
 */
export function useExtractRun() {
  const [generated, setGenerated] = useState<Generated | null>(null)
  const [errorMessage, setErrorMessage] = useState("")
  const [generating, setGenerating] = useState(false)
  const {
    data: answer,
    error: workerError,
    isSupported,
    post,
  } = useWebWorker<CompileMessage, CompileAnswer>(createCompileWorker)
  // Which run is outstanding, so an answer to a superseded one is dropped rather than shown as a
  // description of inputs the user has already changed.
  const pending = useRef<{ id: number; inputs: ExtractInputs } | null>(null)
  const nextId = useRef(0)

  // Stable, so the effect below may depend on it and the two paths a run can settle through — the
  // worker's answer and the no-worker fallback — cannot drift into reporting a run differently.
  const settle = useCallback((inputs: ExtractInputs, outcome: CompileOutcome) => {
    setGenerating(false)
    setGenerated(outcome.output && { ...outcome.output, inputs })
    setErrorMessage(outcome.error)
  }, [])

  useEffect(() => {
    const request = pending.current
    if (!answer || !request || answer.id !== request.id) return
    pending.current = null
    settle(request.inputs, { error: answer.error, output: answer.output })
  }, [answer, settle])

  function run(inputs: ExtractInputs, text: string) {
    const request = { processors: inputs.processors, source: text, target: inputs.target }
    nextId.current += 1
    pending.current = { id: nextId.current, inputs }
    // `post` is asked, not assumed: it refuses when there is no live worker to take the message, and
    // a run posted into nothing would leave the button reading 生成中 with no answer ever coming.
    if (isSupported && post({ ...request, id: nextId.current })) {
      setGenerating(true)
      return
    }
    // Nothing took it, so it runs here — a frozen frame beats no output.
    pending.current = null
    settle(inputs, compileForWorkbench(request))
  }

  return {
    generated,
    // A worker that died takes the run with it, and no answer is ever coming: reporting the failure
    // is also what stops the button saying "生成中" for the rest of the session.
    errorMessage: workerError ?? errorMessage,
    generating: generating && workerError === null,
    run,
  }
}
