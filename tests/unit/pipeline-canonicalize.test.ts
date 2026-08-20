import { describe, expect, test } from "vitest"
import { compileNodeList, inspectNodeList } from "@/core/nodes"
import { validateCanonical } from "@/core/nodes/pipeline/canonical-validation"
import { canonicalize } from "@/core/nodes/pipeline/canonicalize"

describe("the canonicalize stage", () => {
  test("a protocol keeps one name whichever client spelled it", () => {
    expect(canonicalize({ type: "shadowsocks", server: "a.com", port: 1 }).type).toBe("ss")
    expect(canonicalize({ type: "shadowsocksr", server: "a.com", port: 1 }).type).toBe("ssr")
    expect(canonicalize({ type: "socks", server: "a.com", port: 1 }).type).toBe("socks5")
    expect(canonicalize({ type: "VMess", server: "a.com", port: 1 }).type).toBe("vmess")
  })

  /**
   * The spelling table existed twice: a proxy line saying `hy2`, `tuic-v5`, `https` or `socks5-tls` was
   * normalized and a document saying the same word kept a protocol name no client declares, refused by
   * every one of them. These arrive as documents on purpose: that is the half that had no table.
   */
  test("a spelling only the line parser used to know is normalized in a document too", () => {
    const source = JSON.stringify([
      { type: "https", name: "A", server: "a.com", port: 443 },
      { type: "socks5-tls", name: "B", server: "a.com", port: 1080 },
      { type: "hy2", name: "C", server: "a.com", port: 443 },
      { type: "tuic-v5", name: "D", server: "a.com", port: 443 },
      // `_` and `-` are one separator in a protocol name, and only the line parser folded them.
      { type: "tuic_v5", name: "E", server: "a.com", port: 443 },
    ])
    const { nodes } = inspectNodeList(source)

    expect(nodes.map((node) => node.type)).toStrictEqual([
      "http",
      "socks5",
      "hysteria2",
      "tuic",
      "tuic",
    ])
  })

  test("a spelling that names TLS as well as a protocol brings the TLS with it", () => {
    // The name folds away — `https` is an `http` node — and dropping the TLS with it would write the
    // proxy back out as the plaintext version of itself. A document that says otherwise still wins.
    const source = JSON.stringify([
      { type: "https", name: "A", server: "a.com", port: 443 },
      { type: "socks5-tls", name: "B", server: "a.com", port: 1080 },
      { type: "https", name: "C", server: "a.com", port: 443, tls: false },
    ])
    const { nodes } = inspectNodeList(source)

    expect(nodes.map((node) => [node.type, node.tls])).toStrictEqual([
      ["http", true],
      ["socks5", true],
      ["http", false],
    ])
  })

  test("a proxy line lands on the type and TLS it did before the two tables became one", () => {
    // The parser asks the shared table now, and it still has to answer before this stage runs: which
    // fields a line even has depends on the protocol. Nothing about these five may move.
    const lines = [
      "HS = https, example.com, 443, user, pass",
      "S5T = socks5-tls, example.com, 443, user, pass",
      "TU = tuic-v5, example.com, 443, uuid=u, password=p",
      "HY = hy2, example.com, 443, password=p",
      "SS = shadowsocks, example.com, 8388, encrypt-method=aes-128-gcm, password=p",
    ]
    const seen = lines.map((line) => {
      const [node] = inspectNodeList(line).nodes
      return [node.type, node.tls]
    })

    expect(seen).toStrictEqual([
      ["http", true],
      ["socks5", true],
      ["tuic", true],
      ["hysteria2", true],
      ["ss", false],
    ])
  })

  test("an address and a port keep one spelling whichever the source used", () => {
    const node = canonicalize({ type: "ss", address: "a.com", server_port: "8388" })

    expect(node.server).toBe("a.com")
    expect(node.port).toBe(8388)
    expect(node.server_port).toBeUndefined()
  })

  test("a source that says nothing about UDP relays it", () => {
    expect(canonicalize({ type: "ss", server: "a.com", port: 1 }).udp).toBe(true)
  })

  test("an HTTP proxy does not relay UDP and says so; SOCKS5 keeps the default", () => {
    // HTTP proxying is CONNECT over TCP: there is no UDP path. `false` rather than an absent key, so
    // the fact reaches the clients that read it and survives a round trip through the canonical model —
    // absence would let this very rule default it back to `true` on the way back in. SOCKS5 is not the
    // same case: UDP ASSOCIATE is real.
    expect(canonicalize({ type: "http", server: "a.com", port: 8080 }).udp).toBe(false)
    expect(canonicalize({ type: "socks5", server: "a.com", port: 1080 }).udp).toBe(true)
  })

  test("a source that states udp: false keeps it", () => {
    // A SIP002 URI says this for itself while parsing; the difference is deliberate.
    expect(canonicalize({ type: "ss", server: "a.com", port: 1, udp: false }).udp).toBe(false)
  })

  test("a udp flag written as a string is read as a flag", () => {
    expect(canonicalize({ type: "ss", server: "a.com", port: 1, udp: "false" }).udp).toBe(false)
    expect(canonicalize({ type: "ss", server: "a.com", port: 1, tls: "1" }).tls).toBe(true)
  })

  test("a protocol that runs over TLS by definition is marked as such", () => {
    for (const type of ["trojan", "hysteria", "hysteria2", "tuic", "anytls"]) {
      expect(canonicalize({ type, server: "a.com", port: 1 }).tls).toBe(true)
    }
  })

  test("a protocol that runs over TLS by definition still yields to a source that says otherwise", () => {
    // Every rule here defaults rather than overwrites: a trojan URI carrying `security=none` has stated
    // plaintext, and forcing TLS back on renders a node that cannot dial.
    for (const type of ["trojan", "hysteria", "hysteria2", "tuic", "anytls"]) {
      expect(canonicalize({ type, server: "a.com", port: 1, tls: false }).tls).toBe(false)
    }
  })

  test("a hysteria2 secret spelled auth becomes the one password field", () => {
    const node = canonicalize({ type: "hysteria2", server: "a.com", port: 1, auth: "secret" })

    expect(node.password).toBe("secret")
    expect(node.auth).toBeUndefined()
  })

  test("a hysteria credential ends up under auth-str whichever key carried it", () => {
    const node = canonicalize({ type: "hysteria", server: "a.com", port: 1, auth_str: "secret" })

    expect(node["auth-str"]).toBe("secret")
    expect(node.auth_str).toBeUndefined()
    expect(node.password).toBeUndefined()
  })

  test("a multiplexed protocol with no transport named runs over tcp", () => {
    for (const type of ["vmess", "vless", "trojan"]) {
      expect(canonicalize({ type, server: "a.com", port: 1 }).network).toBe("tcp")
    }
  })

  test("a wireguard address carries its prefix length into its own field", () => {
    const node = canonicalize({
      type: "wireguard",
      server: "a.com",
      port: 51_820,
      address: "10.0.0.2/32",
    })

    expect(node.ip).toBe("10.0.0.2")
    expect(node["ip-cidr"]).toBe(32)
  })

  test("a vmess node with no usable cipher runs auto", () => {
    const node = canonicalize({ type: "vmess", server: "a.com", port: 1, alterId: "4" })

    expect(node.cipher).toBe("auto")
    expect(node.alterId).toBe(4)
    // `??` reads `""` as a stated value and would leave it there, which no client can dial.
    expect(canonicalize({ type: "vmess", server: "a.com", port: 1, cipher: "" }).cipher).toBe(
      "auto",
    )
  })

  test("a Shadowsocks node with no usable cipher means none", () => {
    expect(canonicalize({ type: "ss", server: "a.com", port: 1 }).cipher).toBe("none")
    // No client can dial an empty cipher, and sources reach this: an SSD document with no
    // `encryption`, a proxy line with a bare `encrypt-method=`, a YAML `cipher:` with nothing after it
    // — the structured parser hands the entry on exactly as written.
    expect(canonicalize({ type: "ss", server: "a.com", port: 1, cipher: "" }).cipher).toBe("none")
  })

  /**
   * `??` reads `""` as a stated value, and every fallback chain in the stage is built out of it. The
   * structured reader hands a document's entry through verbatim, so an ordinary mihomo, Clash or
   * canonical-JSON proxy with a key left empty reaches these rules, as does a proxy line with a bare
   * `key=`: a source that stated the answer somewhere, and a `""` next to it that won.
   */
  test("a node with no usable name is given the one it did state, or a readable one", () => {
    const seen = [
      canonicalize({ type: "ss", server: "a.com", port: 8388 }).name,
      canonicalize({ type: "ss", server: "a.com", port: 8388, tag: "Tagged" }).name,
      canonicalize({ type: "ss", server: "a.com", port: 8388, name: "", tag: "Tagged" }).name,
      canonicalize({ type: "ss", server: "a.com", port: 8388, name: "" }).name,
    ]

    expect(seen).toStrictEqual(["ss a.com:8388", "Tagged", "Tagged", "ss a.com:8388"])
  })

  test("an address the source left empty falls through to the one it did state", () => {
    expect(canonicalize({ type: "ss", server: "", address: "a.com", port: 1 }).server).toBe("a.com")
  })

  test("a hysteria2 node keeps the credential it has when the other field is empty", () => {
    // The node renders and cannot authenticate — worse than being dropped, because nothing says so.
    const node = canonicalize({
      type: "hysteria2",
      server: "a.com",
      port: 1,
      password: "",
      auth: "secret",
    })

    expect(node.password).toBe("secret")
  })

  test("a hysteria node keeps the credential it has when the other keys are empty", () => {
    // Four candidate keys, and an empty one anywhere in the chain ends it.
    const node = canonicalize({
      "type": "hysteria",
      "server": "a.com",
      "port": 1,
      "auth-str": "",
      "auth_str": "",
      "auth": "secret",
    })

    expect(node["auth-str"]).toBe("secret")
  })

  test("a node behind a CDN takes its SNI from the transport host", () => {
    const stated = canonicalize({
      "type": "vmess",
      "server": "1.2.3.4",
      "port": 443,
      "tls": true,
      "network": "ws",
      "ws-opts": { headers: { Host: "cdn.example.com" } },
    })
    // The fallback reads `tls` and the lower-cased `*-opts` key, so it has to run after both the TLS
    // implication and the key folding: this node states neither.
    const implied = canonicalize({
      "type": "trojan",
      "server": "1.2.3.4",
      "port": 443,
      "network": "ws",
      "WS-Opts": { headers: { Host: "cdn.example.com" } },
    })

    expect([stated.sni, implied.sni]).toStrictEqual(["cdn.example.com", "cdn.example.com"])
  })

  test("an address is not a server name, so an IP literal is not used as one", () => {
    const node = canonicalize({
      "type": "vmess",
      "server": "1.2.3.4",
      "port": 443,
      "tls": true,
      "network": "ws",
      "ws-opts": { headers: { Host: "5.6.7.8" } },
    })

    expect(node.sni).toBeUndefined()
  })

  test("a transport options key is folded to the one spelling readers use", () => {
    const node = canonicalize({
      "type": "vmess",
      "server": "a.com",
      "port": 1,
      "WS-Opts": { path: "/" },
    })

    expect(node["ws-opts"]).toStrictEqual({ path: "/" })
    expect(node["WS-Opts"]).toBeUndefined()
  })

  test("a value this core does not understand travels through untouched", () => {
    const node = canonicalize({
      "type": "ss",
      "server": "a.com",
      "port": 1,
      "some-vendor-key": [1, 2],
    })

    expect(node["some-vendor-key"]).toStrictEqual([1, 2])
  })
})

/**
 * The shared rules reach every parser's output, so a parser that answered one of them differently
 * changes what it produces. None of these are corpus cases — the corpus carries one example per input
 * format and one per declared protocol, not a rule × parser matrix — so nothing else holds them.
 */
describe("a shared rule meeting a parser that answered it differently", () => {
  test("a trojan URI stating plaintext is not forced back onto TLS", () => {
    const [node] = inspectNodeList("trojan://p@h.com:443?security=none#T").nodes

    expect(node.tls).toBe(false)
  })

  test("a hysteria proxy line runs over the TLS its protocol is defined by", () => {
    // Hysteria 1 is QUIC, so it is always TLS, and a line saying nothing about TLS has not said
    // otherwise. `platform-lines.ts` wrote `false` here — the protocol has no case of its own, so it
    // landed in the branch that answers TLS from the spelling — and canonicalize honors a statement it
    // can see, leaving the node dialing plaintext a Hysteria server has none of.
    const [node] = inspectNodeList("Hy = hysteria, example.com, 443, password=secret").nodes

    expect(node.tls).toBe(true)
  })

  test("a proxy line whose protocol spells out TLS is not written back as plaintext", () => {
    // The whole round trip, because that is where the credentials are: Surge writes `http` for an
    // `http` node whose `tls` is false, so losing the `https` hands the user a proxy that sends this
    // username and password in the clear.
    const source = "Secure = https, example.com, 443, user, pass"
    const [node] = inspectNodeList(source).nodes
    const { content } = compileNodeList({ source, target: "surge" })

    expect(node.tls).toBe(true)
    expect(content.startsWith("Secure = https, example.com, 443, ")).toBe(true)
  })

  test("a Quantumult X line whose protocol spells out TLS is not written back as plaintext", () => {
    // Same defect on the other line parser, where the canonical type keeps no trace of the TLS either:
    // `socks5-tls` maps to `socks5`, and only `tls` remembers which of the two the source named.
    const source = "socks5-tls=example.com:443, username=u, password=p, tag=Secure"
    const [node] = inspectNodeList(source).nodes
    const { content } = compileNodeList({ source, target: "surge" })

    expect(node.tls).toBe(true)
    expect(content.startsWith("Secure = socks5-tls, example.com, 443, ")).toBe(true)
  })

  test("an http proxy line does not claim UDP relay either", () => {
    // The line parser defaulted `udp` to `true` itself, which states an answer over the canonical rule,
    // so the defect reached every Surge, Loon and Quantumult X http line. A line that does state it is
    // still believed: that is the `udp-relay=` below.
    const [plain] = inspectNodeList("HTTP = http, example.com, 8080, user, pass").nodes
    const [stated] = inspectNodeList("HTTP = http, example.com, 8080, udp-relay=true").nodes
    const [socks] = inspectNodeList("S5 = socks5, example.com, 1080, user, pass").nodes

    expect(plain.udp).toBe(false)
    expect(stated.udp).toBe(true)
    expect(socks.udp).toBe(true)
  })

  test("a Quantumult X https line is an http node that speaks TLS", () => {
    // `https` is not a canonical type, and no client declares one: the line used to come back carrying
    // it and was refused by every target with a capability diagnostic, so the proxy simply vanished.
    const source = "https=example.com:443, username=u, password=p, tag=Secure"
    const [node] = inspectNodeList(source).nodes
    const { content, renderedNodes } = compileNodeList({ source, target: "surge" })

    expect(node.type).toBe("http")
    expect(node.tls).toBe(true)
    expect(renderedNodes).toHaveLength(1)
    expect(content.startsWith("Secure = https, example.com, 443, ")).toBe(true)
  })

  test("a Shadowsocks proxy line that names no TLS obfs states that much", () => {
    // A computed `false` is information, not noise: Quantumult X reads it to decide whether to write
    // `obfs=over-tls`, so an absent field loses the difference between "the source named no TLS obfs"
    // and "the source said nothing".
    const line = "SS = ss, example.com, 8388, encrypt-method=aes-128-gcm, password=pass"
    const [node] = inspectNodeList(line).nodes

    expect(node.tls).toBe(false)
  })

  test("a hysteria proxy line's credential moves to the one key every reader looks under", () => {
    const [node] = inspectNodeList("Hy = hysteria, example.com, 443, password=secret").nodes

    expect(node["auth-str"]).toBe("secret")
    expect("password" in node).toBe(false)
  })

  test("an SSD document naming no encryption yields a cipher a client can dial", () => {
    // The SSD parser answers the cipher with `String(… ?? "")`, so a document that states no encryption
    // at either level produces an empty one rather than none at all.
    const document = { airport: "Air", port: 443, password: "p", servers: [{ server: "h.com" }] }
    const source = `ssd://${Buffer.from(JSON.stringify(document), "utf-8").toString("base64")}`
    const [node] = inspectNodeList(source).nodes

    expect(node.cipher).toBe("none")
  })

  test("a sing-box outbound with no TLS block still marks the protocols that imply it", () => {
    const source = JSON.stringify({
      outbounds: [{ type: "trojan", tag: "T", server: "h.com", server_port: 443, password: "p" }],
    })
    const [node] = inspectNodeList(source).nodes

    expect(node.tls).toBe(true)
    expect(node.network).toBe("tcp")
  })

  test("a sing-box outbound stating tls enabled false is not forced back onto TLS", () => {
    // The trojan URI's `security=none` above, spelled the way sing-box spells it. The parser dropped it,
    // leaving `tls` unset, and the implication rule's `?? true` read the silence as consent — so which
    // answer a source got depended on which parser read it. `false` rather than merely falsy: absence
    // is exactly the value the defect produced.
    const source = JSON.stringify({
      outbounds: [
        {
          type: "trojan",
          tag: "T",
          server: "h.com",
          server_port: 443,
          password: "p",
          tls: { enabled: false },
        },
      ],
    })
    const [node] = inspectNodeList(source).nodes

    expect(node.tls).toBe(false)
  })

  test("a sing-box outbound behind a CDN gains the SNI its implied TLS asks for", () => {
    // The chain the rule order exists for: the TLS implication has to land before the SNI fallback,
    // which only looks at a node it believes is speaking TLS.
    const source = JSON.stringify({
      outbounds: [
        {
          type: "trojan",
          tag: "T",
          server: "1.2.3.4",
          server_port: 443,
          password: "p",
          transport: { type: "ws", headers: { Host: "cdn.example.com" } },
        },
      ],
    })
    const [node] = inspectNodeList(source).nodes

    expect(node.sni).toBe("cdn.example.com")
  })

  test("a sing-box vmess outbound that names no alterId gets the one every reader expects", () => {
    const source = JSON.stringify({
      outbounds: [{ type: "vmess", tag: "V", server: "h.com", server_port: 443, uuid: "u" }],
    })
    const [node] = inspectNodeList(source).nodes

    expect(node.alterId).toBe(0)
  })
})

/** A VMess URI is a base64 JSON object, so a readable case has to be built rather than written out. */
function vmessUri(value: Record<string, unknown>) {
  return `vmess://${Buffer.from(JSON.stringify(value), "utf-8").toString("base64")}`
}

/**
 * Each test below asserts the field value a deleted per-parser copy of a shared rule used to write, so
 * the rule that answers it now is held by something narrower than a client snapshot — a snapshot says
 * the whole document is unchanged, not which rule kept it that way.
 */
describe("a parser that stopped restating a shared rule", () => {
  test("a protocol URI keeps the udp and TLS it had when its parser wrote them itself", () => {
    // None of these URIs states either field, so every value comes from a shared rule: `udp` from the
    // default, TLS from the by-definition list or from the scheme. The two exceptions are stated and
    // stay so — a SIP002 URI declares `udp: false` for itself, an `http://` scheme declares plaintext.
    const seen = [
      "hysteria2://secret@h.com:443#H2",
      "hysteria://h.com:443?auth=secret#H1",
      "tuic://01890d4e:secret@h.com:443#T5",
      "anytls://secret@h.com:443#A",
      "trojan://secret@h.com:443#T",
      "vless://01890d4e@h.com:443?security=tls#V",
      "wireguard://cHJpdmF0ZS1rZXk=@h.com:51820?publickey=cHVibGljLWtleQ%3D%3D#W",
      "socks5://user:pass@h.com:1080#S5",
      "http://user:pass@h.com:8080#P",
      "https://user:pass@h.com:8443#S",
      "ss://YWVzLTI1Ni1nY206cGFzcw@h.com:443#SS",
    ].map((line) => {
      const [node] = inspectNodeList(line).nodes
      return [node.type, node.tls, node.udp]
    })

    expect(seen).toStrictEqual([
      ["hysteria2", true, true],
      ["hysteria", true, true],
      ["tuic", true, true],
      ["anytls", true, true],
      ["trojan", true, true],
      ["vless", true, true],
      ["wireguard", undefined, true],
      ["socks5", undefined, true],
      ["http", false, false],
      ["http", true, false],
      ["ss", undefined, false],
    ])
  })

  test("a proxy line with no name of its own still gets a readable one", () => {
    // The name is the left-hand side of a Surge or Loon line, `tag=` on a Quantumult X one and an
    // optional field in an Egern proxy, and each of the four parsers built the same fallback string for
    // itself. None of these four shapes is a corpus case: every corpus line is named.
    const surge = inspectNodeList(" = ss, example.com, 443, encrypt-method=aes-256-gcm, password=p")
    const quantumult = inspectNodeList(
      "shadowsocks=example.com:443, method=aes-256-gcm, password=p",
    )
    const wireguard = inspectNodeList(
      " = wireguard, private-key=k, peers=[{public-key=p, endpoint=wg.example.com:51820}]",
    )
    const egern = inspectNodeList("proxies:\n  - trojan: { server: eg.example.com, port: 443 }")

    expect([
      surge.nodes[0].name,
      quantumult.nodes[0].name,
      wireguard.nodes[0].name,
      egern.nodes[0].name,
    ]).toStrictEqual([
      "ss example.com:443",
      "ss example.com:443",
      "wireguard wg.example.com:51820",
      "trojan eg.example.com:443",
    ])
  })

  test("a VMess proxy line that names no cipher runs auto, and a VLESS one still runs none", () => {
    // The shared cipher rule answers VMess and nothing else, so the `none` a Quantumult X VLESS line
    // gets has no other source — only the `auto` half of that fallback was removed. Neither line is a
    // corpus case: the corpus reaches this parser with Shadowsocks and TUIC only.
    const [surge] = inspectNodeList("V = vmess, example.com, 443, username=01890d4e").nodes
    const [quantumult] = inspectNodeList("vmess=example.com:443, password=01890d4e, tag=V").nodes
    const [vless] = inspectNodeList("vless=example.com:443, password=01890d4e, tag=V").nodes

    expect([surge.cipher, quantumult.cipher, vless.cipher]).toStrictEqual(["auto", "auto", "none"])
  })

  test("an Egern proxy runs the TLS its protocol implies, and its https key still names TLS too", () => {
    // The by-definition list was copied into this parser; only the `https` key stays, because the type
    // it maps to is `http` and no later stage can tell the two keys apart. The corpus reaches this
    // parser with Shadowsocks alone, so nothing else holds any of these six.
    const source = [
      "proxies:",
      "  - trojan: { server: eg.example.com, port: 443, password: p }",
      "  - hysteria2: { server: eg.example.com, port: 443, auth: secret }",
      "  - tuic: { server: eg.example.com, port: 443, uuid: u, password: p }",
      "  - anytls: { server: eg.example.com, port: 443, password: p }",
      "  - https: { server: eg.example.com, port: 8443, username: u, password: p }",
      "  - shadowsocks: { server: eg.example.com, port: 443, method: aes-256-gcm, udp_relay: false }",
    ].join("\n")
    const { nodes } = inspectNodeList(source)

    expect(nodes.map((node) => [node.type, node.tls])).toStrictEqual([
      ["trojan", true],
      ["hysteria2", true],
      ["tuic", true],
      ["anytls", true],
      ["http", true],
      ["ss", undefined],
    ])
    // Two reads no shared rule can reach: Egern nests the Hysteria2 secret under `auth` inside the proxy
    // body, and spells the relay flag `udp_relay`.
    expect(nodes[1].password).toBe("secret")
    expect(nodes[5].udp).toBe(false)
  })

  test("a VMess URI keeps the cipher and alterId it had, whether it names them or not", () => {
    // `scy` and `aid` are the URI's own spellings and only this parser knows them; the `auto` and the
    // integer they fall back to are the shared VMess rule, which the parser used to answer as well.
    const base = { v: "2", ps: "V", add: "h.com", port: "443", id: "01890d4e", net: "tcp" }
    const [silent] = inspectNodeList(vmessUri(base)).nodes
    const [stated] = inspectNodeList(vmessUri({ ...base, scy: "none", aid: "2" })).nodes

    expect([silent.cipher, silent.alterId]).toStrictEqual(["auto", 0])
    expect([stated.cipher, stated.alterId]).toStrictEqual(["none", 2])
  })
})

describe("the canonical node validation stage", () => {
  test("a port the rule chain broke never reaches a renderer", () => {
    const { nodes, diagnostics } = validateCanonical([
      { type: "ss", name: "Broken", server: "a.com", port: Number.NaN },
    ])

    expect(nodes).toStrictEqual([])
    expect(diagnostics[0].stage).toBe("canonical-validation")
    expect(diagnostics[0].level).toBe("warning")
  })

  test("a node with no name is stopped", () => {
    const { nodes } = validateCanonical([{ type: "ss", name: "", server: "a.com", port: 443 }])

    expect(nodes).toStrictEqual([])
  })

  test("a well-formed node passes untouched", () => {
    const node = { type: "ss", name: "Good", server: "a.com", port: 443 }
    const { nodes, diagnostics } = validateCanonical([node])

    expect(nodes).toStrictEqual([node])
    expect(diagnostics).toStrictEqual([])
  })
})
