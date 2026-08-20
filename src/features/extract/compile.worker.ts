import type { CompileRequest } from "@/core/nodes"
import { compileForWorkbench } from "./compile"
import type { CompileOutcome } from "./compile"

export interface CompileMessage extends CompileRequest {
  id: number
}

export interface CompileAnswer extends CompileOutcome {
  id: number
}

/**
 * Compiling a node list, off the main thread. It is the workbench's whole cost and it is pure, so it
 * belongs here: a megabyte of source takes long enough that running it on the main thread freezes
 * the page for the entire run — including the button that says a run is in progress.
 *
 * The request id is echoed back because the caller may have moved on: a second run can be started
 * before the first answer arrives, and an answer that cannot be matched to what was asked would
 * describe a document nobody requested.
 */
self.addEventListener("message", (event: MessageEvent<CompileMessage>) => {
  const { id, ...request } = event.data
  const answer: CompileAnswer = { ...compileForWorkbench(request), id }
  // A worker's `postMessage` takes a transfer list second, not an origin; the rule means the
  // `window` one.
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- see above
  self.postMessage(answer)
})
