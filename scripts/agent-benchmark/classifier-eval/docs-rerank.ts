import {
  OFFLINE_TIMEOUT_MS,
  RUNS,
  chargeCall,
  assertBudget,
  majority,
  percentile,
  pool,
  readRaw,
  runClassifier,
  signTestP,
  spendByUse,
  spentUsd,
  writeRaw,
  writeReport,
} from "./shared";

import { createHash } from "node:crypto";

import { generateText, jsonSchema, Output } from "ai";

import type { ClassifierModel } from "@/ee/agent-chat/classifier";
import type { DocsSection } from "@/features/mcp-tools/docs-retrieval";
import type { ContentLocale } from "@/i18n/locale-registry";

import { DOCS_BLIND_BANK } from "./fixtures/docs-blind-bank";
import {
  DOCS_BLIND_BANK_EN_2,
  DOCS_BLIND_BANK_EN_2_PROVENANCE,
} from "./fixtures/docs-blind-bank-en-2";

import { docsRerankSpec } from "@/ee/agent-chat/docs-rerank";
import { readAgentProviderCharge } from "@/ee/agent-chat/gateway-cost";
import {
  buildSectionIndex,
  docsStemmerForLocale,
  splitSections,
} from "@/features/mcp-tools/docs-retrieval";
import {
  DOCS_RERANK_CANDIDATES,
  docsRerankExcerpt,
  getDocsPageRaw,
  listDocsSlugs,
  relevantDocsExcerpt,
  searchDocsRaw,
  topSectionCandidates,
} from "@/features/mcp-tools/docs.mcp-tools";
import { CONTENT_LOCALES } from "@/i18n/locale-registry";
import { GOLDEN_QUESTIONS } from "@/tests/conventions/fixtures/docs-retrieval-golden";

type Locale = ContentLocale;
type QuestionSet = "blind" | "blind2" | "golden";
type Question = {
  id: string;
  set: QuestionSet;
  locale: Locale;
  query: string;
  slug: string;
  alternatives: readonly string[];
  anchors: readonly string[];
  fact: string | null;
};
type Verdict = "yes" | "partial" | "no" | "error";

const LOCALES: readonly Locale[] = CONTENT_LOCALES;
const CANDIDATES = DOCS_RERANK_CANDIDATES;
const ARMS: ClassifierModel[] = ["jev", "gemini"];
const JUDGE_MODEL = "google/gemini-3-flash";
const REUSED_LOCALES: Locale[] = process.env.FRESH_DE ? [] : ["de"];
const PREVIOUS_ARMS = "docs-arms.json";
const ARMS_FILE = "docs-arms-en-extended.json";
const REPORT_FILE = "docs-rerank-en-extended.json";

const questions: Question[] = [
  ...DOCS_BLIND_BANK.map((q, i) => ({
    id: `b${i}`,
    set: "blind" as const,
    locale: q.locale as Locale,
    query: q.query,
    slug: q.slug,
    alternatives: q.alternatives,
    anchors: [],
    fact: null,
  })),
  ...DOCS_BLIND_BANK_EN_2.map((q, i) => ({
    id: `n${i}`,
    set: "blind2" as const,
    locale: "en" as const,
    query: q.query,
    slug: q.slug,
    alternatives: q.alternatives,
    anchors: q.anchors,
    fact: q.fact,
  })),
  ...GOLDEN_QUESTIONS.map((q, i) => ({
    id: `g${i}`,
    set: "golden" as const,
    locale: q.locale as Locale,
    query: q.query,
    slug: q.slug,
    alternatives: q.alternatives ?? [],
    anchors: [],
    fact: null,
  })),
].filter((_, i) => !process.env.SMOKE || i % 40 === 0);

const sections: Record<Locale, DocsSection[]> = { en: [], de: [] };
const indexes = Object.fromEntries(
  LOCALES.map((locale) => {
    sections[locale] = listDocsSlugs(locale, "docs").flatMap((slug) => {
      const page = getDocsPageRaw(slug, locale, "docs")!;
      return splitSections({
        slug,
        source: "docs",
        pageTitle: page.title,
        markdown: page.markdown,
      });
    });
    return [
      locale,
      buildSectionIndex(sections[locale], docsStemmerForLocale(locale)),
    ];
  }),
) as Record<Locale, ReturnType<typeof buildSectionIndex>>;

const sectionExcerpt = docsRerankExcerpt;
const sectionKey = (section: DocsSection) =>
  `${section.slug}#${section.anchor}`;
const correct = (q: Question, slug: string | undefined) =>
  slug !== undefined && [q.slug, ...q.alternatives].includes(slug);
const anchorHit = (q: Question, section: string | null) =>
  section !== null && q.anchors.includes(section);

function keywordCandidates(q: Question) {
  return topSectionCandidates(indexes[q.locale], q.query, CANDIDATES).map(
    (hit) => hit.id,
  );
}

function rerankSpec(q: Question, ids: readonly number[]) {
  return docsRerankSpec(
    ids.map((id) => ({ id, section: indexes[q.locale].sections[id]! })),
  );
}

type OffRow = {
  id: string;
  slug: string | undefined;
  pageExcerpt: string;
  topSection: string | null;
  topSectionExcerpt: string;
  ms: number;
  candidates: number[];
};
type ArmRow = {
  id: string;
  run: number;
  pick: number | null;
  slug: string | undefined;
  section: string | null;
  sectionExcerpt: string;
  classifierMs: number;
  costMicrocents: number | null;
  failed: boolean;
  reused?: boolean;
};

function offRow(q: Question): OffRow {
  const started = performance.now();
  const { results } = searchDocsRaw(q.query, q.locale, "docs");
  const ms = performance.now() - started;
  const slug = results[0]?.slug;
  const candidates = keywordCandidates(q);
  const top =
    candidates[0] === undefined
      ? null
      : indexes[q.locale].sections[candidates[0]]!;
  return {
    id: q.id,
    slug,
    pageExcerpt: slug
      ? relevantDocsExcerpt({ source: "docs", locale: q.locale, slug }, q.query)
      : "",
    topSection: top ? sectionKey(top) : null,
    topSectionExcerpt: top ? sectionExcerpt(top) : "",
    ms,
    candidates,
  };
}

async function armRow(
  q: Question,
  off: OffRow,
  model: ClassifierModel,
  run: number,
): Promise<ArmRow> {
  if (off.candidates.length === 0)
    return {
      id: q.id,
      run,
      pick: null,
      slug: off.slug,
      section: off.topSection,
      sectionExcerpt: off.topSectionExcerpt,
      classifierMs: 0,
      costMicrocents: null,
      failed: false,
    };
  const call = await runClassifier(
    `docs:${model}`,
    rerankSpec(q, off.candidates),
    { question: q.query },
    model,
  );
  const answer = call.result?.answers.best;
  const pick =
    answer?.type === "choice" ? Number(answer.choice.slice(1)) : null;
  const section = pick === null ? null : indexes[q.locale].sections[pick]!;
  return {
    id: q.id,
    run,
    pick,
    slug: section ? section.slug : off.slug,
    section: section ? sectionKey(section) : off.topSection,
    sectionExcerpt: section ? sectionExcerpt(section) : off.topSectionExcerpt,
    classifierMs: call.ms,
    costMicrocents: call.result?.costMicrocents ?? null,
    failed: !call.result,
  };
}

function reusedRow(
  q: Question,
  off: OffRow,
  previous: ArmRow | undefined,
): ArmRow | null {
  if (!previous) return null;
  const section =
    previous.pick === null ? null : indexes[q.locale].sections[previous.pick]!;
  return {
    ...previous,
    section: section ? sectionKey(section) : off.topSection,
    reused: true,
  };
}

const JUDGE_CACHE = "docs-judge-cache.json";
const judgeCache = readRaw<Record<string, Verdict>>(JUDGE_CACHE) ?? {};
const JUDGE_SYSTEM =
  "You grade documentation retrieval for the Customermates CRM. You get a user question and the excerpt a search tool returned. Answer `yes` if the excerpt alone contains the information needed to answer the question correctly, or to state clearly that the product cannot do it. Answer `partial` if it is on the right topic but misses the specific fact asked for. Answer `no` otherwise. Do not use outside knowledge.";
const JUDGE_FACT_SYSTEM =
  "You grade documentation retrieval for the Customermates CRM. You get a user question, a reference answer, and the excerpt a search tool returned. Answer `yes` if the excerpt alone states the reference answer or everything needed to derive it. Answer `partial` if it is on the right topic but misses part of the reference answer. Answer `no` otherwise. Do not use outside knowledge.";

async function judge(
  question: string,
  excerpt: string,
  fact: string | null,
): Promise<Verdict> {
  const key = createHash("sha1")
    .update(
      fact === null
        ? `${question}\u0000${excerpt}`
        : `fact\u0000${question}\u0000${fact}\u0000${excerpt}`,
    )
    .digest("hex");
  const cached = judgeCache[key];
  if (cached && cached !== "error") return cached;
  assertBudget();
  try {
    const result = await generateText({
      model: JUDGE_MODEL,
      system: fact === null ? JUDGE_SYSTEM : JUDGE_FACT_SYSTEM,
      prompt:
        fact === null
          ? `QUESTION: ${question}\n\nEXCERPT:\n${excerpt || "(empty)"}`
          : `QUESTION: ${question}\n\nREFERENCE ANSWER: ${fact}\n\nEXCERPT:\n${excerpt || "(empty)"}`,
      output: Output.object({
        schema: jsonSchema<{ verdict: "yes" | "partial" | "no" }>({
          type: "object",
          properties: {
            verdict: { type: "string", enum: ["yes", "partial", "no"] },
          },
          required: ["verdict"],
          additionalProperties: false,
        }),
      }),
      temperature: 0,
      maxRetries: 2,
      providerOptions: {
        gateway: {
          only: ["vertex"],
          zeroDataRetention: true,
          disallowPromptTraining: true,
        },
        vertex: { thinkingConfig: { thinkingLevel: "low" } },
      },
    });
    const charge = readAgentProviderCharge(result.providerMetadata, "vertex");
    chargeCall(
      "docs:judge",
      JUDGE_MODEL,
      charge.outcome === "measured" ? charge.charge.costMicrocents : null,
    );
    judgeCache[key] = result.output.verdict;
  } catch {
    judgeCache[key] = "error";
  }
  return judgeCache[key]!;
}

const round = (value: number | null, digits = 1) =>
  value === null ? null : Number(value.toFixed(digits));
const pct = (n: number, d: number) => round((100 * n) / d);
const meanPct = (perRun: number[], n: number) =>
  round((100 * perRun.reduce((a, b) => a + b, 0)) / RUNS / n);

type GateInput = { deltaPts: number; signTestP: number; addedMsP95: number };

function summarizeSet(
  qs: Question[],
  off: Record<string, OffRow>,
  armRows: Record<ClassifierModel, ArmRow[]>,
  judgements: Map<string, Verdict>,
) {
  const judged = qs.every((q) => q.set !== "golden");
  const anchored = qs.every((q) => q.anchors.length > 0);
  const offFirst = qs.filter((q) => correct(q, off[q.id]!.slug)).length;
  const yesCount = (key: (q: Question) => string) =>
    qs.filter((q) => judgements.get(key(q)) === "yes").length;
  const keywordMs = qs.map((q) => off[q.id]!.ms);
  const entry: Record<string, unknown> = {
    n: qs.length,
    off: {
      pageFirst: offFirst,
      pageFirstPct: pct(offFirst, qs.length),
      ...(judged
        ? {
            pageExcerptYesPct: pct(
              yesCount((q) => `off-page:${q.id}`),
              qs.length,
            ),
            topSectionYesPct: pct(
              yesCount((q) => `off-section:${q.id}`),
              qs.length,
            ),
          }
        : {}),
      ...(anchored
        ? {
            topSectionAnchorPct: pct(
              qs.filter((q) => anchorHit(q, off[q.id]!.topSection)).length,
              qs.length,
            ),
          }
        : {}),
      keywordMsP50: round(percentile(keywordMs, 0.5)),
      keywordMsP95: round(percentile(keywordMs, 0.95)),
    },
  };
  const gates: Record<string, GateInput> = {};
  for (const model of ARMS) {
    const ids = new Set(qs.map((q) => q.id));
    const rows = armRows[model].filter((r) => ids.has(r.id));
    const row = (q: Question, run: number) =>
      rows.find((r) => r.id === q.id && r.run === run);
    const perRun = Array.from(
      { length: RUNS },
      (_, run) => qs.filter((q) => correct(q, row(q, run)?.slug)).length,
    );
    const majorityCorrect = qs.map((q) =>
      majority(
        rows.filter((r) => r.id === q.id).map((r) => correct(q, r.slug)),
      ),
    );
    const wins = qs.filter(
      (q, i) => majorityCorrect[i] && !correct(q, off[q.id]!.slug),
    ).length;
    const losses = qs.filter(
      (q, i) => !majorityCorrect[i] && correct(q, off[q.id]!.slug),
    ).length;
    const pageFirstMeanPct = meanPct(perRun, qs.length)!;
    const deltaPts = round(pageFirstMeanPct - (100 * offFirst) / qs.length)!;
    const ms = rows.map((r) => r.classifierMs);
    const costs = rows
      .map((r) => r.costMicrocents)
      .filter((c): c is number => c !== null);
    const sectionYes = judged
      ? Array.from({ length: RUNS }, (_, run) =>
          yesCount((q) => `${model}:${run}:${q.id}`),
        )
      : null;
    const anchorHits = anchored
      ? Array.from(
          { length: RUNS },
          (_, run) =>
            qs.filter((q) => anchorHit(q, row(q, run)?.section ?? null))
              .length,
        )
      : null;
    const signP = Number(signTestP(wins, losses).toPrecision(3));
    const addedMsP95 = round(percentile(ms, 0.95))!;
    entry[model] = {
      pageFirstPerRun: perRun,
      pageFirstMeanPct,
      deltaPts,
      majorityWins: wins,
      majorityLosses: losses,
      signTestP: signP,
      ...(sectionYes
        ? {
            sectionYesPerRun: sectionYes,
            sectionYesMeanPct: meanPct(sectionYes, qs.length),
          }
        : {}),
      ...(anchorHits
        ? {
            sectionAnchorPerRun: anchorHits,
            sectionAnchorMeanPct: meanPct(anchorHits, qs.length),
          }
        : {}),
      addedMsP50: round(percentile(ms, 0.5)),
      addedMsP95,
      failedCalls: rows.filter((r) => r.failed).length,
      reusedRows: rows.filter((r) => r.reused).length,
      usdPerQueryMeasured: costs.length
        ? Number(
            (
              costs.reduce((a, b) => a + b, 0) /
              costs.length /
              1e8
            ).toPrecision(3),
          )
        : null,
    };
    gates[model] = { deltaPts, signTestP: signP, addedMsP95 };
  }
  return { entry, gates };
}

const passes = (g: GateInput) =>
  g.deltaPts >= 5 && g.signTestP < 0.05 && g.addedMsP95 <= 1000;

async function collectArms(off: Record<string, OffRow>) {
  const previous = readRaw<Record<ClassifierModel, ArmRow[]>>(PREVIOUS_ARMS);
  const stored = readRaw<Record<string, ArmRow>>(ARMS_FILE) ?? {};
  const armRows: Record<ClassifierModel, ArmRow[]> = { jev: [], gemini: [] };
  let sinceSave = 0;
  try {
    for (const model of ARMS) {
      const tasks = Array.from({ length: RUNS }, (_, run) =>
        questions.map((q) => ({ q, run })),
      ).flat();
      armRows[model] = await pool(tasks, 4, async ({ q, run }) => {
        const key = `${model}:${q.id}:${run}`;
        const stale = process.env.FRESH && !stored[key]?.reused;
        if (stored[key] && !stale) return stored[key];
        const reused = REUSED_LOCALES.includes(q.locale)
          ? reusedRow(
              q,
              off[q.id]!,
              previous?.[model]?.find((r) => r.id === q.id && r.run === run),
            )
          : null;
        const row = reused ?? (await armRow(q, off[q.id]!, model, run));
        stored[key] = row;
        if (++sinceSave >= 50) {
          sinceSave = 0;
          writeRaw(ARMS_FILE, stored);
        }
        return row;
      });
      console.log(model, "done, spend", spentUsd().toFixed(4));
    }
  } finally {
    writeRaw(ARMS_FILE, stored);
  }
  return armRows;
}

async function main() {
  const off = Object.fromEntries(questions.map((q) => [q.id, offRow(q)]));
  const armRows = await collectArms(off);

  const judgements = new Map<string, Verdict>();
  const judgeItems: {
    key: string;
    question: Question;
    excerpt: string;
  }[] = [];
  for (const q of questions.filter((item) => item.set !== "golden")) {
    judgeItems.push({
      key: `off-page:${q.id}`,
      question: q,
      excerpt: off[q.id]!.pageExcerpt,
    });
    judgeItems.push({
      key: `off-section:${q.id}`,
      question: q,
      excerpt: off[q.id]!.topSectionExcerpt,
    });
    for (const model of ARMS)
      for (const row of armRows[model].filter((r) => r.id === q.id))
        judgeItems.push({
          key: `${model}:${row.run}:${q.id}`,
          question: q,
          excerpt: row.sectionExcerpt,
        });
  }
  try {
    await pool(judgeItems, 8, async (item) => {
      judgements.set(
        item.key,
        await judge(item.question.query, item.excerpt, item.question.fact),
      );
    });
  } finally {
    writeRaw(JUDGE_CACHE, judgeCache);
  }

  const pick = (filter: (q: Question) => boolean) => questions.filter(filter);
  const perLocale = (name: string, filter: (q: Question) => boolean) =>
    Object.fromEntries(
      LOCALES.map((locale) => [
        `${name}:${locale}`,
        pick((q) => q.locale === locale && filter(q)),
      ]),
    );
  const groups: Record<string, Question[]> = {
    ...perLocale("blind", (q) => q.set === "blind"),
    "blind2:en": pick((q) => q.set === "blind2"),
    ...perLocale("blindAll", (q) => q.set !== "golden"),
    "blindAll:pooled": pick((q) => q.set !== "golden"),
    ...perLocale("golden", (q) => q.set === "golden"),
  };
  const perSet: Record<string, unknown> = {};
  const gates: Record<string, GateInput & { pass: boolean }> = {};
  const gatedSets: Record<string, string> = {
    ...Object.fromEntries(LOCALES.map((locale) => [locale, `blindAll:${locale}`])),
    pooled: "blindAll:pooled",
    enNewOnly: "blind2:en",
  };
  for (const [name, qs] of Object.entries(groups)) {
    if (qs.length === 0) continue;
    const { entry, gates: setGates } = summarizeSet(
      qs,
      off,
      armRows,
      judgements,
    );
    perSet[name] = entry;
    for (const [label, set] of Object.entries(gatedSets))
      if (set === name)
        for (const model of ARMS)
          gates[`${model}:${label}`] = {
            ...setGates[model]!,
            pass: passes(setGates[model]!),
          };
  }

  const verdictErrors = [...judgements.values()].filter(
    (v) => v === "error",
  ).length;
  writeReport(REPORT_FILE, {
    rule: "Unchanged gate per language on the blind bank: mean page-first gain >= 5 points over the shipped ranker, two-sided sign test on per-question majority outcomes (3 runs) p < 0.05, and classifier p95 <= 1000 ms. English is gated on the 60 original plus 120 new questions; German on its 60 questions. Timed-out or failed calls fall back to the shipped ranker's top section and count as such.",
    bank: {
      original: "fixtures/docs-blind-bank.ts (60 en, 60 de)",
      extension: "fixtures/docs-blind-bank-en-2.ts (120 en)",
      provenance: DOCS_BLIND_BANK_EN_2_PROVENANCE,
    },
    reuse: REUSED_LOCALES.length
      ? `Rows for ${REUSED_LOCALES.join(", ")} are reused from the first run (${PREVIOUS_ARMS}); every English row is fresh.`
      : "Every row is fresh.",
    deadlines: { jevMs: 800, geminiMs: 2000 },
    candidates: CANDIDATES,
    judge: {
      model: JUDGE_MODEL,
      providerOptions: "vertex, thinking low, ZDR, no training",
      originalBank: "question only",
      extension: "question plus the labelled reference fact",
      verdictErrors,
    },
    offlineTimeoutMs: OFFLINE_TIMEOUT_MS,
    perSet,
    gates,
    spendThisCampaignUsd: Number(spentUsd().toFixed(4)),
    spendByUse: spendByUse(),
  });
  console.log(JSON.stringify({ gates }, null, 2));
}

await main();
