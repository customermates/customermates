import { resolve } from "node:path";

import { defineConfig } from "@playwright/test";

import base from "../../../playwright.config";

const evidenceDirectory = resolve(__dirname, "../../../.runs/e2e", process.env.CRM_E2E_RUN_ID!);

// Live provider checks: real Unipile sends between the two designated test inboxes only. Started by
// scripts/verify/live-checks.mjs, never by the ordinary suite (its files end in .live.ts, not .spec.ts). No retries:
// a retry would send again.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: "**/*.live.ts",
  timeout: 600000,
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: `${evidenceDirectory}/report`, open: "never" }],
    ["json", { outputFile: `${evidenceDirectory}/results.json` }],
  ],
  outputDir: `${evidenceDirectory}/artifacts`,
  projects: [{ name: "chromium", use: { ...(base.projects?.[0]?.use ?? {}) } }],
});
