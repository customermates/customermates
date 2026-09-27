import {
  OFFLINE_TIMEOUT_MS,
  RUNS,
  loadEpisodes,
  pool,
  readRaw,
  runClassifier,
  spendByUse,
  spentUsd,
  writeRaw,
  writeReport,
} from "./shared";

import { createHash } from "node:crypto";

import type {
  ClassifierModel,
  ClassifierSpec,
} from "@/ee/agent-chat/classifier";
import type { StoredEpisode } from "./shared";

import { JUDGE_DIMENSIONS } from "../judge";

type Dimension = (typeof JUDGE_DIMENSIONS)[number];

const MODELS: ClassifierModel[] = ["jev", "gemini"];
const FAILED_SAMPLE = 40;
const PASSED_SAMPLE = 60;
const LOW = 2.5;
const HIGH = 4;

const DIMENSION_INSTRUCTIONS: Record<Dimension, string> = {
  grounding:
    "How well does every fact stated in `answers` match `expected_facts` or the tools in `tools_called`?",
  completeness:
    "How completely do `answers` cover everything `requests` asked for?",
  reasoning:
    "How clearly and correctly do the conclusions in `answers` follow from the evidence?",
  actionability: "How directly could a business user act on `answers`?",
  fabricationFree:
    "How free are `answers` of invented facts or hedged guesses presented as facts?",
};
const LEVELS = ["1: poor", "2: weak", "3: adequate", "4: good", "5: excellent"];

const SPEC: ClassifierSpec = {
  id: "advisory-judge",
  questions: JUDGE_DIMENSIONS.map((dimension) => ({
    id: dimension.toLowerCase(),
    type: "score" as const,
    instruction: DIMENSION_INSTRUCTIONS[dimension],
    levels: LEVELS,
  })),
};

const hash = (value: string) => createHash("sha1").update(value).digest("hex");

function sample(): StoredEpisode[] {
  const seen = new Set<string>();
  const judged = loadEpisodes().filter((episode) => {
    if (seen.has(episode.episodeId)) return false;
    seen.add(episode.episodeId);
    return (
      episode.oracle &&
      episode.judge?.judges.length === 2 &&
      episode.judge.judges.every((j) => j.scores)
    );
  });
  const ordered = judged.sort((a, b) =>
    hash(a.episodeId).localeCompare(hash(b.episodeId)),
  );
  return [
    ...ordered.filter((e) => !e.oracle!.passed).slice(0, FAILED_SAMPLE),
    ...ordered.filter((e) => e.oracle!.passed).slice(0, PASSED_SAMPLE),
  ];
}

function stateOf(episode: StoredEpisode) {
  return {
    requests: [...episode.prompts],
    expected_facts: episode.judgeFacts.length
      ? [...episode.judgeFacts]
      : [
          "(no expected facts supplied; judge on internal consistency and grounding in the tools used)",
        ],
    tools_called: [...new Set(episode.toolNames)].join(", ") || "(none)",
    answers: episode.turnTexts.map((text) => text.trim() || "(empty)"),
  };
}

const mean = (values: readonly number[]) =>
  values.reduce((a, b) => a + b, 0) / values.length;
function pearson(x: readonly number[], y: readonly number[]) {
  const mx = mean(x);
  const my = mean(y);
  let num = 0;
  let dx = 0;
  let dy = 0;
  x.forEach((xi, i) => {
    num += (xi - mx) * (y[i]! - my);
    dx += (xi - mx) ** 2;
    dy += (y[i]! - my) ** 2;
  });
  return dx && dy ? num / Math.sqrt(dx * dy) : null;
}
const r2 = (value: number | null) =>
  value === null ? null : Number(value.toFixed(2));

async function main() {
  const episodes = sample();
  const cacheName = "advisory-judge-scores.json";
  const cache =
    readRaw<Record<string, Record<string, (Record<string, number> | null)[]>>>(
      cacheName,
    ) ?? {};
  for (const model of MODELS) {
    cache[model] ??= {};
    const todo = episodes
      .flatMap((episode) =>
        Array.from({ length: RUNS }, (_, run) => ({ episode, run })),
      )
      .filter(
        ({ episode, run }) =>
          cache[model]![episode.episodeId]?.[run] === undefined,
      );
    await pool(todo, 4, async ({ episode, run }) => {
      const call = await runClassifier(
        `judge:${model}`,
        SPEC,
        stateOf(episode),
        model,
        OFFLINE_TIMEOUT_MS,
      );
      const scores = call.result
        ? Object.fromEntries(
            JUDGE_DIMENSIONS.map((dimension) => {
              const answer = call.result!.answers[dimension.toLowerCase()];
              return [
                dimension,
                answer?.type === "score" ? answer.score + 1 : Number.NaN,
              ];
            }),
          )
        : null;
      cache[model]![episode.episodeId] ??= [];
      cache[model]![episode.episodeId]![run] = scores;
    });
    writeRaw(cacheName, cache);
    console.log(model, "done, spend", spentUsd().toFixed(4));
  }

  const results: Record<string, unknown> = {};
  const flags: unknown[] = [];
  for (const model of MODELS) {
    const perDimension: Record<string, unknown> = {};
    const scored = episodes.filter((e) =>
      (cache[model]![e.episodeId] ?? []).some((s) => s),
    );
    const avg = (e: StoredEpisode, d: Dimension) =>
      mean(
        (cache[model]![e.episodeId] ?? [])
          .filter((s): s is Record<string, number> => !!s)
          .map((s) => s[d]!),
      );
    for (const dimension of JUDGE_DIMENSIONS) {
      const classifier = scored.map((e) => avg(e, dimension));
      const judges = scored.map((e) =>
        mean(e.judge!.judges.map((j) => j.scores[dimension]!)),
      );
      const [first, second] = [0, 1].map((k) =>
        scored.map((e) => e.judge!.judges[k]!.scores[dimension]!),
      );
      perDimension[dimension] = {
        maeVsJudgeMean: r2(
          mean(classifier.map((c, i) => Math.abs(c - judges[i]!))),
        ),
        within1OfJudgeMeanPct: Number(
          (
            (100 *
              classifier.filter((c, i) => Math.abs(c - judges[i]!) <= 1)
                .length) /
            scored.length
          ).toFixed(1),
        ),
        pearsonVsJudgeMean: r2(pearson(classifier, judges)),
        pearsonJudgeVsJudge: r2(pearson(first!, second!)),
      };
    }
    const overall = (e: StoredEpisode) =>
      mean(JUDGE_DIMENSIONS.map((d) => avg(e, d)));
    const judgeOverall = (e: StoredEpisode) =>
      mean(e.judge!.judges.map((j) => j.overall));
    const missedByJudges = scored.filter(
      (e) => overall(e) <= LOW && judgeOverall(e) >= HIGH,
    );
    const reverse = scored.filter(
      (e) => overall(e) >= HIGH && judgeOverall(e) <= LOW,
    );
    for (const e of missedByJudges)
      flags.push({
        model,
        kind: "classifier-low-judges-high",
        episodeId: e.episodeId,
        caseId: e.caseId,
        oraclePassed: e.oracle!.passed,
        classifier: Number(overall(e).toFixed(2)),
        judges: Number(judgeOverall(e).toFixed(2)),
        answer: (e.turnTexts.at(-1) ?? "").slice(0, 800),
      });
    const oracleFailedJudgesHigh = scored.filter(
      (e) => !e.oracle!.passed && judgeOverall(e) >= HIGH,
    );
    results[model] = {
      scoredEpisodes: scored.length,
      perDimension,
      overallPearsonVsJudgeMean: r2(
        pearson(scored.map(overall), scored.map(judgeOverall)),
      ),
      overallPearsonVsOraclePass: r2(
        pearson(
          scored.map(overall),
          scored.map((e) => (e.oracle!.passed ? 1 : 0)),
        ),
      ),
      judgesOverallPearsonVsOraclePass: r2(
        pearson(
          scored.map(judgeOverall),
          scored.map((e) => (e.oracle!.passed ? 1 : 0)),
        ),
      ),
      oracleFailedButJudgesHigh: oracleFailedJudgesHigh.length,
      oracleFailedJudgesHighClassifierLow: oracleFailedJudgesHigh.filter(
        (e) => overall(e) <= LOW,
      ).length,
      classifierLowJudgesHigh: missedByJudges.length,
      classifierLowJudgesHighOracleFailed: missedByJudges.filter(
        (e) => !e.oracle!.passed,
      ).length,
      classifierLowJudgesHighOraclePassed: missedByJudges.filter(
        (e) => e.oracle!.passed,
      ).length,
      classifierHighJudgesLow: reverse.length,
    };
  }
  writeRaw("advisory-judge-flags.json", flags);
  writeReport("advisory-judge.json", {
    rule: `Sample: ${FAILED_SAMPLE} oracle-failed and ${PASSED_SAMPLE} oracle-passed episodes with both judges, ordered by a hash of the episode id. A flag is a classifier overall <= ${LOW} where the two judges average >= ${HIGH}. Keep only if at least one such flag lands on an oracle-failed episode (a real miss by the judges). Scores are the mean of 3 runs on the 1-5 scale.`,
    results,
    spendSoFarUsd: Number(spentUsd().toFixed(4)),
    spendByUse: spendByUse(),
  });
  console.log(JSON.stringify(results, null, 2));
}

await main();
