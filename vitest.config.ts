import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
        },
      },
      {
        resolve: { tsconfigPaths: true },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          setupFiles: ["./tests/integration/setup.ts"],
        },
        plugins: [
          cloudflareTest(async () => ({
            main: "./tests/integration/entry.ts",
            wrangler: { configPath: "./wrangler.json" },
            miniflare: {
              bindings: {
                CUTTLE_TOKEN: "test-admin-token",
                TEST_MIGRATIONS: await readD1Migrations("./migrations"),
              },
            },
          })),
        ],
      },
    ],
  },
})
