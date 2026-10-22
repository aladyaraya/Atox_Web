import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/oidc",
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  outputDir: "./.data/browser-results",
  reporter: "./tests/redacted-reporter.mjs",
  use: { trace: "off", screenshot: "off", video: "off" },
  webServer: ["a", "b"].map((id) => ({
    command: `node app/start.mjs ${id}`,
    url: `http://127.0.0.1:${id === "a" ? 3401 : 3402}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
  })),
});
