#!/usr/bin/env node
/**
 * Playwright matrix: one production build per APP_MODE (reused across browser projects and across runs while the
 * sources are unchanged), one migrated and seeded template database per mode, and shards that run at the same time,
 * each with its own server port and its own copy of the template database. Results are compared with
 * tests/e2e/known-failures.json, so only new failures fail the run; flaky tests (passed on the retry) are listed.
 *
 *   node scripts/verify/e2e.mjs --targets cloud-chromium,self-hosted-chromium [--shards 4] [--parallel 8]
 *   node scripts/verify/e2e.mjs --targets all --offload self-hosted-chromium,cloud-webkit   # those run on ws-test
 *   node scripts/verify/e2e.mjs --targets cloud-chromium -- tests/e2e/records.spec.ts --grep "decimal"
 */

import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { cpus, totalmem } from "node:os";
import { relative, resolve } from "node:path";

import { appDirectory, buildAppCopy, e2eEnvironment, sourceDigest, syncAppCopy, withCopyLock, writeEnvFile } from "./lib/app-copy.mjs";
import { prepareDatabase } from "./lib/database.mjs";
import { compareWithBaseline, mergeOutcomes, parseTarget, TARGETS, testOutcomes } from "./lib/e2e-results.mjs";
import { dropDatabase, ensureCluster, recreateDatabase } from "./lib/postgres.mjs";
import { assignShards } from "./lib/vitest-results.mjs";
import { capture, cleanEnvironment, formatDuration, parseArguments, pool, REPO_ROOT, run, seconds, table } from "./lib/process.mjs";
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n/, "").replace(/^\/\*\*?|^ \* ?/gm, ""));
  process.exit(0);
}

const separator = process.argv.indexOf("--");
const playwrightArgs = separator >= 0 ? process.argv.slice(separator + 1) : [];
const options = parseArguments(process.argv.slice(2, separator >= 0 ? separator : undefined), {
  targets: "cloud-chromium,self-hosted-chromium",
  shards: "",
  parallel: "",
  retries: "1",
  workers: "1",
  offload: "",
  runId: "",
  rebuild: false,
  baseline: "tests/e2e/known-failures.json",
  remote: false,
  prebuilt: false,
  shardIndex: "",
});
if (options.prebuilt && !process.env.CI && existsSync(resolve(REPO_ROOT, ".env")))
  throw new Error("--prebuilt uses the worktree's own .next and writes its .env; it is meant for CI. Locally, leave it out.");

const startedAt = Date.now();
const runId = options.runId || `e2e-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
if (!/^[a-zA-Z0-9_-]+$/.test(runId) || `${runId}-remote-self-hosted-chromium-99`.length > 100)
  throw new Error("--run-id must be letters, digits, - and _, short enough for Playwright's 100-character evidence directory names.");
const directory = resolve(REPO_ROOT, ".runs/verify", runId);
// Database names carry the run, so several runs of this worktree (or of agents sharing its cluster) never collide.
const runKey = createHash("sha256").update(runId).digest("hex").slice(0, 8);
mkdirSync(directory, { recursive: true });
const targets = (options.targets === "all" ? TARGETS : options.targets.split(",")).map((target) => target.trim()).filter(Boolean);
targets.forEach(parseTarget);
const offloaded = options.offload ? options.offload.split(",").filter((target) => targets.includes(target)) : [];
const local = targets.filter((target) => !offloaded.includes(target));

const cores = cpus().length;
const memoryGb = totalmem() / 1024 ** 3;
const parallel = Number(options.parallel) || Math.max(1, Math.min(Math.floor(cores / 2), Math.floor(memoryGb / 4)));
const shardsPerTarget = Number(options.shards) || Math.max(1, Math.floor(parallel / Math.max(1, local.length)));

const DURATION_FILES = [resolve(REPO_ROOT, ".runs/verify/e2e-durations.json"), resolve(REPO_ROOT, "tests/e2e/durations.json")];

/** Spec-file durations (ms) per target from earlier runs, used to balance shards; Playwright's own --shard splits by count. */
function durations() {
  for (const file of DURATION_FILES) if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")).targets ?? {};
  return {};
}

function specFiles() {
  return readdirSync(resolve(REPO_ROOT, "tests/e2e"))
    .filter((file) => file.endsWith(".spec.ts"))
    .sort();
}

/** The files of one shard, or null for Playwright's own --shard when the caller filters specs or no timings exist. */
function shardFiles(target, shard) {
  const known = durations()[target] ?? durations()["cloud-chromium"];
  if (playwrightArgs.length > 0 || !known) return null;
  return assignShards(specFiles(), shardsPerTarget, known)[shard - 1].map((file) => `tests/e2e/${file}`);
}

function log(message) {
  console.log(`[e2e ${formatDuration(seconds(startedAt))}] ${message}`);
}

async function freePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolvePort(port));
    });
  });
}

/** Runs the offloaded targets on the test VM through `workspace offload` and copies their reports back. */
async function runOffloaded() {
  if (offloaded.length === 0) return [];
  const remoteRunId = `${runId}-remote`;
  log(`offloading ${offloaded.join(", ")} to the test VM`);
  const args = [
    "offload",
    "customermates",
    "--",
    "bash",
    "-lc",
    [
      "set -e",
      `export CRM_VERIFY_ENV_TEMPLATE_B64=${readFileSync(resolve(REPO_ROOT, ".env.cloud.template")).toString("base64")}`,
      'stamp="$(sha256sum yarn.lock | cut -c1-16)"',
      'if [ ! -f node_modules/.verify-lock ] || [ "$(cat node_modules/.verify-lock)" != "$stamp" ]; then DATABASE_URL=postgresql://localhost/unused yarn install --frozen-lockfile --prefer-offline >/dev/null && echo "$stamp" > node_modules/.verify-lock; fi',
      `node scripts/verify/e2e.mjs --remote --targets ${offloaded.join(",")} --run-id ${remoteRunId} --retries ${options.retries} --workers ${options.workers}${options.parallel ? ` --parallel ${parallel}` : ""}${options.shards ? ` --shards ${options.shards}` : ""}${options.rebuild ? " --rebuild" : ""} ${playwrightArgs.length ? `-- ${playwrightArgs.map((arg) => `'${arg.replace(/'/g, "'\\''")}'`).join(" ")}` : ""}`,
    ].join("\n"),
  ];
  const result = await run("workspace", args, { log: resolve(directory, "offload.log"), echo: true, prefix: "  [ws-test] " });
  const remoteDirectory = `offload/customermates--${REPO_ROOT.split("/").pop()}/.runs/verify/${remoteRunId}/`;
  const host = (await capture("python3", ["-c", "import json,os;print(json.load(open(os.path.expanduser('~/.config/workspace-ops/config.json'))).get('offload_host','ws-test'))"]).catch(() => "ws-test")) || "ws-test";
  await run("rsync", ["-a", `${host}:${remoteDirectory}`, resolve(directory, "remote/")], { log: resolve(directory, "offload.log") });
  const summaryFile = resolve(directory, "remote/summary.json");
  if (!existsSync(summaryFile)) return offloaded.map((target) => ({ target, error: `offload exited ${result.code} without a report` }));
  return JSON.parse(readFileSync(summaryFile, "utf8")).targets.map((entry) => ({ ...entry, remote: true }));
}

async function runLocal() {
  if (local.length === 0) return [];
  const modes = [...new Set(local.map((target) => parseTarget(target).mode))];
  const cluster = await ensureCluster(17);
  const digest = options.prebuilt ? "prebuilt" : await sourceDigest();

  log(`preparing ${modes.map((mode) => `${mode} build + template database`).join(" and ")} (sources ${digest})`);
  const prepared = await Promise.all(
    modes.map(async (mode) => {
      const template = `crm_e2e_tpl_${mode.replace("-", "_")}_${runKey}`;
      const templateUrl = await recreateDatabase(cluster, template);
      const prepare = async () => {
        const copy = options.prebuilt
          ? { directory: REPO_ROOT, secret: process.env.BETTER_AUTH_SECRET || "synthetic-ci-e2e-auth-secret-0123456789abcdef" }
          : await syncAppCopy(mode, { digest, databaseUrl: templateUrl, log: resolve(directory, `build-${mode}.log`) });
        if (options.prebuilt) writeEnvFile(REPO_ROOT, mode, { databaseUrl: templateUrl, secret: copy.secret });
        const [database, build] = await Promise.all([
          prepareDatabase(templateUrl, { seedTimes: 2, mode, log: resolve(directory, `database-${mode}.log`) }),
          options.prebuilt
            ? { code: existsSync(resolve(REPO_ROOT, ".next/BUILD_ID")) ? 0 : 1, seconds: 0, reused: true }
            : buildAppCopy(mode, { digest, databaseUrl: templateUrl, secret: copy.secret, log: resolve(directory, `build-${mode}.log`), force: options.rebuild }),
        ]);
        return { copy, database, build };
      };
      const { copy, database, build } = options.prebuilt ? await prepare() : await withCopyLock(mode, digest, prepare);
      log(`${mode}: build ${build.reused ? "reused (sources unchanged)" : `${build.code === 0 ? "done" : "FAILED"} in ${formatDuration(build.seconds)}`}, database ${database.ok ? "ready" : `FAILED at ${database.failedStep}`} in ${formatDuration(database.seconds)}`);
      return { mode, template, copy, ok: build.code === 0 && database.ok, buildSeconds: build.seconds, buildReused: build.reused };
    }),
  );
  const byMode = Object.fromEntries(prepared.map((entry) => [entry.mode, entry]));

  const jobs = local.flatMap((target) =>
    Array.from({ length: shardsPerTarget }, (_, index) => ({ target, shard: index + 1 })).filter(({ shard }) => !options.shardIndex || shard === Number(options.shardIndex)),
  );
  log(`running ${jobs.length} shards (${shardsPerTarget} per target, ${Math.min(parallel, jobs.length)} at a time, retries ${options.retries})`);
  // WebKit renders on the CPU; a WebKit or mobile shard takes about two Chromium shards' worth of the machine.
  const weight = (target) => (/webkit|mobile/.test(target) ? 2 : 1);
  let used = 0;
  const waiting = [];
  const acquire = async (cost) => {
    while (used > 0 && used + cost > parallel) await new Promise((resolveSlot) => waiting.push(resolveSlot));
    used += cost;
  };
  const release = (cost) => {
    used -= cost;
    waiting.splice(0).forEach((wake) => wake());
  };
  const results = await pool(jobs, jobs.length, async (job) => {
    await acquire(weight(job.target));
    try {
      return await runShard(job);
    } finally {
      release(weight(job.target));
    }
  });
  async function runShard({ target, shard }) {
    const { mode, project } = parseTarget(target);
    const setup = byMode[mode];
    if (!setup.ok) return { target, shard, code: 1, outcomes: [], error: "build or database preparation failed" };
    const database = `crm_e2e_${target.replace(/-/g, "_")}_${shard}_${runKey}`;
    const url = await recreateDatabase(cluster, database, setup.template);
    const port = await freePort();
    const shardRunId = `${runId}-${target}-${shard}`;
    const env = cleanEnvironment({
      ...e2eEnvironment(mode, { baseUrl: `http://127.0.0.1:${port}`, databaseUrl: url, secret: setup.copy.secret }),
      CRM_E2E_RUN_ID: shardRunId,
      CRM_E2E_RETRIES: options.retries,
      CRM_E2E_WORKERS: options.workers,
      PATH: `${resolve(setup.copy.directory, "node_modules/.bin")}:${process.env.PATH}`,
    });
    const shardLog = resolve(directory, `${target}-${shard}.log`);
    const files = shardFiles(target, shard);
    if (files?.length === 0) return { target, shard, code: 0, outcomes: [], seconds: 0 };
    const started = Date.now();
    const result = await run(
      "node",
      ["node_modules/.bin/playwright", "test", `--project=${project}`, ...(files ? files : ["--shard", `${shard}/${shardsPerTarget}`, ...playwrightArgs])],
      { cwd: setup.copy.directory, env, log: shardLog },
    );
    const reportFile = resolve(setup.copy.directory, ".runs/e2e", shardRunId, "results.json");
    let outcomes = [];
    if (existsSync(reportFile)) {
      cpSync(reportFile, resolve(directory, `${target}-${shard}.json`));
      outcomes = testOutcomes(JSON.parse(readFileSync(reportFile, "utf8")));
    }
    await dropDatabase(cluster, database).catch(() => undefined);
    rmSync(resolve(setup.copy.directory, ".runs/e2e", database), { recursive: true, force: true });
    log(`${target} shard ${shard}/${shardsPerTarget}: exit ${result.code}, ${outcomes.length} tests in ${formatDuration(seconds(started))}`);
    return { target, shard, code: result.code, outcomes, seconds: seconds(started), error: existsSync(reportFile) ? undefined : `no report (exit ${result.code}); see ${relative(REPO_ROOT, shardLog)}` };
  }

  await Promise.all(prepared.map((entry) => dropDatabase(cluster, entry.template).catch(() => undefined)));
  return local.map((target) => {
    const shardResults = results.filter((result) => result.target === target);
    return {
      target,
      outcomes: mergeOutcomes(shardResults.map((result) => result.outcomes)),
      seconds: Math.max(...shardResults.map((result) => result.seconds ?? 0)),
      buildSeconds: byMode[parseTarget(target).mode].buildSeconds,
      buildReused: byMode[parseTarget(target).mode].buildReused,
      shards: shardResults.length,
      error: shardResults.map((result) => result.error).filter(Boolean).join("; ") || undefined,
    };
  });
}

const [localResults, remoteResults] = await Promise.all([runLocal(), runOffloaded()]);
{
  const known = durations();
  for (const entry of [...localResults, ...remoteResults]) {
    const perFile = {};
    for (const outcome of entry.outcomes ?? []) perFile[outcome.file] = (perFile[outcome.file] ?? 0) + outcome.duration;
    if (Object.keys(perFile).length > 0 && playwrightArgs.length === 0) known[entry.target] = { ...(known[entry.target] ?? {}), ...perFile };
  }
  writeFileSync(DURATION_FILES[0], JSON.stringify({ targets: known }, null, 2));
}
const baseline = existsSync(resolve(REPO_ROOT, options.baseline)) ? JSON.parse(readFileSync(resolve(REPO_ROOT, options.baseline), "utf8")) : { targets: {} };
const all = [...localResults, ...remoteResults].map((entry) => ({ ...entry, comparison: compareWithBaseline(entry.outcomes ?? [], baseline.targets?.[entry.target]) }));

writeFileSync(
  resolve(directory, "summary.json"),
  JSON.stringify({ runId, seconds: seconds(startedAt), targets: all.map(({ comparison, ...entry }) => entry) }, null, 1),
);
writeFileSync(resolve(directory, "outcomes.json"), JSON.stringify(Object.fromEntries(all.map((entry) => [entry.target, entry.outcomes ?? []])), null, 1));

if (!options.remote) {
  const rows = all.map(({ target, comparison, seconds: targetSeconds, shards, remote, error, buildSeconds, buildReused }) => ({
    target: `${target}${remote ? " (ws-test)" : ""}`,
    passed: comparison.passed,
    flaky: comparison.flaky,
    "new failures": comparison.newFailures.length,
    "known failures": comparison.knownFailures.length,
    fixed: comparison.fixed.length,
    skipped: comparison.skipped,
    shards: shards ?? "-",
    build: buildReused ? "reused" : formatDuration(buildSeconds),
    tests: formatDuration(targetSeconds),
    result: error && comparison.passed + comparison.failed === 0 ? "ERROR" : comparison.newFailures.length ? "FAIL" : "pass",
  }));
  console.log(`\nPlaywright (${runId}), compared with ${options.baseline}`);
  console.log(table(rows, Object.keys(rows[0] ?? { target: "" })));
  for (const entry of all) {
    for (const failure of entry.comparison.newFailures) console.log(`  NEW FAILURE [${entry.target}] ${failure.id}:${failure.line}\n      ${failure.error ?? ""}`);
    for (const flaky of entry.comparison.flakyTests) console.log(`  FLAKY [${entry.target}] ${flaky.id}${flaky.known ? " (known)" : ""}`);
    for (const fixed of entry.comparison.fixed) console.log(`  NOW PASSING (remove from the baseline) [${entry.target}] ${fixed.id}`);
    if (entry.error) console.log(`  ERROR [${entry.target}] ${entry.error}`);
  }
  console.log(`Total ${formatDuration(seconds(startedAt))}. Reports: ${relative(REPO_ROOT, directory)}/ (HTML reports and traces under ${relative(REPO_ROOT, appDirectory("<mode>"))}/.runs/e2e/)`);
}

const failed = all.some((entry) => entry.comparison.newFailures.length > 0 || (entry.error && entry.comparison.passed + entry.comparison.failed === 0));
process.exit(failed ? 1 : 0);

