import { defineConfig } from "@playwright/test";

import base from "../../../playwright.config";

// Live provider checks: real Unipile sends between the two designated test inboxes only. Started by
// scripts/verify/live-checks.mjs, never by the ordinary suite (its files end in .live.ts, not .spec.ts). No retries:
// a retry would send again.
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: "**/*.live.ts",
  timeout: 300000,
  retries: 0,
  workers: 1,
  projects: [{ name: "chromium", use: { ...(base.projects?.[0]?.use ?? {}) } }],
});
