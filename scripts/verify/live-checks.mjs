#!/usr/bin/env node
/**
 * Live provider checks: real draft sends through the Unipile development application, from the sender test inbox to
 * the receiver test inbox, on a production Cloud build with its own database. Sends are allowed ONLY between the two
 * designated test inboxes: the addresses must match the hashes hard-coded in tests/e2e/live/live-allowlist.mjs,
 * and that guard, loaded into the server, refuses every other recipient, account, host and provider write.
 *
 *   yarn verify:live            # fetches the three secrets through `workspace secret run --only ...`
 *
 * Secrets are read from the environment only, never printed or written; logs contain markers, counts and statuses.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { buildAppCopy, e2eEnvironment, sourceDigest, syncAppCopy, withCopyLock } from "./lib/app-copy.mjs";
import { prepareDatabase } from "./lib/database.mjs";
import { testOutcomes } from "./lib/e2e-results.mjs";
import { ensureCluster, recreateDatabase } from "./lib/postgres.mjs";
import { cleanEnvironment, formatDuration, parseArguments, REPO_ROOT, run, seconds, table } from "./lib/process.mjs";
import { isTestInbox, TEST_ACCOUNT_IDS } from "../../tests/e2e/live/live-allowlist.mjs";
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n/, "").replace(/^\/\*\*?|^ \* ?/gm, ""));
  process.exit(0);
}

const SECRETS = ["UNIPILE_API_KEY", "UNIPILE_TEST_SENDER_EMAIL", "UNIPILE_TEST_RECEIVER_EMAIL"];
const options = parseArguments(process.argv.slice(2), { runId: "", rebuild: false, grep: "", preflight: false });

if (SECRETS.some((name) => !process.env[name])) {
  if (process.env.CRM_LIVE_SECRETS_LOADED) {
    console.error(`live-checks: ${SECRETS.join(", ")} are required.`);
    process.exit(2);
  }
  const result = spawnSync("workspace", ["secret", "run", "--only", SECRETS.join(","), "--", process.execPath, ...process.argv.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, CRM_LIVE_SECRETS_LOADED: "1" },
  });
  process.exit(result.status ?? 1);
}

if (!isTestInbox(process.env.UNIPILE_TEST_SENDER_EMAIL) || !isTestInbox(process.env.UNIPILE_TEST_RECEIVER_EMAIL)) {
  console.error("live-checks: refusing to run, the configured fixture addresses are not the designated test inboxes.");
  process.exit(2);
}

const startedAt = Date.now();
const runId = options.runId || `live-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
const directory = resolve(REPO_ROOT, ".runs/verify", runId);
mkdirSync(directory, { recursive: true });
const log = (message) => console.log(`[live ${formatDuration(seconds(startedAt))}] ${message}`);

for (const account of TEST_ACCOUNT_IDS) {
  const response = await fetch(`https://api.unipile.com/v2/accounts/${account}`, {
    headers: { "X-API-KEY": process.env.UNIPILE_API_KEY, accept: "application/json" },
  });
  if (!response.ok) {
    console.error(`live-checks: fixture account ${account} answered ${response.status}; refusing to run.`);
    process.exit(2);
  }
}
log("both fixture accounts are reachable and both addresses are the designated test inboxes");
if (options.preflight) process.exit(0);

const cluster = await ensureCluster(17);
const templateUrl = await recreateDatabase(cluster, "crm_e2e_live_template");
const digest = await sourceDigest();
const { copy, database, build } = await withCopyLock("cloud", async () => {
  const synced = await syncAppCopy("cloud", { databaseUrl: templateUrl, log: resolve(directory, "build.log") });
  const [prepared, built] = await Promise.all([
    prepareDatabase(templateUrl, { mode: "cloud", log: resolve(directory, "database.log") }),
    buildAppCopy("cloud", { digest, databaseUrl: templateUrl, secret: synced.secret, log: resolve(directory, "build.log"), force: options.rebuild }),
  ]);
  return { copy: synced, database: prepared, build: built };
});
if (!database.ok || build.code !== 0) {
  console.error(`live-checks: ${database.ok ? "the cloud build" : `database ${database.failedStep}`} failed; see ${relative(REPO_ROOT, directory)}/`);
  process.exit(1);
}
log(`cloud build ${build.reused ? "reused" : `done in ${formatDuration(build.seconds)}`}, database ready`);

const url = await recreateDatabase(cluster, "crm_e2e_live", "crm_e2e_live_template");
const ledger = resolve(directory, "sends.jsonl");
const port = 4000 + Math.floor(Math.random() * 900) + 600;
const env = cleanEnvironment({
  ...e2eEnvironment("cloud", { baseUrl: `http://127.0.0.1:${port}`, databaseUrl: url, secret: copy.secret }),
  CRM_E2E_RUN_ID: runId,
  CRM_E2E_LIVE_UNIPILE: "true",
  CRM_LIVE_WEBHOOK_SECRET: randomBytes(32).toString("hex"),
  CRM_LIVE_SEND_LEDGER: ledger,
  PATH: `${resolve(copy.directory, "node_modules/.bin")}:${process.env.PATH}`,
});
const result = await run(
  "node",
  ["node_modules/.bin/playwright", "test", "--config", "tests/e2e/live/playwright.live.config.ts", ...(options.grep ? ["--grep", options.grep] : [])],
  { cwd: copy.directory, env, log: resolve(directory, "playwright.log") },
);
await recreateDatabase(cluster, "crm_e2e_live").catch(() => undefined);

const reportFile = resolve(copy.directory, ".runs/e2e", runId, "results.json");
const outcomes = existsSync(reportFile) ? testOutcomes(JSON.parse(readFileSync(reportFile, "utf8"))) : [];
const entries = existsSync(ledger) ? readFileSync(ledger, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line)) : [];
console.log(`\nLive checks (${runId})`);
console.log(table(outcomes.map((outcome) => ({ check: outcome.id.split(" › ").pop(), result: outcome.status, time: formatDuration(outcome.duration / 1000), error: outcome.error ?? "" })), ["check", "result", "time", "error"]));
console.log(
  `Provider sends forwarded: ${entries.filter((entry) => entry.forwarded).length}; refused by the guard: ${entries.filter((entry) => entry.blocked).length} (${[...new Set(entries.filter((entry) => entry.blocked).map((entry) => `${entry.blocked}: ${entry.reason ?? entry.host ?? ""}`))].join("; ") || "none"})`,
);
console.log(`Total ${formatDuration(seconds(startedAt))}. Logs: ${relative(REPO_ROOT, directory)}/`);
process.exit(result.code === 0 && outcomes.length > 0 && outcomes.every((outcome) => outcome.status === "passed") ? 0 : 1);
