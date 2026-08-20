import { applyD1Migrations } from "cloudflare:test"
import type { D1Migration } from "cloudflare:test"
import { env } from "cloudflare:workers"

const testEnv = env as Env & { TEST_MIGRATIONS: D1Migration[] }

await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS)
