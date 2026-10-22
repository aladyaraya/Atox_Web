import { defineConfig } from "@playwright/test";
import path from "node:path";
const directory = path.resolve(`.data/oidc-sandbox/browser-${Date.now()}`);
process.env.OIDC_FIXTURE_DIR = directory;
export default defineConfig({
  testDir: "./tests/oidc-website",
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  outputDir: path.join(directory, "results"),
  reporter: "./labs/logto-oidc/tests/redacted-reporter.mjs",
  use: {
    baseURL: "http://127.0.0.1:3104",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  webServer: [
    {
      command: "npx tsx tests/fixtures/oidc-website-server.ts",
      url: "http://127.0.0.1:3104/login",
      timeout: 180_000,
      reuseExistingServer: false,
      env: { OIDC_FIXTURE_DIR: directory, NEXT_TELEMETRY_DISABLED: "1" },
    },
    {
      command: "node app/start.mjs a",
      cwd: "labs/logto-oidc",
      url: "http://127.0.0.1:3401/health",
      timeout: 30_000,
      reuseExistingServer: false,
    },
  ],
});
