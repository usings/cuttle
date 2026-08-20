import type { CanonicalNode } from "../types"
import { isDialablePort } from "../values"
import type { ProcessorModule } from "./types"

/** Names airports put in the list to carry information rather than a server anyone connects to. */
const NOTICE_NAME = /(?:网址|網址|流量|时间|時間|应急|應急|过期|過期|bandwidth|expire)/i

function isUseful(node: CanonicalNode) {
  if (!isDialablePort(node.port)) return false
  if (NOTICE_NAME.test(node.name)) return false
  // A credential outside ASCII is a placeholder or a mangled encoding, never something that dials.
  for (const field of ["cipher", "password"] as const) {
    const value = node[field]
    if (
      typeof value === "string" &&
      [...value].some((character) => (character.codePointAt(0) ?? 0) > 127)
    ) {
      return false
    }
  }
  return true
}

export const filterUselessProcessor: ProcessorModule<"filter-useless"> = {
  type: "filter-useless",
  params: [],

  parse: () => ({ type: "filter-useless" }),

  apply: (nodes) => nodes.filter((node) => isUseful(node)),
}
