import { readFileSync } from "node:fs"

/**
 * The key the dev server is actually running with.
 *
 * `pnpm serve:dev` takes it from `.dev.vars`, so the tests read that same file rather than keeping a
 * second copy of a secret that could drift out of step with it. CI, which has no `.dev.vars`, sets
 * `CUTTLE_TOKEN` in the environment instead and that wins.
 */
export function adminToken() {
  const fromEnvironment = process.env.CUTTLE_TOKEN?.trim()
  if (fromEnvironment) return fromEnvironment

  const declared = /^CUTTLE_TOKEN=(.*)$/m.exec(readFileSync(devVarsPath(), "utf-8"))
  if (!declared) throw new Error("no CUTTLE_TOKEN in .dev.vars, and none in the environment")
  return unquote(declared[1].trim())
}

function devVarsPath() {
  return new URL("../../.dev.vars", import.meta.url)
}

function unquote(value: string) {
  const quoted = /^(["'])(.*)\1$/.exec(value)
  return quoted ? quoted[2] : value
}
