import type { D1Migration } from "cloudflare:test"
import { env } from "cloudflare:workers"

export const testEnv = env as Env & {
  TEST_MIGRATIONS: D1Migration[]
  MIGRATION_DB: D1Database
}

export function migration(name: string) {
  const found = testEnv.TEST_MIGRATIONS.find((entry) => entry.name === name)
  if (!found) throw new Error(`Missing test migration: ${name}`)
  return found
}
