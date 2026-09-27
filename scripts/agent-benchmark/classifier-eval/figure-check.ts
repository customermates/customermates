import {
  OFFLINE_TIMEOUT_MS,
  RUNS,
  loadEpisodes,
  majority,
  pool,
  readRaw,
  runClassifier,
  spendByUse,
  spentUsd,
  writeRaw,
  writeReport,
} from "./shared";

import type {
  ClassifierModel,
  ClassifierSpec,
} from "@/ee/agent-chat/classifier";
import type { StoredEpisode } from "./shared";

import { extractFigures } from "./figures";

const CASES = ["A1", "A2", "A3", "A4", "B1", "B2", "B3", "B4"];
const NUMERIC_CHECKS = new Set([
  "count-511",
  "median-exact",
  "ranking-exact",
  "count-exact",
  "duplicate-names-exact",
  "surplus-records-exact",
  "breakdown-exact",
  "waiting-count-12",
]);
const MODELS: ClassifierModel[] = ["jev", "gemini"];
function specFor(figures: readonly string[]): ClassifierSpec {
  return {
    id: "figure-self-check",
    questions: figures.map((figure, index) => ({
      id: `n${index}`,
      type: "boolean" as const,
      instruction: `Does \`evidence\` state the figure ${figure}? Count it as stated when the same amount appears with other formatting, such as thousand separators, a currency symbol or a unit.`,
    })),
  };
}

type Row = {
  episode: StoredEpisode;
  figures: string[];
  numericFailed: string[];
  passed: boolean;
};
type Supported = (boolean | null)[];

async function main() {
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const episode of loadEpisodes()) {
    if (
      !CASES.includes(episode.caseId) ||
      !episode.oracle ||
      seen.has(episode.episodeId) ||
      episode.judgeFacts.length === 0
    )
      continue;
    seen.add(episode.episodeId);
    const answer = episode.turnTexts.at(-1) ?? "";
    rows.push({
      episode,
      figures: extractFigures(answer, episode.prompts.join("\n")),
      numericFailed: episode.oracle.checks
        .filter((c) => NUMERIC_CHECKS.has(c.id) && !c.passed)
        .map((c) => c.id),
      passed: episode.oracle.passed,
    });
  }
  if (process.env.DRY) {
    for (const row of rows.filter((_, i) => i % 25 === 0))
      console.log(
        row.episode.caseId,
        row.numericFailed,
        JSON.stringify(row.figures),
        "|",
        (row.episode.turnTexts.at(-1) ?? "").slice(-300).replace(/\n/g, " / "),
      );
    return;
  }
  const cacheName = "figure-check-verdicts.json";
  const cache =
    readRaw<Record<string, Record<string, Supported[]>>>(cacheName) ?? {};
  for (const model of MODELS) {
    cache[model] ??= {};
    const todo = rows
      .flatMap((row) =>
        Array.from({ length: RUNS }, (_, run) => ({ row, run })),
      )
      .filter(
        ({ row, run }) =>
          row.figures.length > 0 &&
          cache[model]![row.episode.episodeId]?.[run] === undefined,
      );
    await pool(todo, 4, async ({ row, run }) => {
      const call = await runClassifier(
        `figures:${model}`,
        specFor(row.figures),
        { evidence: row.episode.judgeFacts.join("\n") },
        model,
        OFFLINE_TIMEOUT_MS,
      );
      const supported = row.figures.map((_, index) => {
        const answer = call.result?.answers[`n${index}`];
        return answer?.type === "boolean" ? answer.value : null;
      });
      cache[model]![row.episode.episodeId] ??= [];
      cache[model]![row.episode.episodeId]![run] = supported;
    });
    writeRaw(cacheName, cache);
    console.log(model, "done, spend", spentUsd().toFixed(4));
  }

  const results: Record<string, unknown> = {};
  const review: unknown[] = [];
  for (const model of MODELS) {
    let catches = 0;
    let falseAlarms = 0;
    let flaggedOtherFailures = 0;
    let numericFailures = 0;
    let passing = 0;
    let failedCalls = 0;
    for (const row of rows) {
      const runs = cache[model]![row.episode.episodeId] ?? [];
      const unsupported = row.figures.filter((_, index) => {
        const votes = runs
          .map((r) => r?.[index])
          .filter((v): v is boolean => typeof v === "boolean");
        if (votes.length === 0) return false;
        return !majority(votes);
      });
      if (
        row.figures.length > 0 &&
        runs.every((r) => !r || r.every((v) => v === null))
      )
        failedCalls += 1;
      const flagged = unsupported.length > 0;
      if (row.numericFailed.length > 0) numericFailures += 1;
      if (row.passed) passing += 1;
      if (flagged && row.numericFailed.length > 0) catches += 1;
      else if (flagged && row.passed) falseAlarms += 1;
      else if (flagged) flaggedOtherFailures += 1;
      if (flagged)
        review.push({
          model,
          episodeId: row.episode.episodeId,
          caseId: row.episode.caseId,
          outcome:
            row.numericFailed.length > 0
              ? "numeric-failure"
              : row.passed
                ? "passing"
                : "other-failure",
          numericFailed: row.numericFailed,
          unsupported,
          facts: row.episode.judgeFacts,
          answerTail: (row.episode.turnTexts.at(-1) ?? "").slice(-600),
        });
    }
    results[model] = {
      episodes: rows.length,
      episodesWithFigures: rows.filter((r) => r.figures.length > 0).length,
      numericFailures,
      passing,
      catches,
      catchRatePct: numericFailures
        ? Number(((100 * catches) / numericFailures).toFixed(1))
        : null,
      falseAlarmsOnPassing: falseAlarms,
      falseAlarmRatePct: passing
        ? Number(((100 * falseAlarms) / passing).toFixed(1))
        : null,
      flaggedOtherFailures,
      failedCalls,
      pass: catches >= 1 && falseAlarms === 0,
    };
  }
  writeRaw("figure-check-review.json", review);
  writeReport("figure-check.json", {
    rule: "Keep only if the check flags at least one episode that fails a numeric oracle and flags no passing episode. A figure is unsupported when the majority of 3 runs says the evidence does not state it.",
    limitation:
      "Stored episodes keep no tool outputs, so the evidence is each case's expected facts (judgeFacts), not the tool results the production design would use. N cases carry no facts and are excluded.",
    cases: CASES,
    numericChecks: [...NUMERIC_CHECKS],
    figuresPerEpisode: {
      mean: Number(
        (rows.reduce((a, r) => a + r.figures.length, 0) / rows.length).toFixed(
          1,
        ),
      ),
      max: Math.max(...rows.map((r) => r.figures.length)),
    },
    results,
    spendSoFarUsd: Number(spentUsd().toFixed(4)),
    spendByUse: spendByUse(),
  });
  console.log(JSON.stringify(results, null, 2));
}

await main();
