import { describe, expect, test } from "vitest"
import { compileNodeList, TARGET_IDS, targetDefinition } from "@/core/nodes"

const SS = "ss://YWVzLTEyOC1nY206cGFzcw@example.com:8388#Node"
/** Xray's Shadowsocks outbound has no plugin slot, so this one clears the lists and still has no shape. */
const SS_PLUGIN =
  "ss://YWVzLTEyOC1nY206cGFzcw@example.com:8388?plugin=obfs-local%3Bobfs%3Dhttp#Plugged"

interface SingBoxOutbound {
  detour?: string
  tag: string
}

function outboundsOf(content: string) {
  return (JSON.parse(content) as { outbounds: SingBoxOutbound[] }).outbounds
}

function tagsOf(content: string) {
  return outboundsOf(content).map((item) => item.tag)
}

/** A Shadowsocks node wrapped in Shadow-TLS, which sing-box writes as two outbounds. */
function shadowTlsUri(name: string) {
  const plugin = "plugin=shadow-tls%3Bhost%3Dcdn.example.com%3Bpassword%3Dsecret%3Bversion%3D3"
  return `ss://YWVzLTEyOC1nY206cGFzcw@example.com:8388?${plugin}#${encodeURIComponent(name)}`
}

function detourTarget(outbound: SingBoxOutbound, tags: string[]) {
  if (outbound.detour === undefined) return null
  // Reported rather than read as an ordinary tag: a `detour` naming an outbound the document does not
  // contain is a Shadow-TLS proxy that dials nothing, which unique tags alone would not catch.
  return tags.includes(outbound.detour) ? outbound.detour : `missing: ${outbound.detour}`
}

/** Every outbound's tag beside the tag it detours through: one assertion pins both. */
function tagLinksOf(content: string) {
  const outbounds = outboundsOf(content)
  const tags = outbounds.map((item) => item.tag)
  return outbounds.map((item) => [item.tag, detourTarget(item, tags)])
}

describe("the render stage", () => {
  test("every client states whether its names must be unique", () => {
    const missing = TARGET_IDS.filter((id) => typeof targetDefinition(id).uniqueNames !== "boolean")

    expect(missing).toStrictEqual([])
  })

  test("a client that keys policies by name gets the second one numbered", () => {
    const result = compileNodeList({ source: [SS, SS].join("\n"), target: "mihomo" })

    expect(result.renderedNodes.map((node) => node.name)).toStrictEqual(["Node", "Node 2"])
  })

  test("sing-box tags are numbered too, so a duplicate name is no longer an invalid config", () => {
    const result = compileNodeList({ source: [SS, SS].join("\n"), target: "sing-box" })

    // Pinned rather than asserted distinct: a `Set` of one element is also all-distinct, so counting
    // would go green on a regression that refused both nodes.
    expect(tagsOf(result.content)).toStrictEqual(["Node", "Node 2"])
  })

  test("xray tags are numbered too, for the same reason", () => {
    const result = compileNodeList({ source: [SS, SS].join("\n"), target: "xray" })

    expect(tagsOf(result.content)).toStrictEqual(["Node", "Node 2"])
  })

  test("a number the numbering itself would produce is not handed out twice", () => {
    // The third node already carries the name the second one is about to be given.
    const source = [SS, SS, SS.replace("#Node", "#Node%202")].join("\n")
    const result = compileNodeList({ source, target: "sing-box" })

    expect(tagsOf(result.content)).toStrictEqual(["Node", "Node 2", "Node 2 2"])
  })

  /**
   * A Shadow-TLS proxy occupies two tags in sing-box, the second derived from its name — so a node
   * genuinely called `A_shadowtls` beside a Shadow-TLS node called `A` produces that tag twice, with no
   * diagnostic, and sing-box rejects a duplicate tag outright. As node names the two are distinct,
   * which is why numbering the names alone did not see it.
   *
   * Both orderings are pinned because the collision is discovered from opposite directions: the plain
   * node hitting a reserved tag, and a Shadow-TLS node whose derived tag is already taken. Each asserts
   * the linkage too — renaming the wrapper without following the `detour` that points at it would trade
   * an invalid configuration for a broken one.
   */
  test("a plain node named like a derived Shadow-TLS tag is numbered off it", () => {
    const source = [shadowTlsUri("A"), SS.replace("#Node", "#A_shadowtls")].join("\n")
    const { content } = compileNodeList({ source, target: "sing-box" })

    expect(tagLinksOf(content)).toStrictEqual([
      ["A", "A_shadowtls"],
      ["A_shadowtls", null],
      ["A_shadowtls 2", null],
    ])
    expect(new Set(tagsOf(content)).size).toBe(3)
  })

  test("a Shadow-TLS node is numbered when only its derived tag collides", () => {
    // Its own name `A` is free; the tag it would derive is not, so the name has to move anyway.
    const source = [SS.replace("#Node", "#A_shadowtls"), shadowTlsUri("A")].join("\n")
    const { content } = compileNodeList({ source, target: "sing-box" })

    expect(tagLinksOf(content)).toStrictEqual([
      ["A_shadowtls", null],
      ["A 2", "A 2_shadowtls"],
      ["A 2_shadowtls", null],
    ])
    expect(new Set(tagsOf(content)).size).toBe(3)
  })

  test("two Shadow-TLS nodes of the same name keep one detour each", () => {
    const source = [shadowTlsUri("A"), shadowTlsUri("A")].join("\n")
    const { content } = compileNodeList({ source, target: "sing-box" })

    expect(tagLinksOf(content)).toStrictEqual([
      ["A", "A_shadowtls"],
      ["A_shadowtls", null],
      ["A 2", "A 2_shadowtls"],
      ["A 2_shadowtls", null],
    ])
    expect(new Set(tagsOf(content)).size).toBe(4)
  })

  /**
   * A node line has no escape for its own separators, so `policyName` replaces every `=` and `,` with a
   * space — and two names differing only in one of those characters are distinct nodes and one policy.
   * The client keys its policies by the name it reads, so the second proxy disappears: the uniqueness
   * the pipeline certified was about a string the document does not contain.
   */
  test("two names differing only in a character the line format strips stay two policies", () => {
    // The fragments decode to `A,B` and `A=B`; both collapse to `A B`.
    const source = [SS.replace("#Node", "#A%2CB"), SS.replace("#Node", "#A%3DB")].join("\n")
    const { content } = compileNodeList({ source, target: "surge" })

    expect(content.split("\n").map((line) => line.split(" = ")[0])).toStrictEqual(["A B", "A B 2"])
  })

  test("two names the line format strips down to nothing keep one policy each", () => {
    // The other half of the transformation: the fragments decode to `,` and `=`, so the stripping
    // leaves both empty and they fall through to `${type}-${port}`, which every node of that protocol
    // and port would otherwise share.
    const source = [SS.replace("#Node", "#%2C"), SS.replace("#Node", "#%3D")].join("\n")
    const { content } = compileNodeList({ source, target: "quantumult-x" })

    expect(content.split("\n").map((line) => line.slice(line.indexOf("tag=")))).toStrictEqual([
      "tag=ss-8388",
      "tag=2",
    ])
  })

  test("a URI list is left as it came: the fragment already carries the name", () => {
    const result = compileNodeList({ source: [SS, SS].join("\n"), target: "uri" })

    expect(result.renderedNodes.map((node) => node.name)).toStrictEqual(["Node", "Node"])
  })

  test("canonical JSON refuses nothing and renames nothing", () => {
    const result = compileNodeList({ source: [SS, SS].join("\n"), target: "json" })

    expect(result.renderedNodes).toHaveLength(2)
    expect(result.diagnostics.filter((item) => item.stage === "capability")).toStrictEqual([])
  })

  test("the capability lists and the renderer refuse in two different stages", () => {
    // WireGuard is not in Clash Classic's protocol list, so the capability stage stops it.
    const capabilityRefused = compileNodeList({
      source: "wireguard://cHJpdmF0ZQ@example.com:51820#WG",
      target: "clash",
    })
    // Shadowsocks is in Xray's protocol list and tcp in its transport list, so this one gets past
    // the gate and is refused by the renderer instead.
    const renderRefused = compileNodeList({ source: SS_PLUGIN, target: "xray" })

    expect(capabilityRefused.diagnostics.map((item) => [item.stage, item.code])).toStrictEqual([
      ["capability", "capability-refused"],
    ])
    expect(capabilityRefused.renderedNodes).toStrictEqual([])
    expect(renderRefused.diagnostics.map((item) => [item.stage, item.code])).toStrictEqual([
      ["target-validation", "render-refused"],
    ])
    expect(renderRefused.renderedNodes).toStrictEqual([])
  })

  test("only the nodes that were actually serialized are reported as rendered", () => {
    const result = compileNodeList({
      source: ["wireguard://cHJpdmF0ZQ@example.com:51820#WG", SS].join("\n"),
      target: "clash",
    })

    expect(result.nodes).toHaveLength(2)
    expect(result.renderedNodes.map((node) => node.name)).toStrictEqual(["Node"])
  })
})
