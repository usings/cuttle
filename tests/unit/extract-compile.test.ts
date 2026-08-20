import { describe, expect, test } from "vitest"
import { compileForWorkbench } from "@/features/extract/compile"

const URI = "ss://YWVzLTI1Ni1nY206cGFzc3dvcmQ=@example.com:8388#HK"

/**
 * The half of a workbench run that crosses the worker boundary. It has to answer the same way on
 * either side of it, so what it returns is tested here rather than through the hook that posts it.
 */
describe("a workbench compile run", () => {
  test("carries only what the workbench renders", () => {
    const { error, output } = compileForWorkbench({ processors: [], source: URI, target: "uri" })

    expect(error).toBe("")
    expect(output?.renderedNodes).toHaveLength(1)
    expect(output?.content).toContain("ss://")
    // `nodes` is the pipeline's pre-target list and nothing shows it. Carrying it would clone the
    // whole source a second time on the way back from the worker.
    expect(output).not.toHaveProperty("nodes")
  })

  test("reports a refusal rather than throwing it", () => {
    // Over the 2 MiB source cap, which `prepareInput` refuses outright — the one failure the
    // workbench shows in place of an output rather than as a per-node diagnostic.
    const { error, output } = compileForWorkbench({
      processors: [],
      source: "x".repeat(2 * 1024 * 1024 + 1),
      target: "uri",
    })

    expect(output).toBeNull()
    expect(error).toContain("2 MiB")
  })

  test("a source that parses to nothing is an empty document, not a refusal", () => {
    // Distinct from the case above: the run succeeded and the client simply carried nothing, which
    // is what the workbench's own empty state describes.
    const { error, output } = compileForWorkbench({ processors: [], source: "", target: "uri" })

    expect(error).toBe("")
    expect(output?.renderedNodes).toHaveLength(0)
  })
})
