import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
export default defineConfig({
  testDir: "./artifacts/campnect/e2e",
  timeout: 120000,
  workers: 1,
  use: {
    baseURL: "http://localhost:5000",
    viewport: { width: 390, height: 844 },
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
        (existsSync("/repl/tools/bin/chromium")
          ? "/repl/tools/bin/chromium"
          : undefined),
      args: [
        "--no-sandbox",
        "--disable-gpu",
        "--disable-gpu-compositing",
        "--disable-software-rasterizer",
      ],
    },
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "VITE_DEMO_MODE=true PORT=5000 BASE_PATH=/ pnpm --filter @workspace/campnect run dev",
    url: "http://localhost:5000",
    reuseExistingServer: true,
  },
});
