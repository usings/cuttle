import type { NodeProcessor, TargetId } from "@/core/nodes"
import type { SubscriptionRecord, SubscriptionSource } from "@/core/subscriptions"
import type { WorkbenchHandoff } from "@/features/session"
import { splitSourceUrls } from "../source-urls"
import { DEFAULT_TARGET } from "../targets"

export interface EditorValues {
  defaultTarget: TargetId
  enabled: boolean
  id?: string
  name: string
  processors: NodeProcessor[]
  sourceType: SubscriptionSource["type"]
  sourceValue: string
}

export const EMPTY_EDITOR_VALUES: EditorValues = {
  name: "",
  sourceType: "remote",
  sourceValue: "",
  defaultTarget: DEFAULT_TARGET,
  processors: [],
  enabled: true,
}

function sourceToValues(source: SubscriptionSource) {
  return {
    sourceType: source.type,
    sourceValue: source.type === "raw" ? source.content : source.urls.join("\n"),
  }
}

export function editorValuesFromRecord(subscription: SubscriptionRecord): EditorValues {
  return {
    id: subscription.id,
    name: subscription.name,
    ...sourceToValues(subscription.source),
    defaultTarget: subscription.defaultTarget,
    processors: subscription.processors ?? [],
    enabled: subscription.enabled,
  }
}

/** Turns the workbench's "存为订阅" hand-off into a prefilled draft, keeping its source kind. */
export function editorValuesFromHandoff(handoff: WorkbenchHandoff): EditorValues {
  return {
    ...EMPTY_EDITOR_VALUES,
    ...sourceToValues(handoff.source),
    defaultTarget: handoff.defaultTarget,
    processors: handoff.processors,
  }
}

export function sourceFromValues(values: EditorValues): SubscriptionSource {
  if (values.sourceType === "raw") return { type: "raw", content: values.sourceValue }
  return { type: "remote", urls: splitSourceUrls(values.sourceValue) }
}
