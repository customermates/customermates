import { relative } from "node:path";

/**
 * Longest-processing-time assignment: the slowest files first, each to the currently lightest shard. Files without a
 * recorded duration count as the median, so a new test file does not pile onto one shard.
 */
export function assignShards(files, count, durations = {}) {
  const known = files.map((file) => durations[file]).filter((value) => typeof value === "number").sort((a, b) => a - b);
  const fallback = known.length ? known[Math.floor(known.length / 2)] : 1;
  const weighted = files
    .map((file) => ({ file, weight: typeof durations[file] === "number" ? durations[file] : fallback }))
    .sort((a, b) => b.weight - a.weight || a.file.localeCompare(b.file));
  const shards = Array.from({ length: count }, () => ({ files: [], load: 0 }));
  for (const { file, weight } of weighted) {
    const lightest = shards.reduce((best, shard) => (shard.load < best.load ? shard : best));
    lightest.files.push(file);
    lightest.load += weight;
  }
  return shards.map((shard) => shard.files.sort());
}

function firstLine(text) {
  return String(text ?? "")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 240);
}

/** Counts, failures, file-level errors (a file that failed to load) and per-file durations of a Vitest JSON report. */
export function summarizeVitest(report, root) {
  const summary = { passed: 0, failed: 0, skipped: 0, failures: [], fileErrors: [], flaky: report?.flaky ?? [], fileDurations: {} };
  for (const file of report?.testResults ?? []) {
    const name = relative(root, file.name);
    summary.fileDurations[name] = Math.max(1, (file.endTime ?? 0) - (file.startTime ?? 0));
    const failedTests = file.assertionResults.filter((test) => test.status === "failed");
    for (const test of file.assertionResults) {
      if (test.status === "passed") summary.passed++;
      else if (test.status === "failed") summary.failed++;
      else summary.skipped++;
    }
    for (const test of failedTests)
      summary.failures.push({ file: name, test: test.fullName, message: firstLine(test.failureMessages?.[0]) });
    if (file.status === "failed" && failedTests.length === 0) summary.fileErrors.push({ file: name, message: firstLine(file.message) });
  }
  return summary;
}
