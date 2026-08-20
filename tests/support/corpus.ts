import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * The inputs every output fixture is generated from, and the one place they are read.
 *
 * Grouped by the protocol each example carries, because that is the axis the corpus owes coverage on: a
 * protocol a client declares with an empty list here has no fixture showing what it writes and no round
 * trip proving it survives. Within a group the examples are the ways that protocol can arrive — its own
 * URI, and each config format that spells it differently.
 *
 * Exhaustive rather than large: one example per group unless the group genuinely differs by transport,
 * cipher or source format.
 */
export interface CorpusExample {
  name: string
  source: string
}

export interface CorpusGroup {
  protocol: string
  /**
   * The clients this protocol reaches. Not a copy of the target registry but a claim about the rendered
   * result, checked against it: a client that quietly gains or loses a protocol shows up as a failing
   * scope rather than as a fixture section nobody re-read.
   */
  scopes: string[]
  examples: CorpusExample[]
}

export const corpusByProtocol = JSON.parse(
  readFileSync(join(import.meta.dirname, "../fixtures/corpus.json"), "utf-8"),
) as CorpusGroup[]

/** The same examples as one list, for everything that renders them rather than groups them. */
export const corpus: CorpusExample[] = corpusByProtocol.flatMap((group) => group.examples)
