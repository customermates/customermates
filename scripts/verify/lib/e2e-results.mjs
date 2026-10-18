/**
 * Playwright JSON reports reduced to one outcome per test, compared against the checked-in list of tests that are
 * known to fail on main (tests/e2e/known-failures.json). Test identities leave out line numbers, so editing a spec
 * file above a known failure does not turn it into a "new" failure.
 */

export const TARGETS = ["cloud-chromium", "cloud-firefox", "cloud-webkit", "cloud-mobile", "self-hosted-chromium"];

export function targetOf(mode, project) {
  return `${mode}-${project}`;
}

export function parseTarget(target) {
  const match = /^(cloud|self-hosted)-(chromium|firefox|webkit|mobile)$/.exec(target);
  if (!match) throw new Error(`Unknown E2E target ${target}; expected one of ${TARGETS.join(", ")}.`);
  return { mode: match[1], project: match[2] };
}

function firstLine(text) {
  return String(text ?? "")
    .replace(/\u001b\[[0-9;]*m/g, "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean)
    ?.slice(0, 240);
}

/** Flattens a Playwright JSON report into { id, file, line, status, error, duration } per test. */
export function testOutcomes(report) {
  const outcomes = [];
  const visit = (suite, titles) => {
    const ownTitles = suite.file && suite.title === suite.file ? titles : [...titles, suite.title].filter(Boolean);
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const results = test.results ?? [];
        const last = results.at(-1);
        const failed = results.find((result) => result.status !== "passed" && result.status !== "skipped");
        outcomes.push({
          id: [spec.file, ...ownTitles, spec.title].join(" › "),
          file: spec.file,
          line: spec.line,
          project: test.projectName,
          status: test.status === "expected" ? "passed" : test.status === "unexpected" ? "failed" : test.status,
          attempts: results.length,
          duration: results.reduce((total, result) => total + (result.duration ?? 0), 0),
          error: failed ? firstLine(failed.error?.message ?? failed.errors?.[0]?.message) : undefined,
          interrupted: last?.status === "interrupted",
        });
      }
    }
    for (const child of suite.suites ?? []) visit(child, ownTitles);
  };
  for (const suite of report.suites ?? []) visit(suite, []);
  return outcomes;
}

/** Several shard reports of one target merged; a test seen twice keeps its worst outcome. */
export function mergeOutcomes(lists) {
  const rank = { failed: 3, flaky: 2, passed: 1, skipped: 0 };
  const byId = new Map();
  for (const outcome of lists.flat()) {
    const known = byId.get(outcome.id);
    if (!known || (rank[outcome.status] ?? 0) > (rank[known.status] ?? 0)) byId.set(outcome.id, outcome);
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Splits a target's outcomes by the baseline: failures not in the baseline are new (they fail the run), baseline
 * failures that passed are fixed (remove them from the baseline), flaky tests passed only on retry.
 */
export function compareWithBaseline(outcomes, baselineTarget = {}) {
  const knownFailing = new Set(baselineTarget.failing ?? []);
  const knownFlaky = new Set(baselineTarget.flaky ?? []);
  /** @type {any[]} */ const none = [];
  const summary = { passed: 0, failed: 0, flaky: 0, skipped: 0, newFailures: [...none], knownFailures: [...none], fixed: [...none], flakyTests: [...none] };
  for (const outcome of outcomes) {
    if (outcome.status === "passed") summary.passed++;
    else if (outcome.status === "skipped") summary.skipped++;
    else if (outcome.status === "flaky") {
      summary.flaky++;
      summary.flakyTests.push({ ...outcome, known: knownFlaky.has(outcome.id) || knownFailing.has(outcome.id) });
    } else {
      summary.failed++;
      (knownFailing.has(outcome.id) ? summary.knownFailures : summary.newFailures).push(outcome);
    }
    if ((outcome.status === "passed" || outcome.status === "flaky") && knownFailing.has(outcome.id)) summary.fixed.push(outcome);
  }
  return summary;
}

/** The baseline entry a run of `outcomes` would produce: tests failing after the retry, and tests that needed it. */
export function baselineEntry(outcomes) {
  return {
    failing: outcomes.filter((outcome) => outcome.status === "failed").map((outcome) => outcome.id),
    flaky: outcomes.filter((outcome) => outcome.status === "flaky").map((outcome) => outcome.id),
  };
}

/**
 * Updates a baseline document. With `union`, an entry keeps its previous failures too (for combining runs from
 * different machines), otherwise it is replaced by what this run observed.
 */
export function updateBaseline(baseline, target, outcomes, { union = false, source } = {}) {
  const entry = baselineEntry(outcomes);
  const previous = baseline.targets?.[target] ?? { failing: [], flaky: [] };
  const merged = union
    ? {
        failing: [...new Set([...previous.failing, ...entry.failing])].sort(),
        flaky: [...new Set([...previous.flaky, ...entry.flaky])].filter((id) => !entry.failing.includes(id)).sort(),
      }
    : { failing: entry.failing.sort(), flaky: entry.flaky.sort() };
  return {
    version: 1,
    description:
      "Playwright tests known to fail (after one retry) or to need a retry on main, per build mode and browser project. Generated by scripts/verify/e2e-baseline.mjs --write; regenerate it from a main run, do not edit by hand to hide a regression.",
    ...baseline,
    updatedAt: new Date().toISOString().slice(0, 10),
    ...(source ? { source } : {}),
    targets: { ...(baseline.targets ?? {}), [target]: { tests: outcomes.length, ...merged } },
  };
}
