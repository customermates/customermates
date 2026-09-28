/**
 * Stage 4 of the fair classifier retest: the pre-registered live A/B, analysed exactly as
 * `classifier-eval/heldout/PREREGISTRATION.md` (with Amendment 1) prescribes. Fixed before any live run.
 *
 *   yarn -s tsx --import ./scripts/lib/register-server-only-shim.mjs \
 *     scripts/agent-benchmark/classifier-eval/heldout-live/analyse.ts --campaign <id> [--judge] [--out <dir>]
 *
 * `--judge` asks the gold-fact judge for every DH episode that has no cached verdict, charging each call to the
 * campaign's ledger under its cap. Without `--out` the analysis is printed and cached under `.runs/<campaign>.analysis` only.
 */
import "../gateway-key";

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { generateText, jsonSchema, Output } from "ai";
import { Pool } from "pg";

import type { EpisodeArtifact } from "../../episode";

import { readAgentProviderCharge } from "@/ee/agent-chat/gateway-cost";
import { splitSections } from "@/features/mcp-tools/docs-retrieval";
import { getDocsPageRaw } from "@/features/mcp-tools/docs.mcp-tools";

import { reserveCharge, settleReservedCharge } from "../../campaign";
import { requireLocalBenchmarkDatabase } from "../../env";
import { BENCHMARK_CASES } from "../../fixtures";
import { HELDOUT_DOCS_CASES, HELDOUT_ROUTING_CASES, isHeldoutCaseId } from "../../heldout-cases";
import { campaignAnalysisDirectory, isEpisodeArtifactFileName } from "../../report";
import { DOCS_HELDOUT } from "../heldout/docs-heldout";
import { holm, mcnemar, round, wilson } from "../heldout-run/common";

const LIVE_VARIANTS = { control: "off", docs: "docs-v2-jev", routing: "routing-v2-jev" } as const;
const LIVE_REPS = { docs: 10, routing: 5, fullSuite: 3 } as const;

const FACT_JUDGE_MODEL = "google/gemini-3-flash";
const FACT_JUDGE_RESERVE_USD = 0.01;
const MICROCENTS_PER_USD = 100_000_000;
const SECTION_CHARS = 6_000;
const BOOTSTRAP_RESAMPLES = 10_000;
const BOOTSTRAP_SEED = 20_260_927;

export const METHOD = {
  design:
    "One build, one campaign, one cohort (the shipped control arm). Variants are server environments restarted between runs: off (AGENT_DOCS_RERANK=off, AGENT_TOOLSET_CLASSIFIER=off), docs-v2-jev (AGENT_DOCS_RERANK=jev, AGENT_DOCS_RERANK_VERSION=v2) and routing-v2-jev (AGENT_TOOLSET_CLASSIFIER=jev, AGENT_TOOLSET_CLASSIFIER_MODE=parallel-v2). Variants cannot interleave per case because the switch is a server variable; each variant runs the same case order with the same worker split. Episodes are paired by case and repetition.",
  docsPass:
    "A DH episode passes when its deterministic oracle passes (runtime checks and the read-only safety checks business-state-unchanged and no-mutating-tool-attempt) and the gold-fact judge answers yes. The judge is the offline stage's fact judge (google/gemini-3-flash on Vertex, thinking low, ZDR, no training, temperature 0); it sees the question, the gold fact, the text of the gold page anchor's section and the assistant's final answer, never the arm. Only yes passes; partial, no and error fail.",
  docsDescriptive:
    "Descriptive only: the share of DH episodes whose docs tool calls named or returned the gold page (slug) and the gold or an alternative anchor.",
  routingPass:
    "An RH episode passes when its deterministic oracle passes: runtime and shared safety checks, and in every user turn at least one tool of each on-demand set the frozen item labels for that turn (perTurn, or toolsets for a single turn). load_toolset alone is not a use.",
  binary:
    "Exact two-sided McNemar on discordant (case, repetition) pairs; pass-rate difference with a 95% case-cluster paired bootstrap (10,000 resamples of cases, percentile); pass^k per arm (share of cases passed in all k repetitions); Wilson 95% intervals per arm. Holm within each track (one candidate arm per track, so Holm p equals p).",
  continuous:
    "Per user turn, paired by (case, repetition, turn); mean paired difference and the relative difference of means with 95% case-cluster bootstrap intervals. Rounds are provider rounds; load_toolset calls are tool calls named load_toolset; prompt bytes are the sum of the trace's promptBytesByRound; credits are the turn's settled chargedCredits (exact USD beside). Latency is each turn's first output (first delta, activity, approval or ui_command frame); p50 and p95 per arm, candidate minus control on the point estimate, with a case-cluster bootstrap interval of the difference.",
  gatesDocs:
    "Docs: (1) DH pass improves with McNemar p < 0.05 over k = 10 (candidate-only pairs exceed control-only pairs); (2) no strict or safety regression on the full suite; (3) credits per turn on DH within +3% of control (relative difference of means, point estimate); (4) first output p95 on DH within +0.5 s. If control passes >= 95% of DH episodes the track is at ceiling and uninformative.",
  gatesRouting:
    "Routing: (1) RH pass non-inferior: lower bound of the 95% bootstrap interval of the difference above -5 points; (2) rounds per turn or load_toolset calls per turn fall: upper bound of the 95% interval below 0; (3) prompt bytes per turn and credits per turn fall or stay within +3% (relative difference of means, point estimate); (4) first output p50 on RH within +0.2 s; (5) no regression on the full suite.",
  fullSuite:
    "Full suite = the 72 registry cases that are not held-out, k = 3. A regression is any gate-relevant check (every check of a strict case, runtime and safety checks elsewhere) that control passes in all 3 repetitions and the candidate fails in any. The full suite runs for off and for each variant that looks like a candidate on its track: docs when the DH pass difference is >= 0 points, routing when the lower bound of the RH pass-difference interval is above -5 points.",
  execution:
    "Each case list runs as three concurrent benchmark processes against the one server, cases split by their index modulo 3 in registry order, repetitions outermost; the split and concurrency are identical for every variant. Order: off (DH k = 10, RH k = 5, full suite k = 3), then docs-v2-jev (DH, then the full suite if a candidate), then routing-v2-jev (RH, then the full suite if a candidate); the server is stopped between variants and before the rubric judges. Campaign cap 35 USD covers episodes, the gold-fact judge and the rubric judges.",
  lostRuns:
    "An episode lost to infrastructure (errored, skipped, missing) is rerun for both arms; any pair still incomplete is excluded and counted in the output.",
};

type Verdict = "yes" | "partial" | "no" | "error";
type Artifact = EpisodeArtifact & { __path: string };

type StoredClassifierTrace = {
  auxiliaryCostMicrocents?: number;
  docsRerank?: { calls: number; answered: number } | null;
  toolsetPreload?: { added: string[]; removed?: string[] } | null;
  promptBytesByRound?: number[];
};

const storedTrace = (turn: { classifierTrace?: unknown } | undefined) =>
  (turn?.classifierTrace ?? null) as StoredClassifierTrace | null;

function flag(name: string): string | boolean | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const next = process.argv[index + 1];
  return next === undefined || next.startsWith("--") ? true : next;
}

function prng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function bootstrap<T>(clusters: readonly (readonly T[])[], statistic: (units: readonly T[]) => number | null) {
  const point = statistic(clusters.flat());
  const random = prng(BOOTSTRAP_SEED);
  const draws: number[] = [];
  for (let i = 0; i < BOOTSTRAP_RESAMPLES; i += 1) {
    const picked: T[] = [];
    for (let j = 0; j < clusters.length; j += 1) picked.push(...clusters[Math.floor(random() * clusters.length)]!);
    const value = statistic(picked);
    if (value !== null && Number.isFinite(value)) draws.push(value);
  }
  draws.sort((a, b) => a - b);
  const at = (q: number) => (draws.length ? draws[Math.min(draws.length - 1, Math.floor(q * draws.length))]! : null);
  return { point, ci95: [at(0.025), at(0.975)] as [number | null, number | null] };
}

function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]!;
}

const mean = (values: readonly number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

function loadArtifacts(campaignId: string): Artifact[] {
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
  return files.map((path) => ({ ...(JSON.parse(readFileSync(path, "utf8")) as EpisodeArtifact), __path: path }));
}

const episodeKey = (a: { caseId: string; repetition: number }) => `${a.caseId}#${a.repetition}`;
const finalText = (a: Artifact) => a.observed.at(-1)?.text ?? "";
const usable = (a: Artifact | undefined): a is Artifact => Boolean(a && !a.skipped && a.oracle);

// --- gold-fact judge -------------------------------------------------------------------------------------------

const sectionText = new Map<string, string>();
function goldSection(itemId: string): string {
  const item = DOCS_HELDOUT.find((entry) => entry.id === itemId)!;
  const [slug, anchor] = item.anchors[0]!.split("#") as [string, string];
  const key = `${item.docsLocale}:${slug}#${anchor}`;
  if (!sectionText.has(key)) {
    const page = getDocsPageRaw(slug, item.docsLocale, "docs");
    const section = page
      ? splitSections({ slug, source: "docs", pageTitle: page.title, markdown: page.markdown }).find(
          (candidate) => candidate.anchor === anchor,
        )
      : undefined;
    if (!section) throw new Error(`Gold section ${key} not found`);
    sectionText.set(key, `## ${section.headingPath.join(" > ")}\n${section.text}`.slice(0, SECTION_CHARS));
  }
  return sectionText.get(key)!;
}

const FACT_JUDGE_SYSTEM =
  "You grade answers of the Customermates CRM assistant to documentation questions. You get the user question, a reference answer, the documentation section the reference answer comes from, and the assistant's final answer, which may be in another language. Answer `yes` if the assistant's answer states the reference answer or everything needed to derive it, and does not contradict the reference answer or the section. Answer `partial` if it is on the right topic but misses part of the reference answer. Answer `no` otherwise. Do not use outside knowledge.";

async function askFactJudge(
  pool: Pool,
  artifact: Artifact,
  question: string,
  fact: string,
  section: string,
): Promise<Verdict> {
  const reservation = await reserveCharge(pool, artifact.campaignId, artifact.episodeId, "judge", FACT_JUDGE_RESERVE_USD, {
    model: FACT_JUDGE_MODEL,
    use: "heldout-gold-fact",
  });
  if (!reservation) throw new Error("campaign cap cannot admit another gold-fact judge call");
  try {
    const result = await generateText({
      model: FACT_JUDGE_MODEL,
      system: FACT_JUDGE_SYSTEM,
      prompt: `QUESTION: ${question}\n\nREFERENCE ANSWER: ${fact}\n\nDOCUMENTATION SECTION:\n${section}\n\nASSISTANT ANSWER:\n${finalText(artifact).trim() || "(empty)"}`,
      output: Output.object({
        schema: jsonSchema<{ verdict: "yes" | "partial" | "no" }>({
          type: "object",
          properties: { verdict: { type: "string", enum: ["yes", "partial", "no"] } },
          required: ["verdict"],
          additionalProperties: false,
        }),
      }),
      temperature: 0,
      maxRetries: 2,
      providerOptions: {
        gateway: { only: ["vertex"], zeroDataRetention: true, disallowPromptTraining: true },
        vertex: { thinkingConfig: { thinkingLevel: "low" } },
      },
    });
    const charge = readAgentProviderCharge(result.providerMetadata, "vertex");
    await settleReservedCharge(
      pool,
      reservation,
      charge.outcome === "measured" ? charge.charge.costMicrocents / MICROCENTS_PER_USD : FACT_JUDGE_RESERVE_USD,
      { model: FACT_JUDGE_MODEL, use: "heldout-gold-fact", measured: charge.outcome === "measured" },
    );
    return result.output.verdict;
  } catch (error) {
    console.log(`gold-fact judge error ${artifact.runtimeVariant} ${artifact.caseId} r${artifact.repetition}: ${String(error).slice(0, 160)}`);
    return "error";
  }
}

async function judgeDocs(artifacts: readonly Artifact[], cachePath: string, ask: boolean) {
  const cache = existsSync(cachePath) ? (JSON.parse(readFileSync(cachePath, "utf8")) as Record<string, Verdict>) : {};
  const docs = artifacts.filter((a) => HELDOUT_DOCS_CASES.some((c) => c.id === a.caseId) && usable(a));
  const key = (a: Artifact) => `${a.runtimeVariant}/${a.caseId}/r${a.repetition}/${a.episodeId}`;
  const pending = docs.filter((a) => !cache[key(a)] || cache[key(a)] === "error");
  if (ask && pending.length) {
    const pool = new Pool({ connectionString: requireLocalBenchmarkDatabase(), max: 4 });
    try {
      let cursor = 0;
      const worker = async () => {
        while (cursor < pending.length) {
          const artifact = pending[cursor++]!;
          const spec = HELDOUT_DOCS_CASES.find((c) => c.id === artifact.caseId)!.spec;
          cache[key(artifact)] = await askFactJudge(pool, artifact, spec.prompt, spec.goldFact, goldSection(spec.itemId));
          if (cursor % 25 === 0) writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
        }
      };
      await Promise.all(Array.from({ length: 6 }, worker));
    } finally {
      writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
      await pool.end();
    }
  }
  writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
  return (a: Artifact): Verdict | null => cache[key(a)] ?? null;
}

// --- per-episode measures --------------------------------------------------------------------------------------

type TurnMeasure = {
  rounds: number;
  loadToolset: number;
  promptBytes: number | null;
  credits: number;
  usd: number;
  firstOutputMs: number | null;
};

function turnMeasures(a: Artifact): TurnMeasure[] {
  return a.turns.map((turn, index) => {
    const metric = a.metrics.turns[index];
    const rounds = metric ? a.metrics.rounds.filter((round) => round.turnRequestId === metric.id) : [];
    const usage = metric ? a.usage.filter((entry) => entry.turnRequestId === metric.id) : [];
    const bytes = storedTrace(metric)?.promptBytesByRound;
    return {
      rounds: rounds.length,
      loadToolset: (a.observed[index]?.tools ?? []).filter((tool) => tool.name === "load_toolset").length,
      promptBytes: bytes && bytes.length ? bytes.reduce((x, y) => x + y, 0) : null,
      credits: usage.reduce((total, entry) => total + entry.chargedCredits, 0),
      usd: usage.reduce((total, entry) => total + Number(entry.costMicrocents), 0) / MICROCENTS_PER_USD,
      firstOutputMs: turn.timing.firstOutputMs ?? turn.timing.firstDeltaMs ?? null,
    };
  });
}

function docsRetrieval(a: Artifact) {
  const spec = HELDOUT_DOCS_CASES.find((c) => c.id === a.caseId)!.spec;
  const item = DOCS_HELDOUT.find((entry) => entry.id === spec.itemId)!;
  const accepted = [...item.anchors, ...item.alternatives];
  const slugs = new Set([item.slug, ...accepted.map((anchor) => anchor.split("#")[0]!)]);
  let page = false;
  let anchor = false;
  a.observed.forEach((turn, t) =>
    turn.tools.forEach((tool, i) => {
      if (!["search_docs", "get_docs_page"].includes(tool.name)) return;
      const input = JSON.stringify(tool.input ?? {});
      const output = a.toolOutputs?.[t]?.[i]?.text ?? "";
      if ([...slugs].some((slug) => input.includes(`"${slug}"`) || output.includes(`docs/${slug}`) || output.includes(`:${slug}#`)))
        page = true;
      if (accepted.some((ref) => output.includes(ref) || output.includes(`#${ref.split("#")[1]}`))) anchor = true;
    }),
  );
  return { page, anchor };
}

// --- comparisons -----------------------------------------------------------------------------------------------

type Pair = { caseId: string; repetition: number; control: Artifact; candidate: Artifact };

function pairUp(control: readonly Artifact[], candidate: readonly Artifact[], caseIds: readonly string[], reps: number) {
  const c = new Map(control.map((a) => [episodeKey(a), a]));
  const d = new Map(candidate.map((a) => [episodeKey(a), a]));
  const pairs: Pair[] = [];
  const incomplete: string[] = [];
  for (const caseId of caseIds)
    for (let repetition = 1; repetition <= reps; repetition += 1) {
      const key = `${caseId}#${repetition}`;
      const x = c.get(key);
      const y = d.get(key);
      if (usable(x) && usable(y)) pairs.push({ caseId, repetition, control: x, candidate: y });
      else incomplete.push(`${key} control=${x ? (x.skipped ? "skipped" : "ok") : "missing"} candidate=${y ? (y.skipped ? "skipped" : "ok") : "missing"}`);
    }
  return { pairs, incomplete };
}

function binaryComparison(pairs: readonly Pair[], passed: (a: Artifact) => boolean, reps: number) {
  const outcomes = pairs.map((pair) => ({ caseId: pair.caseId, control: passed(pair.control), candidate: passed(pair.candidate) }));
  const byCase = Object.values(
    outcomes.reduce<Record<string, typeof outcomes>>((acc, o) => ((acc[o.caseId] ??= []).push(o), acc), {}),
  );
  const rate = (side: "control" | "candidate") => {
    const n = outcomes.filter((o) => o[side]).length;
    return { passed: n, of: outcomes.length, pct: round((100 * n) / Math.max(1, outcomes.length)), wilson95: wilson(n, outcomes.length) };
  };
  const passK = (side: "control" | "candidate") => {
    const full = byCase.filter((list) => list.length === reps);
    return { cases: full.length, allPassed: full.filter((list) => list.every((o) => o[side])).length, pct: round((100 * full.filter((list) => list.every((o) => o[side])).length) / Math.max(1, full.length)) };
  };
  const diff = bootstrap(byCase, (units) => (units.length ? (100 * units.reduce((t, o) => t + Number(o.candidate) - Number(o.control), 0)) / units.length : null));
  const test = mcnemar(outcomes);
  return {
    pairs: outcomes.length,
    control: rate("control"),
    candidate: rate("candidate"),
    passK: { k: reps, control: passK("control"), candidate: passK("candidate") },
    diffPts: { point: round(diff.point, 2), ci95: diff.ci95.map((v) => round(v, 2)) },
    mcnemar: test,
    holmP: holm({ candidate: test.exactP }).candidate,
    perCase: Object.fromEntries(byCase.map((list) => [list[0]!.caseId, { control: list.filter((o) => o.control).length, candidate: list.filter((o) => o.candidate).length, reps: list.length }])),
  };
}

type TurnPair = { caseId: string; control: TurnMeasure; candidate: TurnMeasure };

function turnPairs(pairs: readonly Pair[]): TurnPair[] {
  return pairs.flatMap((pair) => {
    const x = turnMeasures(pair.control);
    const y = turnMeasures(pair.candidate);
    return x.map((control, index) => ({ caseId: pair.caseId, control, candidate: y[index]! })).filter((t) => t.candidate);
  });
}

function clustersOf<T extends { caseId: string }>(units: readonly T[]): T[][] {
  return Object.values(units.reduce<Record<string, T[]>>((acc, u) => ((acc[u.caseId] ??= []).push(u), acc), {}));
}

function continuous(turns: readonly TurnPair[], field: keyof Omit<TurnMeasure, "firstOutputMs">) {
  const units = turns.filter((t) => t.control[field] !== null && t.candidate[field] !== null);
  if (!units.length) return { turns: 0, note: "not recorded" };
  const clusters = clustersOf(units);
  const val = (t: TurnPair, side: "control" | "candidate") => t[side][field] as number;
  const diff = bootstrap(clusters, (u) => mean(u.map((t) => val(t, "candidate") - val(t, "control"))));
  const rel = bootstrap(clusters, (u) => {
    const c = mean(u.map((t) => val(t, "control")));
    const d = mean(u.map((t) => val(t, "candidate")));
    return c ? (100 * (d! - c)) / c : null;
  });
  return {
    turns: units.length,
    controlMean: round(mean(units.map((t) => val(t, "control"))), 4),
    candidateMean: round(mean(units.map((t) => val(t, "candidate"))), 4),
    meanDiff: { point: round(diff.point, 4), ci95: diff.ci95.map((v) => round(v, 4)) },
    relativePct: { point: round(rel.point, 2), ci95: rel.ci95.map((v) => round(v, 2)) },
  };
}

function latency(turns: readonly TurnPair[], p: number) {
  const units = turns.filter((t) => t.control.firstOutputMs !== null && t.candidate.firstOutputMs !== null);
  const clusters = clustersOf(units);
  const pc = (u: readonly TurnPair[], side: "control" | "candidate") => percentile(u.map((t) => t[side].firstOutputMs!), p);
  const diff = bootstrap(clusters, (u) => {
    const c = pc(u, "control");
    const d = pc(u, "candidate");
    return c === null || d === null ? null : (d - c) / 1000;
  });
  return {
    turns: units.length,
    controlS: round((pc(units, "control") ?? 0) / 1000, 3),
    candidateS: round((pc(units, "candidate") ?? 0) / 1000, 3),
    diffS: { point: round(diff.point, 3), ci95: diff.ci95.map((v) => round(v, 3)) },
  };
}

function fullSuiteRegression(control: readonly Artifact[], candidate: readonly Artifact[]) {
  const suite = BENCHMARK_CASES.filter((definition) => definition.heldout !== true).map((definition) => definition.id);
  const regressions: { caseId: string; check: string; controlPassed: string; candidateFailedIn: number[] }[] = [];
  const missing: string[] = [];
  const outcomes: { caseId: string; control: boolean; candidate: boolean }[] = [];
  for (const caseId of suite) {
    const c = control.filter((a) => a.caseId === caseId && a.repetition <= LIVE_REPS.fullSuite);
    const d = candidate.filter((a) => a.caseId === caseId && a.repetition <= LIVE_REPS.fullSuite);
    if (c.length < LIVE_REPS.fullSuite || d.length < LIVE_REPS.fullSuite || ![...c, ...d].every(usable)) {
      missing.push(`${caseId} control=${c.filter(usable).length} candidate=${d.filter(usable).length}`);
    }
    for (let rep = 1; rep <= LIVE_REPS.fullSuite; rep += 1) {
      const x = c.find((a) => a.repetition === rep);
      const y = d.find((a) => a.repetition === rep);
      if (usable(x) && usable(y)) outcomes.push({ caseId, control: x.oracle!.passed, candidate: y.oracle!.passed });
    }
    const relevant = (a: Artifact) =>
      (a.oracle?.checks ?? []).filter((check) => a.mergeRequired || check.gate === "runtime" || check.gate === "safety");
    const ids = new Set(c.flatMap((a) => relevant(a).map((check) => check.id)));
    for (const id of ids) {
      const controlAll = c.length === LIVE_REPS.fullSuite && c.every((a) => relevant(a).some((check) => check.id === id && check.passed));
      if (!controlAll) continue;
      const failedIn = d
        .filter((a) => !usable(a) || relevant(a).some((check) => check.id === id && !check.passed))
        .map((a) => a.repetition);
      if (failedIn.length) regressions.push({ caseId, check: id, controlPassed: `${c.length}/${c.length}`, candidateFailedIn: failedIn });
    }
  }
  const test = mcnemar(outcomes);
  return {
    cases: suite.length,
    regressions,
    incomplete: missing,
    passRate: {
      pairs: outcomes.length,
      control: round((100 * outcomes.filter((o) => o.control).length) / Math.max(1, outcomes.length)),
      candidate: round((100 * outcomes.filter((o) => o.candidate).length) / Math.max(1, outcomes.length)),
      mcnemar: test,
    },
  };
}

function classifierUse(artifacts: readonly Artifact[]) {
  const turns = artifacts.flatMap((a) => a.metrics.turns.map(storedTrace));
  return {
    turns: turns.length,
    docsRerankCallsPerTurn: round(turns.reduce((t, x) => t + (x?.docsRerank?.calls ?? 0), 0) / Math.max(1, turns.length), 3),
    docsRerankAnsweredPerTurn: round(turns.reduce((t, x) => t + (x?.docsRerank?.answered ?? 0), 0) / Math.max(1, turns.length), 3),
    toolsetClassifierTurns: turns.filter((x) => x?.toolsetPreload).length,
    toolsetAddedTurns: turns.filter((x) => (x?.toolsetPreload?.added.length ?? 0) > 0).length,
    toolsetRemovedTurns: turns.filter((x) => (x?.toolsetPreload?.removed?.length ?? 0) > 0).length,
    auxiliaryUsd: round(turns.reduce((t, x) => t + (x?.auxiliaryCostMicrocents ?? 0), 0) / MICROCENTS_PER_USD, 4),
    promptBytesRecordedTurns: turns.filter((x) => (x?.promptBytesByRound?.length ?? 0) > 0).length,
  };
}

async function main() {
  const campaignId = String(flag("campaign") ?? "");
  if (!campaignId) throw new Error("--campaign is required");
  const all = loadArtifacts(campaignId);
  const byVariant = (variant: string) => all.filter((a) => a.runtimeVariant === variant && a.arm === "shipped");
  const control = byVariant(LIVE_VARIANTS.control);
  const docsArm = byVariant(LIVE_VARIANTS.docs);
  const routingArm = byVariant(LIVE_VARIANTS.routing);
  const cacheDir = campaignAnalysisDirectory(resolve(process.cwd(), "scripts/agent-benchmark/.runs"), campaignId, "heldout-live");
  mkdirSync(cacheDir, { recursive: true });
  const verdictOf = await judgeDocs([...control, ...docsArm], join(cacheDir, "docs-fact-verdicts.json"), flag("judge") === true);

  const dhIds = HELDOUT_DOCS_CASES.map((c) => c.id);
  const rhIds = HELDOUT_ROUTING_CASES.map((c) => c.id);
  const isDh = (a: Artifact) => dhIds.includes(a.caseId as never);
  const isRh = (a: Artifact) => rhIds.includes(a.caseId as never);
  const docsPassed = (a: Artifact) => Boolean(a.oracle?.passed) && verdictOf(a) === "yes";

  const docsPairs = pairUp(control.filter(isDh), docsArm.filter(isDh), dhIds, LIVE_REPS.docs);
  const routingPairs = pairUp(control.filter(isRh), routingArm.filter(isRh), rhIds, LIVE_REPS.routing);
  const verdictCounts = (arm: readonly Artifact[]) =>
    arm.filter(isDh).reduce<Record<string, number>>((acc, a) => ((acc[verdictOf(a) ?? "unjudged"] = (acc[verdictOf(a) ?? "unjudged"] ?? 0) + 1), acc), {});
  const retrieval = (arm: readonly Artifact[]) => {
    const rows = arm.filter(isDh).filter(usable).map(docsRetrieval);
    return { episodes: rows.length, goldPagePct: round((100 * rows.filter((r) => r.page).length) / Math.max(1, rows.length)), goldAnchorPct: round((100 * rows.filter((r) => r.anchor).length) / Math.max(1, rows.length)) };
  };

  const docsBinary = binaryComparison(docsPairs.pairs, docsPassed, LIVE_REPS.docs);
  const docsTurns = turnPairs(docsPairs.pairs);
  const routingBinary = binaryComparison(routingPairs.pairs, (a) => Boolean(a.oracle?.passed), LIVE_REPS.routing);
  const routingTurns = turnPairs(routingPairs.pairs);
  const docsFull = docsArm.some((a) => !isHeldoutCaseId(a.caseId)) ? fullSuiteRegression(control.filter((a) => !isHeldoutCaseId(a.caseId)), docsArm.filter((a) => !isHeldoutCaseId(a.caseId))) : null;
  const routingFull = routingArm.some((a) => !isHeldoutCaseId(a.caseId)) ? fullSuiteRegression(control.filter((a) => !isHeldoutCaseId(a.caseId)), routingArm.filter((a) => !isHeldoutCaseId(a.caseId))) : null;

  const docsCredits = continuous(docsTurns, "credits");
  const docsP95 = latency(docsTurns, 95);
  const routingRounds = continuous(routingTurns, "rounds");
  const routingLoads = continuous(routingTurns, "loadToolset");
  const routingBytes = continuous(routingTurns, "promptBytes");
  const routingCredits = continuous(routingTurns, "credits");
  const routingP50 = latency(routingTurns, 50);
  const upper = (x: { meanDiff?: { ci95: (number | null)[] } }) => x.meanDiff?.ci95[1] ?? null;
  const relPoint = (x: { relativePct?: { point: number | null } }) => x.relativePct?.point ?? null;

  const docsAtCeiling = docsBinary.control.passed >= 0.95 * docsBinary.control.of && docsBinary.control.of > 0;
  const docsGate = {
    atCeiling: docsAtCeiling,
    passImproves: docsBinary.mcnemar.candidateOnly > docsBinary.mcnemar.controlOnly && docsBinary.holmP < 0.05,
    noFullSuiteRegression: docsFull ? docsFull.regressions.length === 0 && docsFull.incomplete.length === 0 : null,
    creditsWithin3Pct: relPoint(docsCredits) === null ? null : relPoint(docsCredits)! <= 3,
    firstOutputP95Within05s: docsP95.diffS.point === null ? null : docsP95.diffS.point <= 0.5,
  };
  const routingGate = {
    passNonInferior: routingBinary.diffPts.ci95[0] === null ? null : routingBinary.diffPts.ci95[0]! > -5,
    roundsOrLoadsFall: [upper(routingRounds), upper(routingLoads)].some((u) => u !== null && u < 0),
    promptBytesWithin3Pct: relPoint(routingBytes) === null ? null : relPoint(routingBytes)! <= 3,
    creditsWithin3Pct: relPoint(routingCredits) === null ? null : relPoint(routingCredits)! <= 3,
    firstOutputP50Within02s: routingP50.diffS.point === null ? null : routingP50.diffS.point <= 0.2,
    noFullSuiteRegression: routingFull ? routingFull.regressions.length === 0 && routingFull.incomplete.length === 0 : null,
  };
  const verdict = (gate: Record<string, boolean | null>, skip: string[] = []) => {
    const values = Object.entries(gate).filter(([k]) => !skip.includes(k)).map(([, v]) => v);
    return values.some((v) => v === false) ? "fail" : values.some((v) => v === null) ? "incomplete" : "pass";
  };

  const result = {
    campaignId,
    method: METHOD,
    episodes: Object.fromEntries(Object.entries({ control, docsArm, routingArm }).map(([k, v]) => [k, v.length])),
    classifierUse: {
      off: classifierUse(control),
      "docs-v2-jev": classifierUse(docsArm),
      "routing-v2-jev": classifierUse(routingArm),
    },
    docs: {
      incompletePairs: docsPairs.incomplete,
      factVerdicts: { off: verdictCounts(control), "docs-v2-jev": verdictCounts(docsArm) },
      retrieval: { off: retrieval(control), "docs-v2-jev": retrieval(docsArm) },
      pass: docsBinary,
      oracleOnlyPass: binaryComparison(docsPairs.pairs, (a) => Boolean(a.oracle?.passed), LIVE_REPS.docs).mcnemar,
      creditsPerTurn: docsCredits,
      usdPerTurn: continuous(docsTurns, "usd"),
      roundsPerTurn: continuous(docsTurns, "rounds"),
      firstOutputP95: docsP95,
      firstOutputP50: latency(docsTurns, 50),
      fullSuite: docsFull,
      gate: docsGate,
      verdict: docsAtCeiling ? "at ceiling (uninformative)" : verdict(docsGate, ["atCeiling"]),
    },
    routing: {
      incompletePairs: routingPairs.incomplete,
      pass: routingBinary,
      roundsPerTurn: routingRounds,
      loadToolsetPerTurn: routingLoads,
      promptBytesPerTurn: routingBytes,
      creditsPerTurn: routingCredits,
      usdPerTurn: continuous(routingTurns, "usd"),
      firstOutputP50: routingP50,
      firstOutputP95: latency(routingTurns, 95),
      fullSuite: routingFull,
      gate: routingGate,
      verdict: verdict(routingGate),
    },
  };
  const json = `${JSON.stringify(result, null, 2)}\n`;
  writeFileSync(join(cacheDir, "heldout-live.json"), json);
  const out = flag("out");
  if (typeof out === "string") {
    mkdirSync(resolve(out), { recursive: true });
    writeFileSync(resolve(out, "heldout-live.json"), json);
    writeFileSync(resolve(out, "docs-fact-verdicts.json"), readFileSync(join(cacheDir, "docs-fact-verdicts.json"), "utf8"));
  }
  console.log(json);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : error);
    process.exit(1);
  });
