import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { EpisodeArtifact } from "../../episode";
import type { DocsHeldoutItem } from "../heldout/docs-heldout";

import { splitSections } from "@/features/mcp-tools/docs-retrieval";
import { getDocsPageRaw } from "@/features/mcp-tools/docs.mcp-tools";

import { BENCHMARK_CASES } from "../../fixtures";
import { HELDOUT_DOCS_CASES } from "../../heldout-cases";
import { campaignAnalysisDirectory, isEpisodeArtifactFileName } from "../../report";
import { DOCS_EMBEDDING_HELDOUT } from "../heldout/docs-embedding-heldout";
import { DOCS_HELDOUT } from "../heldout/docs-heldout";
import { mcnemar, round, wilson } from "../heldout-run/common";
import { fisherExactTwoSided } from "./m8-recheck";

export const LIVE = {
  control: "keyword",
  candidate: "hybrid",
  reps: 10,
  repsPerBlock: 2,
  recheck: { control: "keyword-recheck", candidate: "hybrid-recheck", reps: 10, repsPerBlock: 5 },
  capUsd: 25,
  alpha: 0.05,
  creditsMaxPct: 3,
  firstOutputP95MaxDiffS: 1.0,
  ceilingPct: 95,
} as const;

export const DOCS_BLOCKS = Array.from({ length: (2 * LIVE.reps) / LIVE.repsPerBlock }, (_, index) => {
  const pair = Math.floor(index / 2);
  return {
    block: index + 1,
    variant: index % 2 === 0 ? LIVE.control : LIVE.candidate,
    reps: [pair * LIVE.repsPerBlock + 1, (pair + 1) * LIVE.repsPerBlock] as const,
  };
});

const FACT_JUDGE_MODEL = "google/gemini-3-flash";
const FACT_JUDGE_RESERVE_USD = 0.01;
const MICROCENTS_PER_USD = 100_000_000;
const SECTION_CHARS = 6_000;
const BOOTSTRAP_RESAMPLES = 10_000;
const BOOTSTRAP_SEED = 20_260_928;

export const METHOD = {
  campaign:
    "One campaign, cap 25 USD, one production build of the clean commit that adds this file, shipped control arm only. Server environment for every variant: AGENT_DOCS_RERANK=jev; keyword variants AGENT_DOCS_CANDIDATES=keyword; hybrid variants AGENT_DOCS_CANDIDATES=hybrid and AGENT_DOCS_EMBEDDING_MODEL=google-multilingual (google/text-multilingual-embedding-002 on vertex, ZDR, no training, 1,200 ms query deadline), with the section embeddings built by yarn docs:embeddings google-multilingual before the first server start. Rubric judges are not run.",
  docsDesign:
    "Cases DE01 to DE30 and DH01 to DH30, k = 10 per arm in ten ABAB blocks (five per arm) of two repetitions of all 60 cases: keyword r1-2, hybrid r1-2, keyword r3-4, hybrid r3-4, ... hybrid r9-10. Each block runs on a freshly restarted server as three concurrent benchmark processes, cases split by their index modulo 3. Episodes pair by case and repetition (600 pairs).",
  docsPass:
    "An episode passes when its deterministic oracle passes (runtime and the read-only safety checks) and the stage-4 gold-fact judge (google/gemini-3-flash on vertex, thinking low, ZDR, no training, temperature 0, unchanged prompt) answers yes given the question, the gold fact, the gold anchor's section text (first anchor, cut at 6,000 characters) and the final answer; partial, no and error fail. The judge never sees the arm.",
  binary:
    "Exact two-sided McNemar on the discordant (case, repetition) pairs; pass rates with 95% Wilson intervals; the pass-rate difference with a 95% case-cluster paired bootstrap (10,000 resamples of cases, percentile); pass^10 per arm, the share of the 60 cases passed in all 10 repetitions. The same is reported per family (DE, DH) and per prompt language, descriptively.",
  continuous:
    "Per turn, paired by case and repetition: credits (settled chargedCredits), USD and auxiliary USD (classifier trace) per turn, mean paired difference and relative difference of means with case-cluster bootstrap intervals. First output (first delta, activity, approval or ui_command frame) p50 and p95 per arm and their difference with a case-cluster bootstrap interval.",
  search:
    "Descriptive: every ranked search_docs call's wall time from the classifier trace (docsSearch.latencyMs), p50 and p95 per arm over all calls, with a case-cluster bootstrap interval of the p95 difference; the embedding fallback rate of the hybrid arm, the share of its search_docs calls that did not use hybrid candidates (failure, timeout, missing key or unready index); query embedding calls, answers and cost from docsEmbedding; gold page and gold anchor retrieval shares.",
  fullSuite:
    "Every non-held-out registry case once per arm (k = 1), keyword then hybrid, each on a freshly restarted server, after the docs blocks. Relevant checks are every check of a strict (mergeRequired) case and the runtime and safety checks of the others. A candidate regression is a relevant check the keyword episode passes and the hybrid episode fails (or a hybrid episode lost). Each flagged case is rechecked at k = 10 per arm as variants keyword-recheck and hybrid-recheck in blocks of 5 (keyword r1-5, hybrid r1-5, keyword r6-10, hybrid r6-10), each on a freshly restarted server. A recheck episode fails when any flagged check of that case is not passed (failed or absent). The flag is noise when the two-sided Fisher exact p on the failure counts is >= 0.05 and no failing hybrid episode (recheck or the k = 1 one) called search_docs; otherwise it is a regression.",
  gate:
    "Every item must pass: (1) hybrid pass rate above keyword with McNemar p < 0.05 on the 600 pairs; (2) pass^10 of hybrid not below keyword; (3) no full-suite regression; (4) credits per turn of hybrid within +3% of keyword (relative difference of means, point estimate); (5) first-output p95 of hybrid minus keyword at most +1.0 s (point estimate). If keyword passes >= 95% of its 600 episodes the comparison is at the ceiling and the gate fails. Latency is otherwise reported, not gated (owner waiver).",
  lostRuns:
    "An episode lost to infrastructure (skipped, errored, no oracle) makes its pair incomplete; a lost block is rerun in full for both arms of its block pair, and any pair still incomplete is excluded and listed.",
};

type Verdict = "yes" | "partial" | "no" | "error";
type Artifact = EpisodeArtifact & { __path: string };

type StoredTrace = {
  auxiliaryCostMicrocents?: number;
  docsRerank?: { calls: number; answered: number } | null;
  docsEmbedding?: { calls: number; answered: number; costMicrocents: number };
  docsSearch?: { calls: number; hybrid: number; latencyMs: number[] };
};

const traceOf = (turn: { classifierTrace?: unknown } | undefined) => (turn?.classifierTrace ?? null) as StoredTrace | null;

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

export function percentile(values: readonly number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]!;
}

const mean = (values: readonly number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);

function clustersOf<T extends { caseId: string }>(units: readonly T[]): T[][] {
  return Object.values(units.reduce<Record<string, T[]>>((acc, u) => ((acc[u.caseId] ??= []).push(u), acc), {}));
}

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

const usable = (a: Artifact | undefined): a is Artifact => Boolean(a && !a.skipped && a.oracle);
const finalText = (a: Artifact) => a.observed.at(-1)?.text ?? "";
const DOCS_CASE_IDS = HELDOUT_DOCS_CASES.map((c) => c.id as string);
const DOCS_EMBEDDING_CASE_IDS = new Set(HELDOUT_DOCS_CASES.filter((c) => DOCS_EMBEDDING_HELDOUT.some((item) => item.id === c.spec.itemId)).map((c) => c.id as string));
const specOf = (caseId: string) => HELDOUT_DOCS_CASES.find((c) => c.id === caseId)!.spec;
const ITEMS: readonly DocsHeldoutItem[] = [...DOCS_HELDOUT, ...DOCS_EMBEDDING_HELDOUT];
const itemOf = (itemId: string) => ITEMS.find((item) => item.id === itemId)!;

const sectionText = new Map<string, string>();
function goldSection(itemId: string): string {
  const item = itemOf(itemId);
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

const verdictKey = (a: Artifact) => `${a.runtimeVariant}/${a.caseId}/r${a.repetition}/${a.episodeId}`;

async function judgeDocs(artifacts: readonly Artifact[], cachePath: string, ask: boolean) {
  const cache = existsSync(cachePath) ? (JSON.parse(readFileSync(cachePath, "utf8")) as Record<string, Verdict>) : {};
  const pending = artifacts.filter((a) => usable(a) && (!cache[verdictKey(a)] || cache[verdictKey(a)] === "error"));
  if (ask && pending.length) {
    await import("../gateway-key");
    const { generateText, jsonSchema, Output } = await import("ai");
    const { Pool } = await import("pg");
    const { readAgentProviderCharge } = await import("@/ee/agent-chat/gateway-cost");
    const { reserveCharge, settleReservedCharge } = await import("../../campaign");
    const { requireLocalBenchmarkDatabase } = await import("../../env");
    const pool = new Pool({ connectionString: requireLocalBenchmarkDatabase(), max: 4 });
    const ask1 = async (artifact: Artifact): Promise<Verdict> => {
      const spec = specOf(artifact.caseId);
      const reservation = await reserveCharge(pool, artifact.campaignId, artifact.episodeId, "judge", FACT_JUDGE_RESERVE_USD, {
        model: FACT_JUDGE_MODEL,
        use: "heldout-gold-fact",
      });
      if (!reservation) throw new Error("campaign cap cannot admit another gold-fact judge call");
      try {
        const result = await generateText({
          model: FACT_JUDGE_MODEL,
          system: FACT_JUDGE_SYSTEM,
          prompt: `QUESTION: ${spec.prompt}\n\nREFERENCE ANSWER: ${spec.goldFact}\n\nDOCUMENTATION SECTION:\n${goldSection(spec.itemId)}\n\nASSISTANT ANSWER:\n${finalText(artifact).trim() || "(empty)"}`,
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
        console.log(`gold-fact judge error ${verdictKey(artifact)}: ${String(error).slice(0, 160)}`);
        return "error";
      }
    };
    try {
      let cursor = 0;
      const worker = async () => {
        while (cursor < pending.length) {
          const artifact = pending[cursor++]!;
          cache[verdictKey(artifact)] = await ask1(artifact);
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
  return (a: Artifact): Verdict | null => cache[verdictKey(a)] ?? null;
}

export type DocsUnit = {
  caseId: string;
  repetition: number;
  family: "DE" | "DH";
  lang: string;
  pass: boolean;
  oraclePass: boolean;
  credits: number;
  usd: number;
  auxUsd: number;
  firstOutputMs: number | null;
  searchMs: number[];
  searches: number;
  hybridSearches: number;
  embeddingCalls: number;
  embeddingAnswered: number;
  embeddingUsd: number;
  goldPage: boolean;
  goldAnchor: boolean;
};

function retrieval(a: Artifact, item: DocsHeldoutItem) {
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

function docsUnit(a: Artifact, verdict: Verdict | null): DocsUnit {
  const spec = specOf(a.caseId);
  const metrics = a.metrics.turns;
  const traces = metrics.map(traceOf);
  const usage = a.usage;
  const found = retrieval(a, itemOf(spec.itemId));
  return {
    caseId: a.caseId,
    repetition: a.repetition,
    family: DOCS_EMBEDDING_CASE_IDS.has(a.caseId) ? "DE" : "DH",
    lang: spec.lang,
    pass: Boolean(a.oracle?.passed) && verdict === "yes",
    oraclePass: Boolean(a.oracle?.passed),
    credits: usage.reduce((total, entry) => total + entry.chargedCredits, 0),
    usd: usage.reduce((total, entry) => total + Number(entry.costMicrocents), 0) / MICROCENTS_PER_USD,
    auxUsd: traces.reduce((total, t) => total + (t?.auxiliaryCostMicrocents ?? 0), 0) / MICROCENTS_PER_USD,
    firstOutputMs: a.turns[0]?.timing.firstOutputMs ?? a.turns[0]?.timing.firstDeltaMs ?? null,
    searchMs: traces.flatMap((t) => t?.docsSearch?.latencyMs ?? []),
    searches: traces.reduce((total, t) => total + (t?.docsSearch?.calls ?? 0), 0),
    hybridSearches: traces.reduce((total, t) => total + (t?.docsSearch?.hybrid ?? 0), 0),
    embeddingCalls: traces.reduce((total, t) => total + (t?.docsEmbedding?.calls ?? 0), 0),
    embeddingAnswered: traces.reduce((total, t) => total + (t?.docsEmbedding?.answered ?? 0), 0),
    embeddingUsd: traces.reduce((total, t) => total + (t?.docsEmbedding?.costMicrocents ?? 0), 0) / MICROCENTS_PER_USD,
    goldPage: found.page,
    goldAnchor: found.anchor,
  };
}

export type DocsPair = { caseId: string; repetition: number; control: DocsUnit; candidate: DocsUnit };

export function binary(pairs: readonly DocsPair[], reps: number) {
  const byCase = clustersOf(pairs);
  const rate = (side: "control" | "candidate") => {
    const n = pairs.filter((p) => p[side].pass).length;
    return { passed: n, of: pairs.length, pct: round((100 * n) / Math.max(1, pairs.length), 2), wilson95: wilson(n, pairs.length) };
  };
  const passK = (side: "control" | "candidate") => {
    const full = byCase.filter((list) => list.length === reps);
    const all = full.filter((list) => list.every((p) => p[side].pass)).length;
    return { cases: full.length, allPassed: all, pct: round((100 * all) / Math.max(1, full.length), 2) };
  };
  const diff = bootstrap(byCase, (units) =>
    units.length ? (100 * units.reduce((t, p) => t + Number(p.candidate.pass) - Number(p.control.pass), 0)) / units.length : null,
  );
  return {
    pairs: pairs.length,
    control: rate("control"),
    candidate: rate("candidate"),
    passK: { k: reps, control: passK("control"), candidate: passK("candidate") },
    diffPts: { point: round(diff.point, 2), ci95: diff.ci95.map((v) => round(v, 2)) },
    mcnemar: mcnemar(pairs.map((p) => ({ control: p.control.pass, candidate: p.candidate.pass }))),
  };
}

type NumericField = "credits" | "usd" | "auxUsd";

function continuous(pairs: readonly DocsPair[], field: NumericField) {
  const clusters = clustersOf(pairs);
  const diff = bootstrap(clusters, (u) => mean(u.map((p) => p.candidate[field] - p.control[field])));
  const rel = bootstrap(clusters, (u) => {
    const c = mean(u.map((p) => p.control[field]));
    const d = mean(u.map((p) => p.candidate[field]));
    return c ? (100 * (d! - c)) / c : null;
  });
  return {
    turns: pairs.length,
    controlMean: round(mean(pairs.map((p) => p.control[field])), 5),
    candidateMean: round(mean(pairs.map((p) => p.candidate[field])), 5),
    meanDiff: { point: round(diff.point, 5), ci95: diff.ci95.map((v) => round(v, 5)) },
    relativePct: { point: round(rel.point, 2), ci95: rel.ci95.map((v) => round(v, 2)) },
  };
}

export function firstOutput(pairs: readonly DocsPair[], p: number) {
  const units = pairs.filter((x) => x.control.firstOutputMs !== null && x.candidate.firstOutputMs !== null);
  const pc = (u: readonly DocsPair[], side: "control" | "candidate") => percentile(u.map((x) => x[side].firstOutputMs!), p);
  const diff = bootstrap(clustersOf(units), (u) => {
    const c = pc(u, "control");
    const d = pc(u, "candidate");
    return c === null || d === null ? null : (d - c) / 1000;
  });
  return {
    pairs: units.length,
    controlS: round((pc(units, "control") ?? 0) / 1000, 3),
    candidateS: round((pc(units, "candidate") ?? 0) / 1000, 3),
    diffS: { point: round(diff.point, 3), ci95: diff.ci95.map((v) => round(v, 3)) },
  };
}

export function searchSummary(pairs: readonly DocsPair[]) {
  const side = (s: "control" | "candidate") => {
    const units = pairs.map((p) => p[s]);
    const ms = units.flatMap((u) => u.searchMs);
    const searches = units.reduce((t, u) => t + u.searches, 0);
    const hybrid = units.reduce((t, u) => t + u.hybridSearches, 0);
    return {
      episodes: units.length,
      searchesPerEpisode: round(searches / Math.max(1, units.length), 3),
      searchMsP50: percentile(ms, 50),
      searchMsP95: percentile(ms, 95),
      searches,
      hybridSearches: hybrid,
      fallbackPct: searches ? round((100 * (searches - hybrid)) / searches, 2) : null,
      embeddingCalls: units.reduce((t, u) => t + u.embeddingCalls, 0),
      embeddingAnswered: units.reduce((t, u) => t + u.embeddingAnswered, 0),
      embeddingUsd: round(units.reduce((t, u) => t + u.embeddingUsd, 0), 6),
      goldPagePct: round((100 * units.filter((u) => u.goldPage).length) / Math.max(1, units.length), 2),
      goldAnchorPct: round((100 * units.filter((u) => u.goldAnchor).length) / Math.max(1, units.length), 2),
    };
  };
  const p95Diff = bootstrap(clustersOf(pairs), (u) => {
    const c = percentile(u.flatMap((p) => p.control.searchMs), 95);
    const d = percentile(u.flatMap((p) => p.candidate.searchMs), 95);
    return c === null || d === null ? null : d - c;
  });
  return { control: side("control"), candidate: side("candidate"), searchMsP95DiffMs: { point: p95Diff.point, ci95: p95Diff.ci95 } };
}

const relevantChecks = (a: Artifact) =>
  (a.oracle?.checks ?? []).filter((check) => a.mergeRequired || check.gate === "runtime" || check.gate === "safety");
const calledSearchDocs = (a: Artifact) => a.observed.some((turn) => turn.tools.some((tool) => tool.name === "search_docs"));

export type SuiteFlag = { caseId: string; checks: string[]; hybridLost: boolean; hybridSearched: boolean };

export function flagFullSuite(control: readonly Artifact[], candidate: readonly Artifact[], caseIds: readonly string[]) {
  const flags: SuiteFlag[] = [];
  const incomplete: string[] = [];
  const outcomes: { control: boolean; candidate: boolean }[] = [];
  for (const caseId of caseIds) {
    const c = control.find((a) => a.caseId === caseId && a.repetition === 1);
    const d = candidate.find((a) => a.caseId === caseId && a.repetition === 1);
    if (!usable(c)) {
      incomplete.push(`${caseId} keyword=${c ? "lost" : "missing"}`);
      continue;
    }
    if (!d) {
      incomplete.push(`${caseId} hybrid=missing`);
      continue;
    }
    if (usable(d)) outcomes.push({ control: c.oracle!.passed, candidate: d.oracle!.passed });
    const passedInControl = relevantChecks(c).filter((check) => check.passed).map((check) => check.id);
    const failed = usable(d)
      ? passedInControl.filter((id) => relevantChecks(d).some((check) => check.id === id && !check.passed))
      : passedInControl;
    if (failed.length) flags.push({ caseId, checks: failed, hybridLost: !usable(d), hybridSearched: calledSearchDocs(d) });
  }
  return { flags, incomplete, outcomes };
}

export function decideRecheck(
  flagged: SuiteFlag,
  control: readonly Artifact[],
  candidate: readonly Artifact[],
) {
  const fails = (a: Artifact) =>
    !usable(a) || flagged.checks.some((id) => !(a.oracle?.checks ?? []).some((check) => check.id === id && check.passed));
  const c = control.filter((a) => a.caseId === flagged.caseId && a.repetition <= LIVE.recheck.reps);
  const d = candidate.filter((a) => a.caseId === flagged.caseId && a.repetition <= LIVE.recheck.reps);
  if (c.length < LIVE.recheck.reps || d.length < LIVE.recheck.reps) return { ...flagged, status: "pending" as const, keyword: c.length, hybrid: d.length };
  const cf = c.filter(fails).length;
  const df = d.filter(fails);
  const p = fisherExactTwoSided(cf, c.length - cf, df.length, d.length - df.length);
  const searched = flagged.hybridSearched || df.some(calledSearchDocs);
  return {
    ...flagged,
    status: p >= LIVE.alpha && !searched ? ("noise" as const) : ("regression" as const),
    keywordFailures: `${cf}/${c.length}`,
    hybridFailures: `${df.length}/${d.length}`,
    fisherP: Number(p.toPrecision(3)),
    failingHybridSearched: searched,
  };
}

export function liveGate(input: {
  pass: ReturnType<typeof binary>;
  creditsRelativePct: number | null;
  firstOutputP95DiffS: number | null;
  fullSuite: "pass" | "fail" | "incomplete";
}) {
  const atCeiling = input.pass.control.of > 0 && input.pass.control.passed >= (LIVE.ceilingPct / 100) * input.pass.control.of;
  const items = {
    passImproves: input.pass.mcnemar.candidateOnly > input.pass.mcnemar.controlOnly && input.pass.mcnemar.exactP < LIVE.alpha,
    passKNotWorse: input.pass.passK.candidate.allPassed >= input.pass.passK.control.allPassed,
    noFullSuiteRegression: input.fullSuite === "incomplete" ? null : input.fullSuite === "pass",
    creditsWithin3Pct: input.creditsRelativePct === null ? null : input.creditsRelativePct <= LIVE.creditsMaxPct,
    firstOutputP95Within1s: input.firstOutputP95DiffS === null ? null : input.firstOutputP95DiffS <= LIVE.firstOutputP95MaxDiffS,
  };
  const values = Object.values(items);
  const verdict = atCeiling
    ? "fail (at ceiling)"
    : values.some((v) => v === false)
      ? "fail"
      : values.some((v) => v === null)
        ? "incomplete"
        : "pass";
  return { atCeiling, items, verdict };
}

function docsPairs(control: readonly Artifact[], candidate: readonly Artifact[], verdictOf: (a: Artifact) => Verdict | null) {
  const c = new Map(control.map((a) => [`${a.caseId}#${a.repetition}`, a]));
  const d = new Map(candidate.map((a) => [`${a.caseId}#${a.repetition}`, a]));
  const pairs: DocsPair[] = [];
  const incomplete: string[] = [];
  for (const caseId of DOCS_CASE_IDS)
    for (let repetition = 1; repetition <= LIVE.reps; repetition += 1) {
      const x = c.get(`${caseId}#${repetition}`);
      const y = d.get(`${caseId}#${repetition}`);
      if (usable(x) && usable(y)) pairs.push({ caseId, repetition, control: docsUnit(x, verdictOf(x)), candidate: docsUnit(y, verdictOf(y)) });
      else incomplete.push(`${caseId}#${repetition} keyword=${x ? (usable(x) ? "ok" : "lost") : "missing"} hybrid=${y ? (usable(y) ? "ok" : "lost") : "missing"}`);
    }
  return { pairs, incomplete };
}

async function main() {
  const campaignId = String(flag("campaign") ?? "");
  if (!campaignId) throw new Error("--campaign is required");
  const all = loadArtifacts(campaignId).filter((a) => a.arm === "shipped");
  const of = (variant: string) => all.filter((a) => a.runtimeVariant === variant);
  const isDocs = (a: Artifact) => DOCS_CASE_IDS.includes(a.caseId);
  const control = of(LIVE.control);
  const candidate = of(LIVE.candidate);
  const cacheDir = campaignAnalysisDirectory(resolve(process.cwd(), "scripts/agent-benchmark/.runs"), campaignId, "docs-embedding-live");
  mkdirSync(cacheDir, { recursive: true });
  const verdictOf = await judgeDocs([...control, ...candidate].filter(isDocs), join(cacheDir, "docs-fact-verdicts.json"), flag("judge") === true);
  const docs = docsPairs(control.filter(isDocs), candidate.filter(isDocs), verdictOf);

  const verdictCounts = (arm: readonly Artifact[]) =>
    arm.filter(isDocs).reduce<Record<string, number>>((acc, a) => ((acc[verdictOf(a) ?? "unjudged"] = (acc[verdictOf(a) ?? "unjudged"] ?? 0) + 1), acc), {});
  const pass = binary(docs.pairs, LIVE.reps);
  const byGroup = (key: (p: DocsPair) => string) =>
    Object.fromEntries(
      [...new Set(docs.pairs.map(key))].sort().map((group) => {
        const subset = docs.pairs.filter((p) => key(p) === group);
        return [group, { ...binary(subset, LIVE.reps), firstOutputP95: firstOutput(subset, 95) }];
      }),
    );
  const credits = continuous(docs.pairs, "credits");
  const p95 = firstOutput(docs.pairs, 95);

  const suiteIds = BENCHMARK_CASES.filter((definition) => definition.heldout !== true).map((definition) => definition.id as string);
  const suiteRan = candidate.some((a) => suiteIds.includes(a.caseId));
  const suite = flagFullSuite(control, candidate, suiteIds);
  const rechecks = suite.flags.map((f) => decideRecheck(f, of(LIVE.recheck.control), of(LIVE.recheck.candidate)));
  const fullSuite: "pass" | "fail" | "incomplete" =
    !suiteRan || suite.incomplete.length || rechecks.some((r) => r.status === "pending")
      ? "incomplete"
      : rechecks.some((r) => r.status === "regression")
        ? "fail"
        : "pass";

  const result = {
    campaignId,
    method: METHOD,
    blocks: DOCS_BLOCKS,
    episodes: { keyword: control.length, hybrid: candidate.length },
    docs: {
      incompletePairs: docs.incomplete,
      factVerdicts: { keyword: verdictCounts(control), hybrid: verdictCounts(candidate) },
      pass,
      oracleOnly: mcnemar(docs.pairs.map((p) => ({ control: p.control.oraclePass, candidate: p.candidate.oraclePass }))),
      byFamily: byGroup((p) => p.control.family),
      byLanguage: byGroup((p) => p.control.lang),
      creditsPerTurn: credits,
      usdPerTurn: continuous(docs.pairs, "usd"),
      auxiliaryUsdPerTurn: continuous(docs.pairs, "auxUsd"),
      firstOutputP50: firstOutput(docs.pairs, 50),
      firstOutputP95: p95,
      search: searchSummary(docs.pairs),
      perCase: Object.fromEntries(
        clustersOf(docs.pairs).map((list) => [
          list[0]!.caseId,
          { keyword: list.filter((p) => p.control.pass).length, hybrid: list.filter((p) => p.candidate.pass).length, reps: list.length },
        ]),
      ),
    },
    fullSuite: {
      ran: suiteRan,
      cases: suiteIds.length,
      incomplete: suite.incomplete,
      oraclePass: {
        pairs: suite.outcomes.length,
        keyword: suite.outcomes.filter((o) => o.control).length,
        hybrid: suite.outcomes.filter((o) => o.candidate).length,
      },
      flags: rechecks,
      verdict: fullSuite,
    },
    gate: liveGate({ pass, creditsRelativePct: credits.relativePct.point, firstOutputP95DiffS: p95.diffS.point, fullSuite }),
  };
  const json = `${JSON.stringify(result, null, 2)}\n`;
  writeFileSync(join(cacheDir, "docs-embedding-live.json"), json);
  const out = flag("out");
  if (typeof out === "string") {
    mkdirSync(resolve(out), { recursive: true });
    writeFileSync(resolve(out, "docs-embedding-live.json"), json);
    writeFileSync(resolve(out, "docs-fact-verdicts.json"), readFileSync(join(cacheDir, "docs-fact-verdicts.json"), "utf8"));
  }
  console.log(json);
}

if (process.argv[1]?.endsWith("docs-embedding-live.ts"))
  main()
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      console.error(error instanceof Error ? (error.stack ?? error.message) : error);
      process.exit(1);
    });
