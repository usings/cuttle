import { inspectNodeList } from "@/core/nodes"
import type { CanonicalNode } from "@/core/nodes"

export interface InspectedSnapshot {
  error: string
  nodes: CanonicalNode[]
}

/**
 * The node list a delivered document describes. The artifact stores the rendered client document,
 * not a list, so previewing it means parsing one back out — which is the one thing this application
 * is for.
 *
 * A throw is an answer here rather than a failure to be propagated: it means this snapshot cannot be
 * read back at all, which the preview reports. Shared with the worker that runs this off the main
 * thread, so both paths describe a document the same way.
 */
export function inspectSnapshot(content: string): InspectedSnapshot {
  try {
    return { error: "", nodes: inspectNodeList(content).nodes }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "解析失败", nodes: [] }
  }
}
