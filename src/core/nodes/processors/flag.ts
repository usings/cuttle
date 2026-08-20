import type { ProcessorModule } from "./types"
import { fail } from "./validate"

const FLAG_EXPRESSION = /[\p{Regional_Indicator}]{2}/gu

/** The regions worth recognising by name, and the flag each one gets. */
const FLAG_RULES: Array<[RegExp, string]> = [
  [/(?:香港|\bHK\b|Hong Kong)/i, "🇭🇰"],
  [/(?:台湾|臺灣|\bTW\b|Taiwan)/i, "🇹🇼"],
  [/(?:日本|\bJP\b|Japan|Tokyo|Osaka)/i, "🇯🇵"],
  [/(?:新加坡|\bSG\b|Singapore)/i, "🇸🇬"],
  [/(?:美国|美國|\bUS\b|United States|Los Angeles|Seattle)/i, "🇺🇸"],
  [/(?:韩国|韓國|\bKR\b|Korea|Seoul)/i, "🇰🇷"],
  [/(?:英国|英國|\bUK\b|Britain|London)/i, "🇬🇧"],
  [/(?:德国|德國|\bDE\b|Germany|Frankfurt)/i, "🇩🇪"],
]

function withoutFlag(value: string) {
  return value
    .replace(FLAG_EXPRESSION, "")
    .replaceAll(/\s{2,}/g, " ")
    .trim()
}

export const flagProcessor: ProcessorModule<"flag"> = {
  type: "flag",
  params: ["mode"],

  parse(input, name) {
    if (!["add", "remove"].includes(String(input.mode))) fail(`${name}.mode must be add or remove.`)
    return { type: "flag", mode: input.mode as "add" | "remove" }
  },

  apply(nodes, processor) {
    return nodes.map((node) => {
      // Adding always strips first, so running it twice does not stack two flags on one name.
      const name = withoutFlag(node.name)
      if (processor.mode === "remove") return { ...node, name }
      const flag = FLAG_RULES.find(([expression]) => expression.test(name))?.[1]
      return { ...node, name: flag ? `${flag} ${name}` : name }
    })
  },
}
