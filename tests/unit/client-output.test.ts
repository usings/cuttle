import { readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import {
  compileNodeList,
  inspectNodeList,
  selectableTargets,
  TARGET_IDS,
  targetDefinition,
} from "@/core/nodes"
import type { TargetId } from "@/core/nodes"
import { TARGET_OPTIONS } from "@/features/subscriptions/targets"
import { corpus, corpusByProtocol } from "../support/corpus"

const WIDTH = 60

function bar(title: string) {
  return `━━ ${title} `.padEnd(WIDTH, "━")
}

function exampleBlock(target: TargetId, entry: { name: string; source: string }) {
  const result = compileNodeList({ source: entry.source, target })
  const notes = result.diagnostics.map((item) => `! ${item.message}`)
  const body = result.content.trimEnd()
  return {
    rendered: result.renderedNodes.length,
    text: [`· ${entry.name}`, body, ...notes].filter(Boolean).join("\n"),
    total: result.nodes.length,
  }
}

function protocolBlock(
  target: TargetId,
  entry: { examples: Array<{ name: string; source: string }>; protocol: string },
) {
  const examples = entry.examples.map((item) => exampleBlock(target, item))
  const rendered = examples.reduce((sum, item) => sum + item.rendered, 0)
  const total = examples.reduce((sum, item) => sum + item.total, 0)
  if (rendered === 0) return bar(`${entry.protocol} — not carried`)
  return [
    bar(`${entry.protocol} ${rendered}/${total}`),
    examples.map((item) => item.text).join("\n\n"),
  ].join("\n")
}

describe("what each client writes", () => {
  test.each(TARGET_IDS)("%s writes every corpus case the same way it did", async (target) => {
    const definition = targetDefinition(target)
    const header = [
      `# ${definition.label} — ${target} · ${definition.contentType} · .${definition.fileExtension}`,
      `# ${corpusByProtocol.length} protocols · ${corpus.length} examples · regenerate: pnpm test:unit -u`,
      definition.notes ? `# ${definition.notes}` : "",
    ].filter(Boolean)
    const groups = corpusByProtocol.map((entry) => protocolBlock(target, entry))
    const document = [header.join("\n"), groups.join("\n\n")].join("\n\n")

    await expect(`${document}\n`).toMatchFileSnapshot(`../fixtures/clients/${target}.snap`)
  })

  test("no sing-box outbound is given a network field it has no option for", () => {
    // Why the exception list exists: `src/core/nodes/targets/sing-box.ts`. One row per exception,
    // because that list is a claim about the schema and a claim is worth what pins it. Shadowsocks is
    // asserted alongside them: the guard has to stay off the outbounds that do declare `network`, where
    // "TCP only" is the node's own statement.
    const source = [
      "proxies:",
      "  - {name: HTTP, type: http, server: example.com, port: 8080, username: u, password: p}",
      "  - {name: SSH, type: ssh, server: example.com, port: 22, username: root, password: p, udp: false}",
      "  - {name: AT, type: anytls, server: example.com, port: 443, password: p, udp: false}",
      "  - {name: SS, type: ss, server: example.com, port: 443, cipher: aes-256-gcm, password: p, udp: false}",
    ].join("\n")
    const { content } = compileNodeList({ source, target: "sing-box" })
    const outbounds = (JSON.parse(content) as { outbounds: Array<Record<string, unknown>> })
      .outbounds

    expect(outbounds.map((item) => [item.type, "network" in item])).toStrictEqual([
      ["http", false],
      ["ssh", false],
      ["anytls", false],
      ["shadowsocks", true],
    ])
  })

  test("every protocol a client declares has a group behind it", () => {
    const declared = new Set<string>()
    for (const id of TARGET_IDS) {
      const { protocols } = targetDefinition(id)
      if (protocols !== "all") for (const protocol of protocols) declared.add(protocol)
    }
    const stocked = new Set(
      corpusByProtocol.filter((group) => group.examples.length > 0).map((group) => group.protocol),
    )

    expect([...declared].filter((protocol) => !stocked.has(protocol)).toSorted()).toStrictEqual([])
  })

  test("a protocol reaches exactly the clients its scope names", () => {
    const clients = selectableTargets().map((target) => target.id)
    const wrong = corpusByProtocol.flatMap((entry) => {
      const scoped = new Set(entry.scopes)
      return clients.flatMap((target) => {
        const reaches = entry.examples.some(
          (item) => compileNodeList({ source: item.source, target }).renderedNodes.length > 0,
        )
        if (reaches === scoped.has(target)) return []
        return [
          `${entry.protocol}: ${target} ${reaches ? "renders but is unscoped" : "is scoped but renders nothing"}`,
        ]
      })
    })

    expect(wrong).toStrictEqual([])
  })

  test("every example parses to the protocol it is filed under", () => {
    const misfiled = corpusByProtocol.flatMap((entry) =>
      entry.examples.flatMap((item) =>
        [...new Set(inspectNodeList(item.source).nodes.map((node) => node.type))]
          .filter((type) => type !== entry.protocol)
          .map((type) => `${item.name} parses as ${type}`),
      ),
    )

    expect(misfiled).toStrictEqual([])
  })

  test("the picker offers exactly the clients the registry says are selectable", () => {
    // The claim `features/subscriptions/targets.ts` makes about itself: the display order is the
    // interface's own, but the set is the registry's. A client added to the registry and forgotten
    // here is one nobody can pick; one removed from the registry and left here throws on lookup.
    const offered = TARGET_OPTIONS.map((option) => option.value).toSorted()
    const selectable = selectableTargets()
      .map((target) => target.id)
      .toSorted()

    expect(offered).toStrictEqual(selectable)
  })

  test("nothing is left behind by a client that no longer exists", () => {
    const registered = new Set(TARGET_IDS.map((id) => `${id}.snap`))
    const stale = readdirSync(join(import.meta.dirname, "../fixtures/clients")).filter(
      (file) => !registered.has(file),
    )

    expect(stale).toStrictEqual([])
  })
})
