import { inspectSnapshot } from "./inspect-snapshot"
import type { InspectedSnapshot } from "./inspect-snapshot"

export interface InspectRequest {
  content: string
  id: number
}

export interface InspectResponse extends InspectedSnapshot {
  id: number
}

/**
 * Parsing a delivered document, off the main thread. It is the expensive half of the preview and it
 * is pure, so it belongs here: the trigger's spinner keeps spinning while this runs, which is the
 * whole point.
 *
 * The request id is echoed back because the caller may have moved on — a second snapshot can be
 * posted before the first answer arrives, and a reply that cannot be matched to what was asked would
 * describe the wrong document.
 */
self.addEventListener("message", (event: MessageEvent<InspectRequest>) => {
  const { content, id } = event.data
  const response: InspectResponse = { ...inspectSnapshot(content), id }
  // A worker's `postMessage` takes a transfer list second, not an origin; the rule means the
  // `window` one.
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- see above
  self.postMessage(response)
})
