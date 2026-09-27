import { HELDOUT_RUNS, clusterBootstrap, holm, pct, round, wilson, writeHeldoutReport } from "./common";
import {
  assertBudget,
  chargeCall,
  majority,
  percentile,
  pool,
  readRaw,
  runClassifier,
  signTestP,
  spendByUse,
  spentUsd,
  writeRaw,
} from "../shared";

import { createHash } from "node:crypto";

import { generateText, jsonSchema, Output } from "ai";

import type { ClassifierModel } from "@/ee/agent-chat/classifier";
import type { DocsSection } from "@/features/mcp-tools/docs-retrieval";
import type { DocsSearchHit } from "@/features/mcp-tools/docs.mcp-tools";
import type { DocsHeldoutItem } from "../heldout/docs-heldout";

import { DOCS_HELDOUT } from "../heldout/docs-heldout";

import {
  DOCS_RERANK_TIMEOUT_MS,
  docsRankOrder,
  docsRankSpec,
  docsRankState,
  docsRankUserMessage,
} from "@/ee/agent-chat/docs-rerank";
import { readAgentProviderCharge } from "@/ee/agent-chat/gateway-cost";
import { splitSections } from "@/features/mcp-tools/docs-retrieval";
import {
  docsRerankExcerpt,
  getDocsPageRaw,
  listDocsSlugs,
  searchDocsRaw,
  searchDocsRanked,
} from "@/features/mcp-tools/docs.mcp-tools";

const MODELS: ClassifierModel[] = ["jev", "gemini"];
const JUDGE_MODEL = "google/gemini-3-flash";
const RAW_FILE = "heldout-docs-arms.json";
const JUDGE_CACHE = "heldout-docs-judge-cache.json";
const AGENT_QUERY_WORDS = 6;
const AGENT_QUERY_MIN_CHARS = 4;

const METHOD = {
  agentQuery: `Fixed before any run: the agent query is the first ${AGENT_QUERY_WORDS} words of the question that have at least ${AGENT_QUERY_MIN_CHARS} letters or digits, lowercased, in question order, punctuation dropped; it stays in the question's language. The question itself is latestUserMessage.`,
  keyword: "Control: searchDocsRaw (the keyword ranker behind search_docs without a re-rank) on the agent query in the item's docsLocale.",
  v2: `Candidate: searchDocsRanked, the product search_docs path with docs re-rank v2 (docsRankSpec, docsRankState with docsRankUserMessage(question), docsRankOrder), product timeout ${DOCS_RERANK_TIMEOUT_MS} ms for both models, 3 runs per model. A failed or timed-out call falls back to the keyword output, as the product does.`,
  pageFirst: "The first result's page is the gold slug or the page of an alternative anchor.",
  sectionFirst:
    "The first result's slug#anchor is a gold anchor or an alternative anchor (lenient); strict counts gold anchors only.",
  answer:
    "The first returned section (heading path plus body, first 1,400 characters, docsRerankExcerpt) is judged against the gold fact by the earlier judge: google/gemini-3-flash on Vertex, thinking low, ZDR, the reference-fact prompt; only 'yes' passes.",
  stats:
    "Per language and pooled: keyword once (deterministic), each model 3 runs with per-run counts and means; exact sign test (McNemar) on per-item majority outcomes against the keyword ranker, Holm-corrected over the two models; mean difference with a 95% item-cluster paired bootstrap over all runs.",
  latency: "Added latency is the classifier call's wall time per query; the keyword ranker's own time is reported beside it.",
};

function agentQuery(question: string) {
  return question
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => [...word].length >= AGENT_QUERY_MIN_CHARS)
    .slice(0, AGENT_QUERY_WORDS)
    .join(" ");
}

const sectionsByKey = new Map<string, DocsSection>();
for (const locale of ["en", "de"] as const)
  for (const slug of listDocsSlugs(locale, "docs")) {
    const page = getDocsPageRaw(slug, locale, "docs")!;
    for (const section of splitSections({ slug, source: "docs", pageTitle: page.title, markdown: page.markdown }))
      sectionsByKey.set(`${locale}:${section.slug}#${section.anchor}`, section);
  }

const accepted = (item: DocsHeldoutItem) => [...item.anchors, ...item.alternatives];
const pageFirst = (item: DocsHeldoutItem, hit: DocsSearchHit | undefined) =>
  hit !== undefined && [item.slug, ...accepted(item).map((anchor) => anchor.split("#")[0])].includes(hit.slug);
const sectionFirst = (item: DocsHeldoutItem, hit: DocsSearchHit | undefined, strict = false) =>
  hit !== undefined && (strict ? item.anchors : accepted(item)).includes(`${hit.slug}#${hit.anchor}`);

type Row = {
  itemId: string;
  arm: string;
  run: number;
  query: string;
  first: DocsSearchHit | undefined;
  firstExcerpt: string;
  classifierMs: number;
  toolMs: number;
  costMicrocents: number | null;
  called: boolean;
  failed: boolean;
};

function firstExcerpt(item: DocsHeldoutItem, hit: DocsSearchHit | undefined) {
  if (!hit) return "";
  const section = sectionsByKey.get(`${item.docsLocale}:${hit.slug}#${hit.anchor}`);
  return section ? docsRerankExcerpt(section) : "";
}

function keywordRow(item: DocsHeldoutItem): Row {
  const query = agentQuery(item.query);
  const started = performance.now();
  const { results } = searchDocsRaw(query, item.docsLocale, "docs");
  const toolMs = performance.now() - started;
  return {
    itemId: item.id,
    arm: "keyword",
    run: 0,
    query,
    first: results[0],
    firstExcerpt: firstExcerpt(item, results[0]),
    classifierMs: 0,
    toolMs,
    costMicrocents: null,
    called: false,
    failed: false,
  };
}

async function v2Row(item: DocsHeldoutItem, model: ClassifierModel, run: number): Promise<Row> {
  const query = agentQuery(item.query);
  const message = docsRankUserMessage(item.query);
  let classifierMs = 0;
  let costMicrocents: number | null = null;
  let called = false;
  let failed = false;
  const started = performance.now();
  const output = await searchDocsRanked({ query, locale: item.docsLocale, source: "docs" }, async (q, candidates) => {
    called = true;
    const call = await runClassifier(
      `heldout-docs:${model}`,
      docsRankSpec(candidates),
      docsRankState(q, message),
      model,
      DOCS_RERANK_TIMEOUT_MS,
    );
    classifierMs = call.ms;
    costMicrocents = call.result?.costMicrocents ?? null;
    const order = docsRankOrder(call.result, candidates);
    failed = order === null;
    return order;
  });
  const toolMs = performance.now() - started;
  const first = output.structuredContent.results[0];
  return {
    itemId: item.id,
    arm: model,
    run,
    query,
    first,
    firstExcerpt: firstExcerpt(item, first),
    classifierMs,
    toolMs,
    costMicrocents,
    called,
    failed,
  };
}

type Verdict = "yes" | "partial" | "no" | "error";
const judgeCache = readRaw<Record<string, Verdict>>(JUDGE_CACHE) ?? {};
const JUDGE_FACT_SYSTEM =
  "You grade documentation retrieval for the Customermates CRM. You get a user question, a reference answer, and the excerpt a search tool returned. Answer `yes` if the excerpt alone states the reference answer or everything needed to derive it. Answer `partial` if it is on the right topic but misses part of the reference answer. Answer `no` otherwise. Do not use outside knowledge.";

async function judge(question: string, excerpt: string, fact: string): Promise<Verdict> {
  const key = createHash("sha1").update(`fact\u0000${question}\u0000${fact}\u0000${excerpt}`).digest("hex");
  const cached = judgeCache[key];
  if (cached && cached !== "error") return cached;
  assertBudget();
  try {
    const result = await generateText({
      model: JUDGE_MODEL,
      system: JUDGE_FACT_SYSTEM,
      prompt: `QUESTION: ${question}\n\nREFERENCE ANSWER: ${fact}\n\nEXCERPT:\n${excerpt || "(empty)"}`,
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
    chargeCall(
      "heldout-docs:judge",
      JUDGE_MODEL,
      charge.outcome === "measured" ? charge.charge.costMicrocents : null,
    );
    judgeCache[key] = result.output.verdict;
  } catch {
    judgeCache[key] = "error";
  }
  return judgeCache[key]!;
}

async function collect() {
  const stored = readRaw<Record<string, Row>>(RAW_FILE) ?? {};
  const tasks = MODELS.flatMap((model) =>
    Array.from({ length: HELDOUT_RUNS }, (_, run) => DOCS_HELDOUT.map((item) => ({ model, run, item }))).flat(),
  );
  try {
    const rows = await pool(tasks, 4, async ({ model, run, item }) => {
      const key = `${model}:${item.id}:${run}`;
      if (stored[key]) return stored[key];
      const row = await v2Row(item, model, run);
      stored[key] = row;
      return row;
    });
    return rows;
  } finally {
    writeRaw(RAW_FILE, stored);
  }
}

type Metric = "pageFirst" | "sectionFirst" | "sectionFirstStrict" | "answer";

async function main() {
  const keyword = DOCS_HELDOUT.map(keywordRow);
  const classifierRows = await collect();
  const rows = [...keyword, ...classifierRows];
  const verdicts = new Map<Row, Verdict>();
  try {
    await pool(rows, 8, async (row) => {
      const item = DOCS_HELDOUT.find((entry) => entry.id === row.itemId)!;
      verdicts.set(row, await judge(item.query, row.firstExcerpt, item.fact));
    });
  } finally {
    writeRaw(JUDGE_CACHE, judgeCache);
  }
  const itemOf = (row: Row) => DOCS_HELDOUT.find((entry) => entry.id === row.itemId)!;
  const metric = (row: Row, name: Metric) => {
    const item = itemOf(row);
    if (name === "pageFirst") return pageFirst(item, row.first);
    if (name === "sectionFirst") return sectionFirst(item, row.first);
    if (name === "sectionFirstStrict") return sectionFirst(item, row.first, true);
    return verdicts.get(row) === "yes";
  };
  const metrics: Metric[] = ["pageFirst", "sectionFirst", "sectionFirstStrict", "answer"];
  const groups: Record<string, readonly DocsHeldoutItem[]> = {
    pooled: DOCS_HELDOUT,
    ...Object.fromEntries(
      [...new Set(DOCS_HELDOUT.map((item) => item.lang))].map((lang) => [
        lang,
        DOCS_HELDOUT.filter((item) => item.lang === lang),
      ]),
    ),
  };
  const table: Record<string, unknown> = {};
  const pooledSignP: Record<string, Record<string, number>> = {};
  for (const [group, items] of Object.entries(groups)) {
    const ids = new Set(items.map((item) => item.id));
    const keywordRows = keyword.filter((row) => ids.has(row.itemId));
    const entry: Record<string, unknown> = {
      n: items.length,
      keyword: {
        ...Object.fromEntries(
          metrics.map((name) => {
            const hits = keywordRows.filter((row) => metric(row, name)).length;
            return [name, { hits, pct: pct(hits, items.length), wilson95: wilson(hits, items.length) }];
          }),
        ),
        toolMsP50: round(percentile(keywordRows.map((row) => row.toolMs), 0.5), 2),
        toolMsP95: round(percentile(keywordRows.map((row) => row.toolMs), 0.95), 2),
      },
    };
    for (const model of MODELS) {
      const modelRows = classifierRows.filter((row) => row.arm === model && ids.has(row.itemId));
      const perMetric: Record<string, unknown> = {};
      for (const name of metrics) {
        const perRun = Array.from(
          { length: HELDOUT_RUNS },
          (_, run) => modelRows.filter((row) => row.run === run && metric(row, name)).length,
        );
        const outcomes = items.map((item) => {
          const control = metric(keywordRows.find((row) => row.itemId === item.id)!, name);
          const candidate = majority(modelRows.filter((row) => row.itemId === item.id).map((row) => metric(row, name)));
          return { control, candidate };
        });
        const wins = outcomes.filter((o) => o.candidate && !o.control).length;
        const losses = outcomes.filter((o) => o.control && !o.candidate).length;
        const signP = Number(signTestP(wins, losses).toPrecision(3));
        if (group === "pooled") (pooledSignP[name] ??= {})[model] = signP;
        const majorityHits = outcomes.filter((o) => o.candidate).length;
        perMetric[name] = {
          perRun,
          meanPct: round((100 * perRun.reduce((a, b) => a + b, 0)) / HELDOUT_RUNS / items.length),
          majorityHits,
          majorityPct: pct(majorityHits, items.length),
          majorityWilson95: wilson(majorityHits, items.length),
          majorityWins: wins,
          majorityLosses: losses,
          signTestP: signP,
          diffPtsVsKeyword: clusterBootstrap(
            modelRows.map((row) => ({
              cluster: row.itemId,
              control: metric(keywordRows.find((k) => k.itemId === row.itemId)!, name) ? 1 : 0,
              candidate: metric(row, name) ? 1 : 0,
            })),
            100,
          ),
        };
      }
      const called = modelRows.filter((row) => row.called);
      const ms = called.map((row) => row.classifierMs);
      const costs = called.map((row) => row.costMicrocents).filter((cost): cost is number => cost !== null);
      entry[model] = {
        ...perMetric,
        calls: called.length,
        failedOrTimedOut: called.filter((row) => row.failed).length,
        addedMsP50: round(percentile(ms, 0.5)),
        addedMsP95: round(percentile(ms, 0.95)),
        usdPerQueryMeasured: costs.length
          ? Number((costs.reduce((a, b) => a + b, 0) / costs.length / 1e8).toPrecision(3))
          : null,
      };
    }
    table[group] = entry;
  }
  const holmPooled = Object.fromEntries(Object.entries(pooledSignP).map(([name, byModel]) => [name, holm(byModel)]));
  const verdictErrors = [...verdicts.values()].filter((verdict) => verdict === "error").length;
  writeHeldoutReport("docs.json", {
    track: "docs",
    fixture: "heldout/docs-heldout.ts (40 questions: en, de, es, fr, it)",
    method: METHOD,
    preRegisteredOffline:
      "Descriptive only: page-first and anchor-hit rates per language for the keyword ranker and the classifier (majority of 3 runs), with the exact sign test; with 3 runs and majority outcomes the sign test needs at least 6 wins and no losses to reach p < 0.05. The docs gate is judged live (DH cases, k = 10).",
    judge: { model: JUDGE_MODEL, verdictErrors },
    table,
    pooledSignTestHolm: holmPooled,
    perItem: DOCS_HELDOUT.map((item) => {
      const view = (row: Row) => ({
        first: row.first ? `${row.first.slug}#${row.first.anchor}` : null,
        pageFirst: metric(row, "pageFirst"),
        sectionFirst: metric(row, "sectionFirst"),
        answer: verdicts.get(row),
      });
      return {
        id: item.id,
        lang: item.lang,
        docsLocale: item.docsLocale,
        agentQuery: agentQuery(item.query),
        gold: item.anchors,
        alternatives: item.alternatives,
        keyword: view(keyword.find((row) => row.itemId === item.id)!),
        ...Object.fromEntries(
          MODELS.map((model) => [
            model,
            classifierRows
              .filter((row) => row.arm === model && row.itemId === item.id)
              .sort((a, b) => a.run - b.run)
              .map(view),
          ]),
        ),
      };
    }),
    spendAfterTrackUsd: Number(spentUsd().toFixed(4)),
    spendByUse: spendByUse(),
  });
  console.log(JSON.stringify(table.pooled, null, 2));
}

await main();
