import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "pnpm serve:dev",
    port: 3000,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
