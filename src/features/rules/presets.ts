import type { NodeProcessor } from "@/core/nodes"

/**
 * The rules offered as a single switch, because they take no arguments and their whole meaning is
 * whether they run. Both rule-chain forms are built from this list, so the two stay in step.
 */
export const PROCESSOR_PRESETS: Array<{ label: string; value: NodeProcessor }> = [
  { label: "过滤无效节点", value: { type: "filter-useless" } },
  { label: "添加地区旗帜", value: { type: "flag", mode: "add" } },
  {
    label: "重名自动编号",
    value: { type: "handle-duplicates", action: "rename", fields: ["name"] },
  },
  // Appended rather than inserted: the order here is the order `ruleChainToProcessors` emits them in,
  // so moving an existing entry would change what every saved chain compiles to.
  { label: "删除重复节点", value: { type: "dedupe" } },
]
