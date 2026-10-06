import "dotenv/config";

import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { NextRequest } from "next/server";

import { localE2eEnvironment } from "./local-environment";

const environment = localE2eEnvironment();
const mode = process.env.CRM_E2E_SERVER_MODE === "development" ? "dev" : "start";
// Match Next's production rewrite origin so missing pages stay internal; keep dev's HMR origin.
const hostname = mode === "dev" ? "127.0.0.1" : new NextRequest(environment.baseUrl).nextUrl.hostname;
const guard = resolve("tests/e2e/network-guard.mjs");
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
      CRM_LOCAL_TEST_TRANSPORT: "true",
      UNIPILE_API_KEY: "e2e-local-provider-no-network",
      HOSTED_AI_OPERATOR_CONTROLS_ENABLED: "true",
      HOSTED_AI_PROVIDER_WORK_PAUSED: "true",
      NEXT_TELEMETRY_DISABLED: "1",
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
