import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { EpisodeArtifact } from "../../episode";

import { campaignAnalysisDirectory, isEpisodeArtifactFileName } from "../../report";

export const M8_RECHECK = {
  caseId: "M8",
  check: "delete-scoped-to-target",
  control: "off",
  candidate: "docs-v2-jev",
  episodesPerArm: 30,
  blocks: [
    { variant: "off", reps: [1, 10] },
    { variant: "docs-v2-jev", reps: [1, 10] },
    { variant: "off", reps: [11, 20] },
    { variant: "docs-v2-jev", reps: [11, 20] },
    { variant: "off", reps: [21, 30] },
    { variant: "docs-v2-jev", reps: [21, 30] },
  ],
  alpha: 0.05,
  capUsd: 5,
} as const;

export const METHOD = {
  question:
    "Stage 4 of the fair retest failed the docs re-rank v2 track only on the full-suite rule: M8 delete-scoped-to-target passed 3 of 3 in off and 2 of 3 in docs-v2-jev, and the failing turn ran no re-rank call. This recheck decides whether that single discordant check is noise.",
  campaign:
    "One campaign, cap 5 USD, one production build of the clean commit that adds this file, shipped control arm only, rubric judges not run. Server environment for both variants: AGENT_TOOLSET_CLASSIFIER=off, AGENT_GUARD_MODE=wordlists; AGENT_DOCS_RERANK=off in off, AGENT_DOCS_RERANK=jev with AGENT_DOCS_RERANK_VERSION=v2 in docs-v2-jev.",
  design:
    "Case M8 only, k = 30 per arm, alternating blocks as in the ABAB docs latency recheck: off r1-r10, docs-v2-jev r1-r10, off r11-r20, docs-v2-jev r11-r20, off r21-r30, docs-v2-jev r21-r30. Each block is one benchmark process on a freshly restarted server; the M8 driver rejects the delete approval as in every earlier run.",
  outcome:
    "An episode fails when the check delete-scoped-to-target is not passed: it failed, or it is absent because the turn never called delete_records. Absent checks are also counted separately. The whole M8 oracle pass is reported beside it, descriptively.",
  rerankInvolvement:
    "A failing episode involves a docs re-rank when any of its turns records a classifier trace with a docs re-rank of at least one call, or calls search_docs or get_docs_page.",
  statistic:
    "Failure counts per arm with 95% Wilson intervals, compared by the two-sided Fisher exact test on the 2 x 2 table (arms x fail/pass), p as the sum of the probabilities of all tables with the same margins no more likely than the observed one.",
  decision:
    "Noise (the stage-4 M8 failure does not block the docs track) when Fisher p >= 0.05 and no failing episode of either arm involves a docs re-rank. Otherwise the result is a regression attributed to the re-rank, and the docs track does not proceed without the owner. No repetitions are added after seeing results; an episode lost to infrastructure is rerun once and otherwise excluded and counted.",
};

function logFactorial(n: number): number {
  let total = 0;
  for (let i = 2; i <= n; i += 1) total += Math.log(i);
  return total;
}

export function fisherExactTwoSided(a: number, b: number, c: number, d: number): number {
  const row1 = a + b;
  const row2 = c + d;
  const col1 = a + c;
  const n = row1 + row2;
  const logP = (x: number) =>
    logFactorial(row1) + logFactorial(row2) + logFactorial(col1) + logFactorial(n - col1) -
    logFactorial(n) - logFactorial(x) - logFactorial(row1 - x) - logFactorial(col1 - x) - logFactorial(row2 - col1 + x);
  const observed = logP(a);
  let p = 0;
  for (let x = Math.max(0, col1 - row2); x <= Math.min(row1, col1); x += 1) {
    const value = logP(x);
    if (value <= observed + 1e-7) p += Math.exp(value);
  }
  return Math.min(1, p);
}

function wilson(successes: number, n: number): [number, number] | null {
  if (n === 0) return null;
  const z = 1.959964;
  const p = successes / n;
  const denominator = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
  const round = (value: number) => Number((100 * value).toFixed(1));
  return [round(Math.max(0, centre - half)), round(Math.min(1, centre + half))];
}

export type M8Episode = {
  variant: string;
  repetition: number;
  checkPassed: boolean | null;
  oraclePassed: boolean;
  rerankCalls: number;
  docsToolCalls: number;
};

export function m8Episode(artifact: EpisodeArtifact): M8Episode {
  const check = artifact.oracle?.checks.find((entry) => entry.id === M8_RECHECK.check);
  return {
    variant: artifact.runtimeVariant,
    repetition: artifact.repetition,
    checkPassed: check ? check.passed : null,
    oraclePassed: Boolean(artifact.oracle?.passed),
    rerankCalls: artifact.metrics.turns.reduce((sum, turn) => sum + (turn.classifierTrace?.docsRerank?.calls ?? 0), 0),
    docsToolCalls: artifact.observed
      .flatMap((turn) => turn.tools)
      .filter((tool) => tool.name === "search_docs" || tool.name === "get_docs_page").length,
  };
}

export function summariseM8(episodes: readonly M8Episode[]) {
  const arm = (variant: string) => {
    const list = episodes.filter((episode) => episode.variant === variant);
    const failed = list.filter((episode) => episode.checkPassed !== true);
    return {
      episodes: list.length,
      failures: failed.length,
      failureWilson95: wilson(failed.length, list.length),
      checkAbsent: list.filter((episode) => episode.checkPassed === null).length,
      oraclePassed: list.filter((episode) => episode.oraclePassed).length,
      failingEpisodes: failed.map((episode) => ({
        repetition: episode.repetition,
        checkPassed: episode.checkPassed,
        rerankCalls: episode.rerankCalls,
        docsToolCalls: episode.docsToolCalls,
      })),
      failuresInvolvingRerank: failed.filter((episode) => episode.rerankCalls > 0 || episode.docsToolCalls > 0).length,
    };
  };
  const control = arm(M8_RECHECK.control);
  const candidate = arm(M8_RECHECK.candidate);
  const fisherP = Number(
    fisherExactTwoSided(
      candidate.failures,
      candidate.episodes - candidate.failures,
      control.failures,
      control.episodes - control.failures,
    ).toPrecision(3),
  );
  const noise = fisherP >= M8_RECHECK.alpha && control.failuresInvolvingRerank + candidate.failuresInvolvingRerank === 0;
  return { control, candidate, fisherP, verdict: noise ? "noise" : "regression" };
}

function loadArtifacts(campaignId: string): EpisodeArtifact[] {
  const root = resolve(process.cwd(), "scripts/agent-benchmark/.runs", campaignId);
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (isEpisodeArtifactFileName(entry.name)) files.push(full);
    }
  };
  if (existsSync(root)) walk(root);
  return files.map((path) => JSON.parse(readFileSync(path, "utf8")) as EpisodeArtifact);
}

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  const next = index < 0 ? undefined : process.argv[index + 1];
  return next === undefined || next.startsWith("--") ? undefined : next;
}

function main() {
  const campaignId = flag("campaign") ?? "";
  if (!campaignId) throw new Error("--campaign is required");
  const all = loadArtifacts(campaignId).filter(
    (artifact) => artifact.caseId === M8_RECHECK.caseId && artifact.arm === "shipped",
  );
  const usable = all.filter((artifact) => !artifact.skipped && artifact.oracle);
  const lost = all
    .filter((artifact) => artifact.skipped || !artifact.oracle)
    .map((artifact) => `${artifact.runtimeVariant} r${artifact.repetition}: ${artifact.skipped ?? "no oracle"}`);
  const result = { campaignId, method: METHOD, design: M8_RECHECK, lost, ...summariseM8(usable.map(m8Episode)) };
  const json = `${JSON.stringify(result, null, 2)}\n`;
  const cacheDir = campaignAnalysisDirectory(resolve(process.cwd(), "scripts/agent-benchmark/.runs"), campaignId, "m8-recheck");
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(join(cacheDir, "m8-recheck.json"), json);
  const out = flag("out");
  if (out) {
    mkdirSync(resolve(out), { recursive: true });
    writeFileSync(resolve(out, "m8-recheck.json"), json);
  }
  console.log(json);
}

if (process.argv[1]?.endsWith("m8-recheck.ts")) {
  try {
    main();
    process.exit(0);
  } catch (error: unknown) {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exit(1);
  }
}
