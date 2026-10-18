import "dotenv/config";

import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { NextRequest } from "next/server";

import { localWebhookSecret } from "./local-email-provider.mjs";
import { localE2eEnvironment } from "./local-environment";
import { localLemonSqueezyEnvironment } from "./local-lemonsqueezy-provider.mjs";
import { localOAuthEnvironment } from "./local-oauth-provider.mjs";
import { localResendEnvironment } from "./local-resend-provider.mjs";

const environment = localE2eEnvironment();
const mode = process.env.CRM_E2E_SERVER_MODE === "development" ? "dev" : "start";
// Match Next's production rewrite origin so missing pages stay internal; keep dev's HMR origin.
const hostname = mode === "dev" ? "127.0.0.1" : new NextRequest(environment.baseUrl).nextUrl.hostname;
// Live checks (scripts/verify/live-checks.mjs) replace the offline transport with a guard that lets only sends between
// the designated Unipile test inboxes leave the machine; everything else keeps the loopback-only network guard.
const live = process.env.CRM_E2E_LIVE_UNIPILE === "true";
if (live && (!process.env.UNIPILE_API_KEY || !process.env.CRM_LIVE_WEBHOOK_SECRET))
  throw new Error("Live checks need UNIPILE_API_KEY and CRM_LIVE_WEBHOOK_SECRET");
const guard = resolve(live ? "tests/e2e/live/live-egress-guard.mjs" : "tests/e2e/network-guard.mjs");
const transport = live
  ? { UNIPILE_API_KEY: process.env.UNIPILE_API_KEY, UNIPILE_WEBHOOK_SECRET: process.env.CRM_LIVE_WEBHOOK_SECRET }
  : {
      CRM_LOCAL_TEST_TRANSPORT: "true",
      UNIPILE_API_KEY: "e2e-local-provider-no-network",
      UNIPILE_WEBHOOK_SECRET: localWebhookSecret,
      CRM_E2E_EMAIL_LEDGER: environment.emailLedgerFile,
    };
const child = spawn(
  process.execPath,
  [
    "--dns-result-order=ipv4first",
    "node_modules/next/dist/bin/next",
    mode,
    "--hostname",
    hostname,
    "--port",
    new URL(environment.baseUrl).port,
    // Node's 5 s idle close races Playwright request contexts reusing a keep-alive socket ("socket hang up").
    ...(mode === "start" ? ["--keepAliveTimeout", "30000"] : []),
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      BASE_URL: environment.baseUrl,
      DATABASE_URL: environment.databaseUrl,
      DIRECT_URL: environment.databaseUrl,
      WORKFLOW_LOCAL_BASE_URL: environment.baseUrl,
      WORKFLOW_LOCAL_DATA_DIR: environment.workflowDirectory,
      WORKFLOW_LOCAL_QUEUE_CONCURRENCY: "32",
      ...transport,
      HOSTED_AI_OPERATOR_CONTROLS_ENABLED: "true",
      HOSTED_AI_PROVIDER_WORK_PAUSED: "true",
      NEXT_TELEMETRY_DISABLED: "1",
      CRM_E2E_PROVIDER_DIRECTORY: environment.providerDirectory,
      ...(process.env.LEMONSQUEEZY_API_KEY && !live ? localLemonSqueezyEnvironment(process.env.BETTER_AUTH_SECRET) : {}),
      ...(process.env.GOOGLE_CLIENT_ID && !live ? localOAuthEnvironment("google") : {}),
      ...(process.env.AZURE_AD_CLIENT_ID && !live ? localOAuthEnvironment("microsoft") : {}),
      ...(process.env.RESEND_API_KEY && !live ? localResendEnvironment() : {}),
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import ${guard}`.trim(),
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
child.on("error", () => {
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
