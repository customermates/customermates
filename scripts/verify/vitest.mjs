#!/usr/bin/env node
/**
 * Runs the Vitest suite split into shards that run at the same time, each against its own copy of a migrated and
 * seeded database (CREATE DATABASE ... TEMPLATE, so the copies cost milliseconds). Shards are balanced by the file
 * durations of the previous run (.runs/verify/vitest-durations.json, or the checked-in tests/vitest-durations.json).
 *
 *   node scripts/verify/vitest.mjs [--shards 3] [--max-workers 4] [--changed origin/main] [--retry 1] [--no-database]
 *   node scripts/verify/vitest.mjs --shard-index 2 --shards 4   # one shard only (CI matrix job)
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { relative, resolve } from "node:path";

import { ensureCluster, recreateDatabase } from "./lib/postgres.mjs";
import { prepareDatabase } from "./lib/database.mjs";
import { capture, cleanEnvironment, formatDuration, parseArguments, REPO_ROOT, run, seconds, table } from "./lib/process.mjs";
import { assignShards, summarizeVitest } from "./lib/vitest-results.mjs";
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n/, "").replace(/^\/\*\*?|^ \* ?/gm, ""));
  process.exit(0);
}

const options = parseArguments(process.argv.slice(2), {
  shards: "",
  shardIndex: "",
  maxWorkers: "",
  changed: "",
  retry: "1",
  database: true,
  runId: "",
  quiet: false,
  files: "",
  generate: true,
});

const FLAKY_REPORTER = resolve(REPO_ROOT, "scripts/verify/lib/vitest-flaky-reporter.mjs");
const runId = options.runId || `vitest-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`;
const directory = resolve(REPO_ROOT, ".runs/verify", runId);
mkdirSync(directory, { recursive: true });
const startedAt = Date.now();

async function listFiles() {
  const output = await capture("node_modules/.bin/vitest", ["list", "--filesOnly", "--json", ...(options.changed ? ["--changed", options.changed] : [])], {
    env: cleanEnvironment({ APP_MODE: "self-hosted" }),
  });
  const parsed = JSON.parse(output.slice(output.indexOf("[")));
  return [...new Set(parsed.map((entry) => relative(REPO_ROOT, entry.file)))].sort();
}

function durations() {
  for (const file of [resolve(REPO_ROOT, ".runs/verify/vitest-durations.json"), resolve(REPO_ROOT, "tests/vitest-durations.json")])
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")).files ?? {};
  return {};
}

// Tests read generated sources: the fumadocs collections (.source, also made by typecheck), the OpenAPI document and the
// raw docs manifest. CI generated them in earlier steps of the same job; a fresh worktree has none of them.
if (options.generate) {
  const generators = [
    ["node_modules/.bin/fumadocs-mdx", ["core/fumadocs/source.config.ts"]],
    ["node_modules/.bin/tsx", ["scripts/generate-openapi.ts"]],
    ["node_modules/.bin/tsx", ["scripts/generate-raw-docs-manifest.ts"]],
  ];
  for (const [command, args] of generators) {
    const result = await run(command, args, { env: cleanEnvironment({ APP_MODE: "self-hosted" }), log: resolve(directory, "generate.log") });
    if (result.code !== 0) {
      console.error(`vitest: ${args[0]} failed; see ${relative(REPO_ROOT, directory)}/generate.log`);
      process.exit(1);
    }
  }
}

const files = options.files ? options.files.split(",") : await listFiles();
if (files.length === 0) {
  console.log("vitest: no test files affected.");
  process.exit(0);
}
const cores = cpus().length;
const shardCount = Math.max(1, Math.min(Number(options.shards) || Math.max(1, Math.floor(cores / 5)), files.length));
const maxWorkers = Number(options.maxWorkers) || Math.max(2, Math.floor(cores / shardCount) - 1);
const shards = assignShards(files, shardCount, durations());
const selected = options.shardIndex ? [Number(options.shardIndex) - 1] : shards.map((_, index) => index);

let template = null;
let cluster = null;
if (options.database) {
  cluster = await ensureCluster(17);
  template = "crm_verify_vitest_template";
  const url = await recreateDatabase(cluster, template);
  const prepared = await prepareDatabase(url, { seedTimes: 2, log: resolve(directory, "database.log") });
  if (!prepared.ok) {
    console.error(`vitest: database preparation failed at ${prepared.failedStep}; see ${relative(REPO_ROOT, directory)}/database.log`);
    process.exit(1);
  }
  if (!options.quiet) console.log(`vitest: template database ready in ${formatDuration(prepared.seconds)}`);
}

const results = await Promise.all(
  selected.map(async (index) => {
    const shardFiles = shards[index];
    if (shardFiles.length === 0) return { index, code: 0, seconds: 0, report: null };
    const name = `crm_verify_vitest_${index + 1}`;
    const url = options.database ? await recreateDatabase(cluster, name, template) : null;
    const report = resolve(directory, `shard-${index + 1}.json`);
    rmSync(report, { force: true });
    const env = cleanEnvironment({
      APP_MODE: "self-hosted",
      AI_GATEWAY_API_KEY: "",
      VITEST_RETRY: options.retry,
      VITEST_FLAKY_REPORT: resolve(directory, `shard-${index + 1}.flaky.json`),
      ...(url ? { DATABASE_URL: url, DIRECT_URL: url, WORKFLOW_POSTGRES_URL: url, RUN_DATABASE_TESTS: "true" } : {}),
    });
    const result = await run(
      "node_modules/.bin/vitest",
      ["run", `--maxWorkers=${maxWorkers}`, "--reporter=dot", "--reporter=json", `--reporter=${FLAKY_REPORTER}`, `--outputFile.json=${report}`, ...shardFiles],
      { env, log: resolve(directory, `shard-${index + 1}.log`) },
    );
    if (url) await recreateDatabase(cluster, name).catch(() => undefined);
    const flakyFile = resolve(directory, `shard-${index + 1}.flaky.json`);
    const flaky = existsSync(flakyFile) ? JSON.parse(readFileSync(flakyFile, "utf8")) : [];
    return { index, ...result, report: existsSync(report) ? { ...JSON.parse(readFileSync(report, "utf8")), flaky } : null };
  }),
);

const rows = results.map(({ index, code, seconds: shardSeconds, report }) => {
  const summary = summarizeVitest(report, REPO_ROOT);
  return {
    shard: `${index + 1}/${shardCount}`,
    files: shards[index].length,
    passed: summary.passed,
    failed: summary.failed,
    flaky: summary.flaky.length,
    skipped: summary.skipped,
    time: formatDuration(shardSeconds),
    result: code === 0 ? "pass" : report ? "FAIL" : "ERROR",
    summary,
  };
});

const fileDurations = { ...durations() };
for (const { summary } of rows) Object.assign(fileDurations, summary.fileDurations);
writeFileSync(resolve(REPO_ROOT, ".runs/verify/vitest-durations.json"), JSON.stringify({ files: fileDurations }, null, 1));

console.log(`\nVitest: ${files.length} files in ${shardCount} shards x ${maxWorkers} workers${options.database ? ", own database per shard" : ", no database"}`);
console.log(table(rows, ["shard", "files", "passed", "failed", "flaky", "skipped", "time", "result"]));
for (const { summary } of rows) {
  for (const failure of summary.failures) console.log(`  FAIL ${failure.file} > ${failure.test}\n       ${failure.message}`);
  for (const flaky of summary.flaky) console.log(`  FLAKY (passed on retry ${flaky.retries}) ${flaky.file} > ${flaky.test}`);
  for (const error of summary.fileErrors) console.log(`  FILE ERROR ${error.file}: ${error.message}`);
}
console.log(`Total ${formatDuration(seconds(startedAt))}; reports in ${relative(REPO_ROOT, directory)}/`);
writeFileSync(resolve(directory, "summary.json"), JSON.stringify(rows.map(({ summary, ...row }) => ({ ...row, failures: summary.failures, flaky: summary.flaky, fileErrors: summary.fileErrors })), null, 2));
process.exit(rows.every((row) => row.result === "pass") ? 0 : 1);
