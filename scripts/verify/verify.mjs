#!/usr/bin/env node
/**
 * Verification tiers for a pull request. Lanes run at the same time; each prints its own report and the end is one
 * summary table.
 *
 *   yarn verify:fast   static checks, the Vitest files affected by the change (with database tests), Playwright on
 *                      Cloud Chromium and self-hosted Chromium, and the migration matrix when prisma/ changed
 *   yarn verify:full   static checks, the whole Vitest suite, the migration matrix, Playwright on all five targets
 *                      (self-hosted and WebKit/mobile offloaded to ws-test), and the live draft-send checks
 *
 * Options: --base origin/main (the change is HEAD and the working tree against its merge base), --offload
 * [targets] / --no-offload, --no-e2e, --no-vitest, --no-static, --live / --no-live, --shards N (Playwright shards per
 * target). Use the full tier for auth, roles and permissions, migrations, sending, billing, and before a release.
 */
import { readFileSync as readSource } from "node:fs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { capture, cleanEnvironment, formatDuration, parseArguments, REPO_ROOT, run, seconds, table } from "./lib/process.mjs";
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(readSource(new URL(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n/, "").replace(/^\/\*\*?|^ \* ?/gm, ""));
  process.exit(0);
}

const RISKY = [
  [/^prisma\//, "database schema or migrations"],
  [/(^|\/)(auth|better-auth|session|invitation|api-key)/i, "authentication"],
  [/(role|permission|access)/i, "roles and permissions"],
  [/(messaging|unipile|send-email|draft)/i, "sending"],
  [/(billing|lemonsqueezy|subscription|entitlement|pricing)/i, "billing"],
];

const options = parseArguments(process.argv.slice(2), {
  tier: "fast",
  base: "origin/main",
  offload: "",
  e2e: true,
  vitest: true,
  static: true,
  live: "",
  migrations: "",
  shards: "",
});
const full = options.tier === "full";
const startedAt = Date.now();
const runId = `${options.tier}-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
const directory = resolve(REPO_ROOT, ".runs/verify", runId);
mkdirSync(directory, { recursive: true });

const mergeBase = await capture("git", ["merge-base", options.base, "HEAD"]).catch(() => options.base);
const changed = [
  ...new Set(
    [
      ...(await capture("git", ["diff", "--name-only", mergeBase])).split("\n"),
      ...(await capture("git", ["ls-files", "--others", "--exclude-standard"])).split("\n"),
    ].filter(Boolean),
  ),
];
const risks = [...new Set(changed.flatMap((file) => RISKY.filter(([pattern]) => pattern.test(file)).map(([, area]) => area)))];
const runMigrations = options.migrations === "" ? full || changed.some((file) => file.startsWith("prisma/")) : options.migrations !== "false";
const runLive = options.live === "" ? full : options.live !== "false";
const offloadTargets = options.offload === "false" ? "" : options.offload === "" ? (full ? "self-hosted-chromium,cloud-webkit,cloud-mobile" : "") : options.offload === "true" ? "self-hosted-chromium" : options.offload;

console.log(`verify:${options.tier} on ${(await capture("git", ["rev-parse", "--short", "HEAD"]))}${changed.length ? ` + ${changed.length} changed files since ${options.base}` : ""}`);
if (!full && risks.length) console.log(`  This change touches ${risks.join(", ")}: run yarn verify:full before merging.`);

const results = [];
async function stage(name, command, args, extra = {}) {
  const log = resolve(directory, `${name.replace(/[^a-z0-9]+/gi, "-")}.log`);
  console.log(`  started ${name}`);
  const result = await run(command, args, { log, env: cleanEnvironment(extra.env ?? {}), echo: extra.echo ?? false, prefix: `  [${name}] ` });
  const entry = { stage: name, result: result.code === 0 ? "pass" : "FAIL", time: formatDuration(result.seconds), log: `.runs/verify/${runId}/${log.split("/").pop()}` };
  results.push(entry);
  console.log(`  ${entry.result === "pass" ? "passed" : "FAILED"} ${name} in ${entry.time}`);
  return entry;
}

const staticLane = async () => {
  if (!options.static) return;
  await Promise.all([
    stage("generated files", "bash", ["-c", "yarn -s openapi:generate >/dev/null && yarn -s raw-docs:generate >/dev/null && git diff --exit-code --stat -- public generated content"], { env: { APP_MODE: "self-hosted" } }),
    stage("typecheck", "yarn", ["-s", "typecheck"]),
    stage("lint", "yarn", ["-s", "lint", "--cache", "--cache-location", ".runs/verify/.eslintcache", "--cache-strategy", "content"], { env: { NODE_OPTIONS: "--max-old-space-size=8192" } }),
    stage("i18n audit", "yarn", ["-s", "i18n:audit"], { env: { APP_MODE: "self-hosted" } }),
  ]);
};

const vitestLane = async () => {
  if (!options.vitest) return;
  await stage(full ? "vitest (all)" : "vitest (affected)", "node", ["scripts/verify/vitest.mjs", "--run-id", `${runId}-vitest`, ...(full ? [] : ["--changed", mergeBase])], { echo: true });
};

const allTargets = full ? ["cloud-chromium", "cloud-firefox", "self-hosted-chromium", "cloud-webkit", "cloud-mobile"] : ["cloud-chromium", "self-hosted-chromium"];
const offloaded = offloadTargets ? offloadTargets.split(",").filter((target) => allTargets.includes(target)) : [];
const localTargets = allTargets.filter((target) => !offloaded.includes(target));

function playwrightStage(name, targets, key, extra = []) {
  return stage(
    name,
    "node",
    // Short run ids: Playwright's evidence directory name (run id plus target and shard) must stay within 100 characters.
    ["scripts/verify/e2e.mjs", "--targets", targets.join(","), "--run-id", `${runId}-${key}`, "--shards", options.shards || "4", ...extra],
    { echo: true },
  );
}

const e2eLanes = () => {
  if (!options.e2e) return [];
  const lanes = [];
  if (localTargets.length) {
    const local = playwrightStage(`playwright ${localTargets.join(" + ")}`, localTargets, "e2e");
    lanes.push(local);
  }
  if (offloaded.length) lanes.push(playwrightStage(`playwright ${offloaded.join(" + ")} (ws-test)`, offloaded, "e2e-vm", ["--offload", offloaded.join(",")]));
  return lanes;
};

const extraLane = async () => {
  if (runMigrations) await stage("migration matrix", "node", ["scripts/verify/migrations.mjs", "--run-id", `${runId}-migrations`], { echo: true });
  if (runLive) await stage("live draft-send", "node", ["scripts/verify/live-checks.mjs", "--run-id", `${runId}-live`], { echo: true });
};

const browserLanes = e2eLanes();
await Promise.all([
  (async () => {
    await staticLane();
    await vitestLane();
  })(),
  ...browserLanes,
  extraLane(),
]);

const order = ["generated files", "typecheck", "lint", "i18n audit"];
results.sort((a, b) => (order.indexOf(a.stage) + 1 || 99) - (order.indexOf(b.stage) + 1 || 99));
console.log(`\nverify:${options.tier} summary (${formatDuration(seconds(startedAt))})`);
console.log(table(results, ["stage", "result", "time", "log"]));
if (!full && risks.length) console.log(`Risky areas touched (${risks.join(", ")}): yarn verify:full is required before merging.`);
writeFileSync(resolve(directory, "summary.json"), JSON.stringify({ tier: options.tier, seconds: seconds(startedAt), risks, results }, null, 2));
process.exit(results.every((entry) => entry.result === "pass") ? 0 : 1);

