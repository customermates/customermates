import { BOOTSTRAP_RESAMPLES, clusterBootstrap, holm, pct, round, wilson } from "./common";
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
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { generateText, jsonSchema, Output } from "ai";

import type { DocsEmbeddingModelKey } from "@/core/config/environment";
import type { DocsRankCandidate, DocsSectionRanker } from "@/features/mcp-tools/docs.mcp-tools";
import type { ContentLocale } from "@/i18n/locale-registry";

import { DOCS_BLIND_BANK } from "../fixtures/docs-blind-bank";
import { DOCS_EMBEDDING_HELDOUT } from "../heldout/docs-embedding-heldout";
import { DOCS_HELDOUT } from "../heldout/docs-heldout";

import { DOCS_EMBEDDING_MODELS, estimateEmbeddingCostMicrocents } from "@/ee/agent-chat/classifier/embedding-runner";
import { collectClassifierCharges, embedQueryMetered } from "@/ee/agent-chat/classifier/metered";
import {
  DOCS_EMBEDDING_TIMEOUT_MS,
  docsEmbeddingQueryText,
  docsEmbeddingSearch,
  docsEmbeddingSectionText,
  rankSectionsByEmbedding,
  readyDocsEmbeddingIndex,
  warmDocsEmbeddingIndex,
} from "@/ee/agent-chat/docs-embedding";
import {
  DOCS_RERANK_TIMEOUT_MS,
  docsRankOrder,
  docsRankSpec,
  docsRankState,
  docsRankUserMessage,
} from "@/ee/agent-chat/docs-rerank";
import { readAgentProviderCharge } from "@/ee/agent-chat/gateway-cost";
import {
  DOCS_RANK_RETURNED,
  DOCS_RANK_SECONDARY_EXCERPT_CHARS,
  DOCS_RERANK_CANDIDATES,
  DOCS_RERANK_EXCERPT_CHARS,
  docsEmbeddingSections,
  docsRerankExcerpt,
  searchDocsRanked,
  searchDocsTool,
} from "@/features/mcp-tools/docs.mcp-tools";

const MODELS: readonly DocsEmbeddingModelKey[] = ["qwen3-8b", "google-multilingual"];
const RUNS = 3;
const JUDGE_MODEL = "google/gemini-3-flash";
const JUDGE_CACHE = "emb-docs-judge-cache.json";
const AGENT_QUERY_WORDS = 6;
const AGENT_QUERY_MIN_CHARS = 4;
const SHUFFLE_SEED = 20_260_928;
const REPORT_DIR = join(process.cwd(), "scripts/agent-benchmark/reports/2026-09-28-docs-embedding-offline");

export const METHOD = {
  preRegistration: "classifier-eval/heldout/PREREGISTRATION.md, Amendment 4 (committed in 43855e6c before any run).",
  agentQuery: `The agent query is the first ${AGENT_QUERY_WORDS} words of the question with at least ${AGENT_QUERY_MIN_CHARS} letters or digits, lowercased, in question order, punctuation dropped, in the question's language (the stage-2 rule); latest_user_message is the question. The blind bank uses its query as written.`,
  arms: `A: searchDocsRanked with the shipped keyword candidates. B:<model>: searchDocsRanked with docsEmbeddingSearch(<model>) (hybrid candidates, ${DOCS_EMBEDDING_TIMEOUT_MS} ms query-embedding deadline, fallback to A's candidates). C:<model>: embedding top ${DOCS_RERANK_CANDIDATES} only, re-ranked by the same Jev spec, returned in the product's excerpt format, keyword output on a Jev failure (diagnostic). Jev deadline ${DOCS_RERANK_TIMEOUT_MS} ms everywhere.`,
  design: `${RUNS} runs; per item and run every arm runs back to back in an order shuffled with seed ${SHUFFLE_SEED}; items and runs in 4 concurrent workers. Section indexes are built before timing starts.`,
  answer: `Primary: the tool's text output (excerpts, or the keyword snippet on fallback) is judged against the gold fact by ${JUDGE_MODEL} on Vertex (thinking low, ZDR, no training, temperature 0, reference-fact prompt); only yes passes.`,
  rightSection:
    "Secondary: a returned section (the up to 3 re-ranked sections, or the keyword best section on fallback) is a gold anchor or an alternative; rightFirst checks only the first, lenient and strict; pageFirst checks the first section's page.",
  stats: `Per item and arm, the majority of ${RUNS} runs; exact two-sided sign test on discordant items against A, Holm over the two models per arm family; mean difference with a 95% item-cluster paired bootstrap (${BOOTSTRAP_RESAMPLES} resamples) over all runs, paired by item and run; Wilson 95% intervals.`,
  latency:
    "search_docs wall time per call; added p95 is p95(B) minus p95(A) over all calls, with a 95% item-cluster bootstrap interval of that difference.",
  gate: "Per B model: pooled majority answer difference >= +5 pts, Holm sign-test p < 0.05, each language >= -5 pts, added p95 <= 300 ms.",
};

type Bank = "new" | "heldout40" | "blind120";
type Item = {
  id: string;
  lang: string;
  docsLocale: ContentLocale;
  question: string;
  query: string;
  pages: readonly string[];
  accepted: readonly string[];
  strict: readonly string[];
  fact: string | null;
};

const bank = (process.argv.find((arg) => arg.startsWith("--bank="))?.slice("--bank=".length) ?? "new") as Bank;

function agentQuery(question: string) {
  return question
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => [...word].length >= AGENT_QUERY_MIN_CHARS)
    .slice(0, AGENT_QUERY_WORDS)
    .join(" ");
}

function itemsOf(name: Bank): Item[] {
  if (name === "blind120")
    return DOCS_BLIND_BANK.map((question, index) => ({
      id: `bb-${String(index + 1).padStart(3, "0")}`,
      lang: question.locale,
      docsLocale: question.locale,
      question: question.query,
      query: question.query,
      pages: [question.slug, ...question.alternatives],
      accepted: [],
      strict: [],
      fact: null,
    }));
  const source = name === "new" ? DOCS_EMBEDDING_HELDOUT : DOCS_HELDOUT;
  return source.map((item) => ({
    id: item.id,
    lang: item.lang,
    docsLocale: item.docsLocale,
    question: item.query,
    query: agentQuery(item.query),
    pages: [item.slug, ...[...item.anchors, ...item.alternatives].map((anchor) => anchor.split("#")[0]!)],
    accepted: [...item.anchors, ...item.alternatives],
    strict: item.anchors,
    fact: item.fact,
  }));
}

const ITEMS = itemsOf(bank);
const ARMS: readonly string[] =
  bank === "new"
    ? ["A", ...MODELS.map((model) => `B:${model}`), ...MODELS.map((model) => `C:${model}`)]
    : ["A", ...MODELS.map((model) => `B:${model}`)];

type Row = {
  itemId: string;
  arm: string;
  run: number;
  returned: string[];
  text: string;
  toolMs: number;
  reranked: boolean;
  embedded: boolean | null;
};

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

function shuffled<T>(values: readonly T[], seed: number): T[] {
  const random = prng(seed);
  const out = [...values];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function seedOf(text: string) {
  return createHash("sha256").update(text).digest().readUInt32BE(0);
}

function jevRanker(question: string, chosen: { ids: number[] | null; candidates: readonly DocsRankCandidate[] }) {
  const message = docsRankUserMessage(question);
  const rank: DocsSectionRanker = async (query, candidates) => {
    chosen.candidates = candidates;
    const call = await runClassifier(
      "emb-offline:jev",
      docsRankSpec(candidates),
      docsRankState(query, message),
      "jev",
      DOCS_RERANK_TIMEOUT_MS,
    );
    chosen.ids = docsRankOrder(call.result, candidates);
    return chosen.ids;
  };
  return rank;
}

function returnedAnchors(
  chosen: { ids: number[] | null; candidates: readonly DocsRankCandidate[] },
  fallback: { slug: string; anchor: string } | undefined,
) {
  const sections = [...new Set(chosen.ids ?? [])]
    .flatMap((id) => chosen.candidates.find((candidate) => candidate.id === id)?.section ?? [])
    .slice(0, DOCS_RANK_RETURNED);
  if (sections.length > 0) return sections.map((section) => `${section.slug}#${section.anchor}`);
  return fallback ? [`${fallback.slug}#${fallback.anchor}`] : [];
}

function chargeEmbeddings(charges: readonly { use: string; model: string; costMicrocents: number }[]) {
  for (const charge of charges)
    if (charge.use === "docs_embedding") chargeCall("emb-offline:query-embedding", charge.model, charge.costMicrocents);
}

async function productRow(item: Item, arm: string, run: number): Promise<Row> {
  const chosen: { ids: number[] | null; candidates: readonly DocsRankCandidate[] } = { ids: null, candidates: [] };
  const rank = jevRanker(item.question, chosen);
  const model = arm.startsWith("B:") ? (arm.slice(2) as DocsEmbeddingModelKey) : null;
  const input = { query: item.query, locale: item.docsLocale, source: "docs" as const };
  const started = performance.now();
  const { value: output, charges } = await collectClassifierCharges(() =>
    searchDocsRanked(input, rank, model ? docsEmbeddingSearch(model) : undefined),
  );
  const toolMs = performance.now() - started;
  chargeEmbeddings(charges);
  const first = output.structuredContent.results[0];
  return {
    itemId: item.id,
    arm,
    run,
    returned: returnedAnchors(chosen, first),
    text: output.text,
    toolMs,
    reranked: chosen.ids !== null,
    embedded: model ? charges.some((charge) => charge.use === "docs_embedding" && charge.answered) : null,
  };
}

async function embeddingOnlyRow(item: Item, arm: string, run: number): Promise<Row> {
  const model = arm.slice(2) as DocsEmbeddingModelKey;
  const chosen: { ids: number[] | null; candidates: readonly DocsRankCandidate[] } = { ids: null, candidates: [] };
  const rank = jevRanker(item.question, chosen);
  const input = { query: item.query, locale: item.docsLocale, source: "docs" as const };
  const started = performance.now();
  const { value, charges } = await collectClassifierCharges(async () => {
    const vectors = readyDocsEmbeddingIndex(model, item.docsLocale);
    const { embedding } = await embedQueryMetered(
      model,
      docsEmbeddingQueryText(model, item.query),
      DOCS_EMBEDDING_TIMEOUT_MS,
    );
    const sections = docsEmbeddingSections(item.docsLocale);
    const candidates: DocsRankCandidate[] =
      vectors && embedding
        ? rankSectionsByEmbedding(vectors, embedding, DOCS_RERANK_CANDIDATES).map((id) => ({
            id,
            section: sections[id]!,
            titleOnly: false,
          }))
        : [];
    const ids = candidates.length >= 2 ? await rank(item.query, candidates).catch(() => null) : null;
    const picked = [...new Set(ids ?? [])]
      .flatMap((id) => candidates.find((candidate) => candidate.id === id)?.section ?? [])
      .slice(0, DOCS_RANK_RETURNED);
    if (picked.length === 0) return { text: searchDocsTool.execute(input).text, picked, embedded: embedding !== null };
    const excerpts = picked
      .map((section, index) =>
        docsRerankExcerpt(section, index === 0 ? DOCS_RERANK_EXCERPT_CHARS : DOCS_RANK_SECONDARY_EXCERPT_CHARS),
      )
      .join("\n\n");
    return { text: `excerpt=\n${excerpts}`, picked, embedded: embedding !== null };
  });
  const toolMs = performance.now() - started;
  chargeEmbeddings(charges);
  const keywordFirst = searchDocsTool.execute(input).structuredContent.results[0];
  return {
    itemId: item.id,
    arm,
    run,
    returned:
      value.picked.length > 0
        ? value.picked.map((section) => `${section.slug}#${section.anchor}`)
        : keywordFirst
          ? [`${keywordFirst.slug}#${keywordFirst.anchor}`]
          : [],
    text: value.text,
    toolMs,
    reranked: chosen.ids !== null,
    embedded: value.embedded,
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
    chargeCall("emb-offline:judge", JUDGE_MODEL, charge.outcome === "measured" ? charge.charge.costMicrocents : null);
    judgeCache[key] = result.output.verdict;
  } catch {
    judgeCache[key] = "error";
  }
  return judgeCache[key]!;
}

async function warmIndexes() {
  for (const model of MODELS)
    for (const locale of [...new Set(ITEMS.map((item) => item.docsLocale))]) {
      const ready = await warmDocsEmbeddingIndex(model, locale);
      if (!ready) throw new Error(`the ${model} ${locale} section index could not be built`);
      const texts = docsEmbeddingSections(locale).map(docsEmbeddingSectionText);
      if (!readRaw<boolean>(`emb-index-charged-${model}-${locale}.json`)) {
        chargeCall("emb-offline:index-estimate", model, estimateEmbeddingCostMicrocents(model, texts));
        writeRaw(`emb-index-charged-${model}-${locale}.json`, true);
      }
    }
}

async function collect() {
  const rawFile = `emb-offline-${bank}.json`;
  const stored = readRaw<Record<string, Row>>(rawFile) ?? {};
  const tasks = Array.from({ length: RUNS }, (_, run) => ITEMS.map((item) => ({ item, run }))).flat();
  try {
    await pool(tasks, 4, async ({ item, run }) => {
      for (const arm of shuffled(ARMS, SHUFFLE_SEED ^ seedOf(`${bank}:${item.id}:${run}`))) {
        const key = `${arm}:${item.id}:${run}`;
        if (stored[key]) continue;
        stored[key] = arm.startsWith("C:") ? await embeddingOnlyRow(item, arm, run) : await productRow(item, arm, run);
      }
    });
  } finally {
    writeRaw(rawFile, stored);
  }
  return Object.values(stored);
}

type Metric = "answer" | "rightSection" | "rightFirst" | "rightFirstStrict" | "pageFirst";

function p95Diff(rows: readonly Row[], arm: string) {
  const byItem = new Map<string, { control: number[]; candidate: number[] }>();
  for (const row of rows) {
    if (row.arm !== "A" && row.arm !== arm) continue;
    const entry = byItem.get(row.itemId) ?? { control: [], candidate: [] };
    (row.arm === "A" ? entry.control : entry.candidate).push(row.toolMs);
    byItem.set(row.itemId, entry);
  }
  const clusters = [...byItem.keys()];
  const diff = (picked: readonly string[]) => {
    const control = picked.flatMap((id) => byItem.get(id)!.control);
    const candidate = picked.flatMap((id) => byItem.get(id)!.candidate);
    return (percentile(candidate, 0.95) ?? 0) - (percentile(control, 0.95) ?? 0);
  };
  const random = prng(SHUFFLE_SEED);
  const draws = Array.from({ length: BOOTSTRAP_RESAMPLES }, () =>
    diff(clusters.map(() => clusters[Math.floor(random() * clusters.length)]!)),
  ).sort((a, b) => a - b);
  const at = (q: number) => draws[Math.min(draws.length - 1, Math.floor(q * draws.length))]!;
  return { ms: round(diff(clusters), 0), ci95: [round(at(0.025), 0), round(at(0.975), 0)] };
}

async function main() {
  mkdirSync(REPORT_DIR, { recursive: true });
  await warmIndexes();
  const rows = await collect();
  const itemOf = new Map(ITEMS.map((item) => [item.id, item]));
  const verdicts = new Map<Row, Verdict>();
  if (bank !== "blind120")
    try {
      await pool(rows, 8, async (row) => {
        const item = itemOf.get(row.itemId)!;
        verdicts.set(row, await judge(item.question, row.text, item.fact!));
      });
    } finally {
      writeRaw(JUDGE_CACHE, judgeCache);
    }
  const metrics: Metric[] =
    bank === "blind120" ? ["pageFirst"] : ["answer", "rightSection", "rightFirst", "rightFirstStrict", "pageFirst"];
  const metric = (row: Row, name: Metric) => {
    const item = itemOf.get(row.itemId)!;
    if (name === "answer") return verdicts.get(row) === "yes";
    if (name === "rightSection") return row.returned.some((anchor) => item.accepted.includes(anchor));
    if (name === "rightFirst") return item.accepted.includes(row.returned[0] ?? "");
    if (name === "rightFirstStrict") return item.strict.includes(row.returned[0] ?? "");
    return item.pages.includes((row.returned[0] ?? "").split("#")[0]!);
  };
  const outcome = (arm: string, itemId: string, name: Metric) =>
    majority(rows.filter((row) => row.arm === arm && row.itemId === itemId).map((row) => metric(row, name)));
  const groups: Record<string, Item[]> = {
    pooled: ITEMS,
    ...Object.fromEntries([...new Set(ITEMS.map((item) => item.lang))].map((lang) => [lang, ITEMS.filter((item) => item.lang === lang)])),
  };
  const candidates = ARMS.filter((arm) => arm !== "A");
  const table: Record<string, Record<string, unknown>> = {};
  const signP: Record<string, Record<string, number>> = {};
  for (const [group, items] of Object.entries(groups)) {
    const ids = new Set(items.map((item) => item.id));
    const entry: Record<string, unknown> = { n: items.length };
    for (const arm of ARMS) {
      const armRows = rows.filter((row) => row.arm === arm && ids.has(row.itemId));
      const perMetric: Record<string, unknown> = {};
      for (const name of metrics) {
        const hits = items.filter((item) => outcome(arm, item.id, name)).length;
        const perRun = Array.from({ length: RUNS }, (_, run) => armRows.filter((row) => row.run === run && metric(row, name)).length);
        const base: Record<string, unknown> = { majorityHits: hits, majorityPct: pct(hits, items.length), wilson95: wilson(hits, items.length), perRun };
        if (arm !== "A") {
          const wins = items.filter((item) => outcome(arm, item.id, name) && !outcome("A", item.id, name)).length;
          const losses = items.filter((item) => !outcome(arm, item.id, name) && outcome("A", item.id, name)).length;
          const p = Number(signTestP(wins, losses).toPrecision(3));
          if (group === "pooled") ((signP[name] ??= {})[arm] = p);
          const aHits = items.filter((item) => outcome("A", item.id, name)).length;
          Object.assign(base, {
            wins,
            losses,
            signTestP: p,
            majorityDiffPts: round((100 * (hits - aHits)) / items.length),
            runDiffPts: clusterBootstrap(
              armRows.map((row) => {
                const control = rows.find((c) => c.arm === "A" && c.itemId === row.itemId && c.run === row.run)!;
                return { cluster: row.itemId, control: metric(control, name) ? 1 : 0, candidate: metric(row, name) ? 1 : 0 };
              }),
              100,
            ),
          });
        }
        perMetric[name] = base;
      }
      const times = armRows.map((row) => row.toolMs);
      entry[arm] = {
        ...perMetric,
        calls: armRows.length,
        reranked: armRows.filter((row) => row.reranked).length,
        embeddingAnswered: armRows.some((row) => row.embedded !== null)
          ? armRows.filter((row) => row.embedded === true).length
          : null,
        toolMsP50: round(percentile(times, 0.5), 0),
        toolMsP95: round(percentile(times, 0.95), 0),
        ...(arm !== "A" && group === "pooled" ? { addedP95: p95Diff(rows, arm) } : {}),
      };
    }
    table[group] = entry;
  }
  const holmByFamily = Object.fromEntries(
    Object.entries(signP).map(([name, byArm]) => [
      name,
      {
        ...holm(Object.fromEntries(Object.entries(byArm).filter(([arm]) => arm.startsWith("B:")))),
        ...holm(Object.fromEntries(Object.entries(byArm).filter(([arm]) => arm.startsWith("C:")))),
      },
    ]),
  );
  const gate =
    bank === "new"
      ? Object.fromEntries(
          MODELS.map((model) => {
            const arm = `B:${model}`;
            const pooled = table.pooled![arm] as Record<string, Record<string, number>> & { addedP95: { ms: number } };
            const diff = pooled.answer!.majorityDiffPts!;
            const holmP = holmByFamily.answer![arm]!;
            const languages = Object.fromEntries(
              Object.entries(table)
                .filter(([group]) => group !== "pooled")
                .map(([group, entry]) => [group, (entry[arm] as Record<string, Record<string, number>>).answer!.majorityDiffPts!]),
            );
            const checks = {
              pooledDiffAtLeast5: diff >= 5,
              holmSignP005: holmP < 0.05,
              noLanguageBelowMinus5: Object.values(languages).every((value) => value >= -5),
              addedP95AtMost300ms: pooled.addedP95.ms <= 300,
            };
            return [
              arm,
              { pooledDiffPts: diff, holmP, languages, addedP95Ms: pooled.addedP95.ms, checks, passes: Object.values(checks).every(Boolean) },
            ];
          }),
        )
      : null;
  const report = {
    bank,
    method: METHOD,
    models: Object.fromEntries(MODELS.map((model) => [model, DOCS_EMBEDDING_MODELS[model]])),
    judge: bank === "blind120" ? null : { model: JUDGE_MODEL, errors: [...verdicts.values()].filter((v) => v === "error").length },
    table,
    holm: holmByFamily,
    gate,
    perItem: ITEMS.map((item) => ({
      id: item.id,
      lang: item.lang,
      query: item.query,
      gold: item.strict,
      ...Object.fromEntries(
        ARMS.map((arm) => [
          arm,
          rows
            .filter((row) => row.arm === arm && row.itemId === item.id)
            .sort((a, b) => a.run - b.run)
            .map((row) => ({
              first: row.returned[0] ?? null,
              right: metrics.includes("rightSection") ? metric(row, "rightSection") : metric(row, "pageFirst"),
              answer: verdicts.get(row) ?? null,
              ms: Math.round(row.toolMs),
              embedded: row.embedded,
            })),
        ]),
      ),
    })),
    spendUsd: Number(spentUsd().toFixed(4)),
    spendByUse: spendByUse(),
  };
  writeFileSync(join(REPORT_DIR, `${bank}.json`), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ gate, spendUsd: report.spendUsd }, null, 2));
}

await main();
process.exit(0);
