#!/usr/bin/env node
/**
 * Rewrites tests/e2e/durations.json and tests/vitest-durations.json from the reports of finished CI runs, so the
 * Playwright and Vitest shards stay balanced as test files are added. Each file's duration is its mean over the given
 * runs; a browser target counts only where a run covered most spec files (not the Firefox smoke subset), and files
 * that no longer exist are dropped. Without run IDs it reads the last three finished Tests runs of main (all browser
 * targets and Vitest) and the latest nightly E2E run (all five browser targets). Needs an authenticated gh.
 *
 *   node scripts/verify/refresh-durations.mjs [RUN_ID ...]
 */

import { execFileSync } from "node:child_process";
import { existsSync, globSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { summarizeVitest } from "./lib/vitest-results.mjs";

const E2E_FILE = "tests/e2e/durations.json";
const VITEST_FILE = "tests/vitest-durations.json";

/**
 * Mean of each key over the samples that contain it, rounded to whole milliseconds and sorted by key.
 * @param {Array<Record<string, number>>} samples
 * @param {(key: string) => boolean} [keep]
 */
export function meanDurations(samples, keep = () => true) {
  const totals = {};
  for (const sample of samples)
    for (const [key, value] of Object.entries(sample)) {
      if (!keep(key) || typeof value !== "number") continue;
      totals[key] ??= { sum: 0, count: 0 };
      totals[key].sum += value;
      totals[key].count += 1;
    }
  return Object.fromEntries(
    Object.keys(totals)
      .sort()
      .map((key) => [key, Math.max(1, Math.round(totals[key].sum / totals[key].count))]),
  );
}

/**
 * Per-target spec-file durations of one run, from the outcomes.json of each shard; partial targets are left out.
 * @param {Array<Record<string, Array<{ file: string, duration: number }>>>} outcomeFiles
 * @param {number} specCount
 */
export function e2eSample(outcomeFiles, specCount) {
  const perTarget = {};
  for (const outcomes of outcomeFiles)
    for (const [target, results] of Object.entries(outcomes))
      for (const { file, duration } of results) {
        perTarget[target] ??= {};
        perTarget[target][file] = (perTarget[target][file] ?? 0) + duration;
      }
  return Object.fromEntries(
    Object.entries(perTarget).filter(([, files]) => Object.keys(files).length >= specCount * 0.8),
  );
}

/**
 * The repository-relative path of a file a CI runner reported by its absolute path.
 * @param {string} absolute
 * @param {(path: string) => boolean} exists
 */
export function repositoryPath(absolute, exists) {
  const parts = absolute.split(/[\\/]/);
  for (let index = 1; index < parts.length; index++) {
    const candidate = parts.slice(index).join("/");
    if (exists(candidate)) return candidate;
  }
  return null;
}

function latestRuns(workflow, limit, extra) {
  const output = execFileSync(
    "gh",
    [
      "run",
      "list",
      "--workflow",
      workflow,
      "--status",
      "completed",
      "--limit",
      String(limit),
      "--json",
      "databaseId",
      "-q",
      ".[].databaseId",
      ...extra,
    ],
    { encoding: "utf8" },
  ).trim();
  if (!output) throw new Error(`No finished ${workflow} run found`);
  return output.split("\n");
}

function main(runIds) {
  const repoRoot = resolve(new URL("../..", import.meta.url).pathname);
  // A merge that only changed docs or content leaves no browser or Vitest reports, so several main runs are read.
  const runs = runIds.length
    ? runIds
    : [
        ...latestRuns("test.yml", 3, ["--branch", "main", "--event", "push"]),
        ...latestRuns("e2e.yml", 1, ["--event", "schedule"]),
      ];
  const specs = readdirSync(join(repoRoot, "tests/e2e")).filter((file) => file.endsWith(".spec.ts"));
  const exists = (path) => existsSync(join(repoRoot, path));
  const e2eSamples = {};
  const vitestSamples = [];
  const scratch = mkdtempSync(join(tmpdir(), "customermates-durations-"));
  try {
    for (const run of runs) {
      const directory = join(scratch, run);
      // A run without one of the two kinds of reports (a nightly E2E run has no Vitest shards) is not an error.
      for (const pattern of ["e2e-*", "vitest-shard-*"])
        try {
          execFileSync("gh", ["run", "download", run, "--pattern", pattern, "--dir", directory], { stdio: "ignore" });
        } catch {}
      const outcomes = globSync("*/**/outcomes.json", { cwd: directory }).map((file) =>
        JSON.parse(readFileSync(join(directory, file), "utf8")),
      );
      for (const [target, files] of Object.entries(e2eSample(outcomes, specs.length)))
        (e2eSamples[target] ??= []).push(files);
      const vitest = {};
      for (const file of globSync("vitest-shard-*/shard-*.json", {
        cwd: directory,
      }).filter((file) => !file.endsWith(".flaky.json"))) {
        const report = JSON.parse(readFileSync(join(directory, file), "utf8"));
        for (const result of report.testResults ?? []) result.name = repositoryPath(result.name, exists) ?? result.name;
        Object.assign(vitest, summarizeVitest(report, ".").fileDurations);
      }
      if (Object.keys(vitest).length) vitestSamples.push(vitest);
      console.log(
        `run ${run}: browser targets ${Object.keys(e2eSample(outcomes, specs.length)).join(", ") || "none"}; ${Object.keys(vitest).length} Vitest files`,
      );
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }

  const specExists = (file) => specs.includes(file);
  if (Object.keys(e2eSamples).length) {
    const current = JSON.parse(readFileSync(join(repoRoot, E2E_FILE), "utf8"));
    const targets = { ...current.targets };
    for (const [target, samples] of Object.entries(e2eSamples)) targets[target] = meanDurations(samples, specExists);
    writeFileSync(
      join(repoRoot, E2E_FILE),
      `${JSON.stringify({ description: current.description, targets }, null, 2)}\n`,
    );
    console.log(
      `${E2E_FILE}: ${Object.entries(e2eSamples)
        .map(([target, samples]) => `${target} from ${samples.length} run(s)`)
        .join(", ")}`,
    );
  }
  if (vitestSamples.length) {
    const current = JSON.parse(readFileSync(join(repoRoot, VITEST_FILE), "utf8"));
    const files = meanDurations(vitestSamples, exists);
    writeFileSync(
      join(repoRoot, VITEST_FILE),
      `${JSON.stringify({ description: current.description, files }, null, 2)}\n`,
    );
    console.log(`${VITEST_FILE}: ${Object.keys(files).length} files from ${vitestSamples.length} run(s)`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
