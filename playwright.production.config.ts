import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

export default defineConfig({
  testDir: "./artifacts/campnect/e2e-production",
  timeout: 60000,
  workers: 1,
  outputDir: "generated-artifacts/demo-production-tests",
  use: {
    baseURL: "http://127.0.0.1:5000",
    viewport: { width: 390, height: 844 },
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
        (existsSync("/repl/tools/bin/chromium") ? "/repl/tools/bin/chromium" : undefined),
      args: ["--no-sandbox", "--disable-gpu"],
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "env -u DATABASE_URL -u SESSION_SECRET -u PGHOST -u PGUSER -u PGPASSWORD -u PGDATABASE -u SUPABASE_URL -u SUPABASE_SERVICE_ROLE_KEY PORT=5000 pnpm run start:demo",
    url: "http://127.0.0.1:5000",
    reuseExistingServer: false,
  },
});
