#!/usr/bin/env node
/**
 * Compares Playwright JSON reports with tests/e2e/known-failures.json, or rewrites that baseline from them.
 *
 *   node scripts/verify/e2e-baseline.mjs compare --target cloud-chromium results-1.json results-2.json [--markdown out.md]
 *   node scripts/verify/e2e-baseline.mjs compare .runs/verify/<run>/outcomes.json [more outcomes.json ...]
 *   node scripts/verify/e2e-baseline.mjs write .runs/verify/<run>/outcomes.json [--union]
 *
 * `compare` exits 1 when a test fails that is not in the baseline. It prints new failures, tests that passed only on
 * the retry (flaky) and baseline entries that now pass (delete them from the baseline).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { compareWithBaseline, mergeOutcomes, parseTarget, testOutcomes, updateBaseline } from "./lib/e2e-results.mjs";
import { parseArguments, REPO_ROOT, table } from "./lib/process.mjs";
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0].replace(/^#!.*\n/, "").replace(/^\/\*\*?|^ \* ?/gm, ""));
  process.exit(0);
}

const options = parseArguments(process.argv.slice(2), {
  target: "",
  outcomes: "",
  baseline: "tests/e2e/known-failures.json",
  markdown: "",
  union: false,
  source: "",
});
const [command, ...reports] = options._;
const baselineFile = resolve(REPO_ROOT, options.baseline);
const baseline = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, "utf8")) : { targets: {} };

function outcomesByTarget() {
  if (!options.target) {
    const files = [...(options.outcomes ? options.outcomes.split(",") : []), ...reports];
    if (files.length === 0) throw new Error("Pass --target with Playwright reports, or outcomes.json files of scripts/verify/e2e.mjs.");
    const merged = {};
    for (const file of files)
      for (const [target, outcomes] of Object.entries(JSON.parse(readFileSync(resolve(file), "utf8")))) (merged[target] ??= []).push(outcomes);
    return Object.fromEntries(Object.entries(merged).map(([target, lists]) => [target, mergeOutcomes(lists)]));
  }
  parseTarget(options.target);
  return { [options.target]: mergeOutcomes(reports.map((file) => testOutcomes(JSON.parse(readFileSync(resolve(file), "utf8"))))) };
}

const byTarget = outcomesByTarget();

if (command === "write") {
  let next = baseline;
  for (const [target, outcomes] of Object.entries(byTarget)) next = updateBaseline(next, target, outcomes, { union: options.union, source: options.source || undefined });
  mkdirSync(dirname(baselineFile), { recursive: true });
  writeFileSync(baselineFile, `${JSON.stringify(next, null, 2)}\n`);
  for (const [target, entry] of Object.entries(next.targets)) console.log(`${target}: ${entry.failing.length} failing, ${entry.flaky.length} flaky of ${entry.tests}`);
  process.exit(0);
}

if (command !== "compare") {
  console.error("usage: e2e-baseline.mjs compare|write [--target T reports... | --outcomes file]");
  process.exit(2);
}

const lines = [];
const rows = [];
let newFailures = 0;
for (const [target, outcomes] of Object.entries(byTarget)) {
  const comparison = compareWithBaseline(outcomes, baseline.targets?.[target]);
  newFailures += comparison.newFailures.length;
  if (comparison.passed + comparison.failed + comparison.flaky === 0) {
    newFailures += 1;
    lines.push(`- **NO TESTS RAN** for \`${target}\`: the shards produced no results (see their logs).`);
  }
  rows.push({
    target,
    passed: comparison.passed,
    flaky: comparison.flaky,
    "new failures": comparison.newFailures.length,
    "known failures": comparison.knownFailures.length,
    "now passing": comparison.fixed.length,
    skipped: comparison.skipped,
  });
  for (const failure of comparison.newFailures) lines.push(`- **NEW FAILURE** \`${target}\` ${failure.id} (line ${failure.line}): ${failure.error ?? ""}`);
  for (const flaky of comparison.flakyTests) lines.push(`- flaky (passed on retry) \`${target}\` ${flaky.id}${flaky.known ? " (known flaky)" : ""}`);
  for (const fixed of comparison.fixed) lines.push(`- now passing, remove from the baseline: \`${target}\` ${fixed.id}`);
}
const output = `${table(rows, Object.keys(rows[0] ?? { target: "" }))}\n\n${lines.join("\n")}`;
console.log(output);
if (options.markdown) appendFileSync(resolve(options.markdown), `### Playwright compared with the known-failure baseline\n\n${output}\n`);
if (process.env.GITHUB_ACTIONS)
  for (const line of lines.filter((entry) => entry.includes("NEW FAILURE") || entry.includes("NO TESTS RAN"))) console.log(`::error::${line.replace(/\*\*/g, "")}`);
process.exit(newFailures > 0 ? 1 : 0);
