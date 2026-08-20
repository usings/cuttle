import { describe, expect, test } from "vitest"
import { compileNodeList, parseProcessors } from "@/core/nodes"
import type { NodeProcessor } from "@/core/nodes"
import {
  EMPTY_RULE_CHAIN,
  mergeRuleChain,
  ruleChainToProcessors,
  splitProcessors,
} from "@/features/rules/rule-chain-state"
import type { RuleChainState } from "@/features/rules/rule-chain-state"

/**
 * The form's two directions have to be inverses of each other. `splitProcessors` reads a stored chain
 * into form state plus whatever it could not represent, and `mergeRuleChain` writes that back out — so
 * opening a subscription in the editor and saving it without touching anything must produce the chain
 * that was already there. Anything less silently rewrites what a subscriber is served.
 */
const CHAINS: Array<[string, NodeProcessor[]]> = [
  ["an empty chain", []],
  [
    "every rule the form has a row for, in the form's own order",
    [
      { type: "filter", field: "name", pattern: "HK" },
      { type: "rename", pattern: "^", replacement: "JP " },
      { type: "sort", field: "name" },
      { type: "filter-useless" },
      { type: "flag", mode: "add" },
      { type: "handle-duplicates", action: "rename", fields: ["name"] },
      { type: "dedupe" },
      { type: "set-options", values: { "udp": true, "skip-cert-verify": false } },
    ],
  ],
  [
    "rules that arrive in an order the form cannot hold",
    [
      { type: "sort", field: "name" },
      { type: "filter", field: "name", pattern: "HK" },
    ],
  ],
  [
    "arguments no form row can express",
    [
      { type: "filter", field: "server", pattern: "example", keep: false, flags: "i" },
      { type: "sort", field: "port", order: "desc" },
      { type: "handle-duplicates", action: "delete", separator: "#", position: "front" },
      { type: "flag", mode: "remove" },
      { type: "dedupe", fields: ["name", "server"] },
      { type: "set-options", values: {} },
    ],
  ],
  [
    "two of the same rule, where the form has one row",
    [
      { type: "filter", field: "name", pattern: "HK" },
      { type: "filter", field: "name", pattern: "JP" },
    ],
  ],
]

describe("the rule chain form's two directions", () => {
  test.each(CHAINS)("%s survives a split and a merge unchanged", (_name, chain) => {
    expect(mergeRuleChain(splitProcessors(chain))).toStrictEqual(chain)
  })

  test("the sort row now carries the field and the direction, not just a name switch", () => {
    const rules = splitProcessors([{ type: "sort", field: "type", order: "desc" }]).rules

    expect(rules.sortField).toBe("type")
    expect(rules.sortDescending).toBe(true)
  })

  test("an untouched form produces no rules at all", () => {
    expect(ruleChainToProcessors(EMPTY_RULE_CHAIN)).toStrictEqual([])
  })

  test("everything the form can produce is a definition the API accepts", () => {
    // The form is upstream of `parseProcessors` on every save, so a row that can build a definition
    // the validator refuses is a chain the user cannot save and cannot see why.
    const everything = ruleChainToProcessors({
      enabledPresets: ["filter-useless", "flag", "handle-duplicates", "dedupe"],
      filterPattern: "HK",
      renamePattern: "^",
      renameReplacement: "JP ",
      sortField: "name",
      sortDescending: true,
      setOptions: { "udp": true, "tfo": false, "skip-cert-verify": true },
    })

    expect(everything).toHaveLength(8)
    expect(() => parseProcessors(everything)).not.toThrow()
  })
})

describe("what the form refuses to absorb", () => {
  test("a set-options stating nothing stays preserved rather than becoming an empty row", () => {
    const chain: NodeProcessor[] = [{ type: "set-options", values: {} }]

    const { preserved, rules } = splitProcessors(chain)

    expect(rules.setOptions).toStrictEqual({})
    expect(preserved.map((entry) => entry.processor)).toStrictEqual(chain)
  })

  test("a sort on a field the row does not offer stays preserved", () => {
    // Sorting by address or port orders the list by something nobody reads, so the row offers neither
    // — and a rule the row cannot hold has to stay where it stands rather than be dropped.
    const chain: NodeProcessor[] = [{ type: "sort", field: "port", order: "desc" }]

    const { preserved, rules } = splitProcessors(chain)

    expect(rules.sortField).toBe("")
    expect(preserved.map((entry) => entry.processor)).toStrictEqual(chain)
  })

  test("a sort stating the default direction out loud stays preserved", () => {
    // `asc` is what `sort` does when nothing is stated, so the row does not offer it — absorbing one
    // would drop the field on the way back out and rewrite the stored rule.
    const chain: NodeProcessor[] = [{ type: "sort", field: "name", order: "asc" }]

    const { preserved, rules } = splitProcessors(chain)

    expect(rules.sortField).toBe("")
    expect(preserved.map((entry) => entry.processor)).toStrictEqual(chain)
  })

  test("splitting twice does not accumulate state across calls", () => {
    // `fill` pushes into `enabledPresets` and assigns `setOptions`; sharing either with the empty
    // constant would leak one subscription's rules into the next one opened.
    splitProcessors([{ type: "dedupe" }, { type: "set-options", values: { udp: true } }])

    expect(splitProcessors([]).rules).toStrictEqual(EMPTY_RULE_CHAIN)
  })
})

/**
 * The three rules the form newly offers, run end to end. Being able to *state* a rule is not the
 * objective — the objective is that the chain the form builds does what the row implies, so each of
 * these compiles a real source through `ruleChainToProcessors`'s own output.
 */
describe("the rules the form newly offers", () => {
  const SOURCE = [
    "ss://YWVzLTEyOC1nY206cGFzcw@a.example.com:8388#JP Tokyo",
    "ss://YWVzLTEyOC1nY206cGFzcw@b.example.com:8388#HK Hong Kong",
    "ss://YWVzLTEyOC1nY206cGFzcw@a.example.com:8388#JP Duplicate Endpoint",
  ].join("\n")

  function compile(rules: Partial<RuleChainState>) {
    return compileNodeList({
      source: SOURCE,
      target: "json",
      processors: ruleChainToProcessors({ ...EMPTY_RULE_CHAIN, ...rules }),
    }).renderedNodes
  }

  test("dedupe drops the node sharing an endpoint, whatever it was named", () => {
    expect(compile({ enabledPresets: ["dedupe"] }).map((node) => node.name)).toStrictEqual([
      "JP Tokyo",
      "HK Hong Kong",
    ])
  })

  test("set-options forces the switches it states and leaves the rest alone", () => {
    const [node] = compile({ setOptions: { "udp": false, "skip-cert-verify": true } })

    expect(node.udp).toBe(false)
    expect(node["skip-cert-verify"]).toBe(true)
    expect(node.tfo).toBeUndefined()
  })

  test("a switch the form leaves unset does not reach the rule at all", () => {
    // The row's whole promise: "默认" means the node keeps what its source stated, so the rule must
    // not carry the key. A `values` holding `tfo: undefined` would serialize as a stated field.
    const processors = ruleChainToProcessors({ ...EMPTY_RULE_CHAIN, setOptions: { udp: true } })

    expect(processors).toStrictEqual([{ type: "set-options", values: { udp: true } }])
  })
})
