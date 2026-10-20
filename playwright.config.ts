import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";
import { localE2eEnvironment } from "./tests/e2e/local-environment";

const environment = localE2eEnvironment();
const runId = (process.env.CRM_E2E_RUN_ID ??= new Date().toISOString().replace(/[^0-9TZ]/g, ""));
if (!/^[a-zA-Z0-9_-]{1,100}$/.test(runId)) throw new Error("CRM_E2E_RUN_ID must be a simple local directory name.");
const evidenceDirectory = `.runs/e2e/${runId}`;
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  timeout: 120000,
  expect: { timeout: 15000 },
  fullyParallel: false,
  // One worker per server: scripts/verify/e2e.mjs and CI parallelise by shards, each with its own server and database.
  workers: Number(process.env.CRM_E2E_WORKERS ?? 1),
  forbidOnly: true,
  // One retry in CI and the verification scripts; a test that passes only on the retry is reported as flaky.
  retries: Number(process.env.CRM_E2E_RETRIES ?? (process.env.CI ? 1 : 0)),
  reporter: [
    ["list"],
    ["html", { outputFolder: `${evidenceDirectory}/report`, open: "never" }],
    ["json", { outputFile: `${evidenceDirectory}/results.json` }],
  ],
  outputDir: `${evidenceDirectory}/artifacts`,
  use: {
    actionTimeout: 15000,
    navigationTimeout: 60000,
    baseURL: environment.baseUrl,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "en-GB",
    reducedMotion: "reduce",
  },
  webServer: {
    command: "yarn tsx tests/e2e/start-server.ts",
    url: `${environment.baseUrl}${process.env.APP_MODE === "demo" ? "/api/v1/openapi" : "/en/auth/signin"}`,
    timeout: 600000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
});
