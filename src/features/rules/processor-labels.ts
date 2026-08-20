import { DEDUPE_DEFAULT_FIELDS } from "@/core/nodes"
import type { NodeProcessor, ProcessorField, SetOption } from "@/core/nodes"
import { SORTABLE_FIELDS } from "./rule-chain-state"
import type { SortableField } from "./rule-chain-state"

/**
 * What each rule is called, and how one reads back with its arguments.
 *
 * The wording lives here rather than in `core/nodes/processors/`, because a rule's name is a property
 * of this interface and not of the transform: core answers with a `type` and nothing else, so nothing
 * in it has to know which language anybody reads. That also means the mapping has to be exhaustive —
 * `Record<NodeProcessor["type"], string>` is what makes a rule added to core without a name here a
 * type error rather than a row reading `set-options` on screen.
 */
const PROCESSOR_LABELS: Record<NodeProcessor["type"], string> = {
  "filter": "名称过滤",
  "rename": "重命名",
  "sort": "排序",
  "dedupe": "去重",
  "handle-duplicates": "重名处理",
  "filter-useless": "过滤无效节点",
  "flag": "地区旗帜",
  "set-options": "设置选项",
}

export function processorLabel(type: NodeProcessor["type"]) {
  return PROCESSOR_LABELS[type]
}

/**
 * What each `set-options` switch is called. Exhaustive over `SetOption` for the reason the table above
 * is over `NodeProcessor["type"]`: a switch core learns to force without a name here would reach the
 * form as its raw key.
 */
export const SET_OPTION_LABELS: Record<SetOption, string> = {
  "udp": "UDP 转发",
  "tfo": "TCP Fast Open",
  "skip-cert-verify": "跳过证书验证",
}

/**
 * The three states a `set-options` switch can be put in, and the one place their wording lives.
 *
 * Three, not two: a switch left alone says nothing about that option and the node keeps whatever its
 * source stated, which is a different instruction from forcing it off. Neither control that offers
 * them can express that in a `Switch`, so both spell the choice out — the workbench as a button
 * group, the editor as a select — and both read the same list, because two encodings of one tri-state
 * is how the two came to disagree about what "默认" leaves behind.
 */
export const SET_OPTION_CHOICES: Array<{ label: string; value: string }> = [
  { label: "默认", value: "unset" },
  { label: "开启", value: "on" },
  { label: "关闭", value: "off" },
]

/** The choice a stated value stands at. */
export function setOptionChoice(value: boolean | undefined) {
  return value === undefined ? "unset" : value ? "on" : "off"
}

/** What a choice states, which for "默认" is nothing at all. */
export function setOptionValue(choice: string) {
  return choice === "unset" ? undefined : choice === "on"
}

/** Which node field a rule names, where a person reads it. */
export const PROCESSOR_FIELD_LABELS: Record<ProcessorField, string> = {
  name: "名称",
  type: "协议",
  server: "地址",
  port: "端口",
}

/**
 * What the sort row offers, built from the state module's own list so the two cannot drift. An empty
 * value is the row's "do not sort", which is why it is an option rather than a separate switch.
 */
export const SORT_FIELD_OPTIONS: Array<{ label: string; value: SortableField | "" }> = [
  { label: "不排序", value: "" },
  ...SORTABLE_FIELDS.map((field) => ({ label: PROCESSOR_FIELD_LABELS[field], value: field })),
]

export const SORT_ORDER_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "升序", value: "asc" },
  { label: "降序", value: "desc" },
]

/**
 * A one-line summary. Rules that take arguments show the ones worth reading; the rest are their own
 * description, so they fall through to the label alone.
 *
 * `dedupe`'s fields come from `DEDUPE_DEFAULT_FIELDS` rather than being spelled out again: a rule that
 * states none of its own groups on those, and naming a different set here would describe a rule that
 * is not the one running.
 */
export function describeProcessor(processor: NodeProcessor) {
  const label = processorLabel(processor.type)
  switch (processor.type) {
    case "filter":
      return `${label}（${processor.pattern}）`
    case "rename":
      return `${label}（→ ${processor.replacement || "空"}）`
    case "sort":
      return `${label}（${processor.field ?? "name"}）`
    case "dedupe":
      return `${label}（${(processor.fields?.length ? processor.fields : DEDUPE_DEFAULT_FIELDS).join(", ")}）`
    case "flag":
      return `${label}（${processor.mode === "add" ? "添加" : "移除"}）`
    default:
      return label
  }
}
