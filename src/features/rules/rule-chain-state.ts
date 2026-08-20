import { SET_OPTIONS } from "@/core/nodes"
import type { NodeProcessor, ProcessorField, SetOption } from "@/core/nodes"
import { PROCESSOR_PRESETS } from "./presets"

/**
 * The fields the sort row offers. Narrower than `ProcessorField` on purpose: sorting a node list by
 * address or port orders it by something nobody reads, so the row does not offer either — while
 * `dedupe` and `handle-duplicates` still group on them, which is what those fields are for.
 */
export const SORTABLE_FIELDS = ["name", "type"] as const satisfies readonly ProcessorField[]

export type SortableField = (typeof SORTABLE_FIELDS)[number]

export interface RuleChainState {
  enabledPresets: string[]
  filterPattern: string
  renamePattern: string
  renameReplacement: string
  /** The field to sort on; empty is the row saying "do not sort", so the rule is absent. */
  sortField: SortableField | ""
  sortDescending: boolean
  /** An absent key is the rule saying nothing about that switch, which is not the same as `false`. */
  setOptions: Partial<Record<SetOption, boolean>>
}

export const EMPTY_RULE_CHAIN: RuleChainState = {
  enabledPresets: [],
  filterPattern: "",
  renamePattern: "",
  renameReplacement: "",
  sortField: "",
  sortDescending: false,
  setOptions: {},
}

export function ruleChainToProcessors(rules: RuleChainState): NodeProcessor[] {
  const list: NodeProcessor[] = []
  if (rules.filterPattern) {
    list.push({ type: "filter", field: "name", pattern: rules.filterPattern })
  }
  if (rules.renamePattern) {
    list.push({
      type: "rename",
      pattern: rules.renamePattern,
      replacement: rules.renameReplacement,
    })
  }
  if (rules.sortField) {
    // `order` only when it is `desc`: ascending is the direction `sort` takes when nothing is stated,
    // so saying it would add a field that changes nothing — and one the form could not read back out.
    list.push({
      type: "sort",
      field: rules.sortField,
      ...(rules.sortDescending ? { order: "desc" as const } : {}),
    })
  }
  for (const preset of PROCESSOR_PRESETS) {
    if (rules.enabledPresets.includes(preset.value.type)) list.push(preset.value)
  }
  // Last, and that is the point: it forces a switch on whatever survived every rule above, so a node
  // added or renamed earlier is covered too. It states nothing about order or names, so nothing after
  // it could care.
  if (Object.keys(rules.setOptions).length > 0) {
    list.push({ type: "set-options", values: rules.setOptions })
  }
  return list
}

// Object key order must not affect processor identity.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .toSorted(([left], [right]) => (left < right ? -1 : 1))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    return `{${entries.join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

function sameProcessor(left: NodeProcessor, right: NodeProcessor) {
  return canonical(left) === canonical(right)
}

interface PreservedProcessor {
  after: number
  processor: NodeProcessor
}

export interface RuleChainSplit {
  preserved: PreservedProcessor[]
  rules: RuleChainState
}

/**
 * The order the form can absorb a chain in, which is `ruleChainToProcessors`'s own order. A rule that
 * arrives out of this order cannot be moved into a form row without reordering the chain, so it is
 * preserved where it stands instead.
 */
const SLOTS = ["filter", "rename", "sort", "presets", "set-options"] as const

function slotOf(processor: NodeProcessor): (typeof SLOTS)[number] {
  if (processor.type === "filter") return "filter"
  if (processor.type === "rename") return "rename"
  if (processor.type === "sort") return "sort"
  if (processor.type === "set-options") return "set-options"
  return "presets"
}

function fill(rules: RuleChainState, processor: NodeProcessor, slot: (typeof SLOTS)[number]) {
  if (slot === "filter" && processor.type === "filter") {
    const { field = "name", flags, keep, pattern, ...rest } = processor
    if (flags !== undefined || keep !== undefined || Object.keys(rest).length > 1) return false
    if (field !== "name") return false
    rules.filterPattern = pattern
    return true
  }
  if (slot === "rename" && processor.type === "rename") {
    if (processor.flags !== undefined) return false
    rules.renamePattern = processor.pattern
    rules.renameReplacement = processor.replacement
    return true
  }
  if (slot === "sort" && processor.type === "sort") {
    const { field, order, ...rest } = processor
    if (Object.keys(rest).length > 1) return false
    // `field` is absent only on a definition no validator produced — `parse` always resolves one — and
    // the row has no state for "unstated", which is what an empty `sortField` already means.
    if (!field) return false
    // A field the row does not offer cannot come back out of it, so the rule stays where it is.
    if (!SORTABLE_FIELDS.includes(field as SortableField)) return false
    // A stated `asc` is the default said out loud. The row does not state it, so absorbing one would
    // drop the field on the way back out and rewrite the stored rule.
    if (order === "asc") return false
    rules.sortField = field as SortableField
    rules.sortDescending = order === "desc"
    return true
  }
  if (slot === "set-options" && processor.type === "set-options") {
    const stated = Object.entries(processor.values).filter(([, value]) => value !== undefined)
    if (stated.length === 0) return false
    if (!stated.every(([key]) => SET_OPTIONS.includes(key as SetOption))) return false
    rules.setOptions = Object.fromEntries(stated) as RuleChainState["setOptions"]
    return true
  }
  const preset = PROCESSOR_PRESETS.find((item) => sameProcessor(item.value, processor))
  if (!preset || rules.enabledPresets.includes(preset.value.type)) return false
  rules.enabledPresets.push(preset.value.type)
  return true
}

export function splitProcessors(processors: NodeProcessor[]): RuleChainSplit {
  // A fresh `enabledPresets` and `setOptions`, not the shared ones: `fill` pushes into the array and
  // assigns the record, so reusing `EMPTY_RULE_CHAIN`'s would leak into every later split.
  const rules: RuleChainState = { ...EMPTY_RULE_CHAIN, enabledPresets: [], setOptions: {} }
  const preserved: PreservedProcessor[] = []
  let cursor = 0
  let owned = 0

  for (const processor of processors) {
    const slot = slotOf(processor)
    const index = SLOTS.indexOf(slot)
    if (index < cursor || !fill(rules, processor, slot)) {
      preserved.push({ after: owned, processor })
      continue
    }
    cursor = slot === "presets" ? index : index + 1
    owned += 1
  }
  return { preserved, rules }
}

export function mergeRuleChain({ preserved, rules }: RuleChainSplit): NodeProcessor[] {
  const list = ruleChainToProcessors(rules)
  for (const [inserted, entry] of preserved.entries()) {
    const at = Math.min(entry.after + inserted, list.length)
    list.splice(at, 0, entry.processor)
  }
  return list
}

export function togglePreset(
  rules: RuleChainState,
  type: string,
  enabled: boolean,
): RuleChainState {
  return {
    ...rules,
    enabledPresets: enabled
      ? [...rules.enabledPresets, type]
      : rules.enabledPresets.filter((item) => item !== type),
  }
}

/** Cycles one `set-options` switch between stating nothing, stating `true` and stating `false`. */
export function setNodeOption(
  rules: RuleChainState,
  option: SetOption,
  value: boolean | undefined,
): RuleChainState {
  const { [option]: _dropped, ...rest } = rules.setOptions
  return { ...rules, setOptions: value === undefined ? rest : { ...rest, [option]: value } }
}
