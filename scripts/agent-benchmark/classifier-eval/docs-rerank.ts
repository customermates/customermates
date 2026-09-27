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

import type {
  ClassifierModel,
  ClassifierSpec,
} from "@/ee/agent-chat/classifier";
import type { DocsSection } from "@/features/mcp-tools/docs-retrieval";

import { DOCS_BLIND_BANK } from "./fixtures/docs-blind-bank";

import { readAgentProviderCharge } from "@/ee/agent-chat/gateway-cost";
import {
  buildSectionIndex,
  docsStemmerForLocale,
  scoreSection,
  splitSections,
} from "@/features/mcp-tools/docs-retrieval";
import {
  getDocsPageRaw,
  listDocsSlugs,
  relevantDocsExcerpt,
  searchDocsRaw,
} from "@/features/mcp-tools/docs.mcp-tools";
import { GOLDEN_QUESTIONS } from "@/tests/conventions/fixtures/docs-retrieval-golden";

type Locale = "en" | "de";
type Question = {
  id: string;
  set: "blind" | "golden";
  locale: Locale;
  query: string;
  slug: string;
  alternatives: readonly string[];
};
type Verdict = "yes" | "partial" | "no" | "error";

const LOCALES: Locale[] = ["en", "de"];
const CANDIDATES = 20;
const EXCERPT_CHARS = 1_400;
const OPTION_EXCERPT_CHARS = 400;
const ARMS: ClassifierModel[] = ["jev", "gemini"];
const JUDGE_MODEL = "google/gemini-3-flash";

const questions: Question[] = [
  ...DOCS_BLIND_BANK.map((q, i) => ({
    id: `b${i}`,
    set: "blind" as const,
    locale: q.locale as Locale,
    query: q.query,
    slug: q.slug,
    alternatives: q.alternatives,
  })),
  ...GOLDEN_QUESTIONS.map((q, i) => ({
    id: `g${i}`,
    set: "golden" as const,
    locale: q.locale as Locale,
    query: q.query,
    slug: q.slug,
    alternatives: q.alternatives ?? [],
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

const plain = (value: string) =>
  value
    .replace(/\*\*Link:\*\*.*$/gm, "")
    .replace(/[`*_>#|]/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

const sectionExcerpt = (section: DocsSection) =>
  `## ${section.headingPath.join(" > ")}\n${section.text}`.slice(
    0,
    EXCERPT_CHARS,
  );
const correct = (q: Question, slug: string | undefined) =>
  slug !== undefined && [q.slug, ...q.alternatives].includes(slug);

function keywordCandidates(q: Question) {
  const index = indexes[q.locale];
  return index.sections
    .map((section, id) => ({
      id,
      score: scoreSection(index, section, q.query),
    }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATES)
    .map((hit) => hit.id);
}

function rerankSpec(q: Question, ids: readonly number[]): ClassifierSpec {
  const options = Object.fromEntries(
    ids.map((id) => {
      const s = indexes[q.locale].sections[id]!;
      return [
        `s${id}`,
        `${s.pageTitle} > ${s.headingPath.join(" > ")}: ${plain(s.text).slice(0, OPTION_EXCERPT_CHARS)}`,
      ];
    }),
  );
  return {
    id: "docs-rerank",
    questions: [
      {
        id: "best",
        type: "choice",
        instruction:
          "Which documentation section best answers `question`? If none answers it fully, pick the closest one.",
        options,
      },
    ],
  };
}

type OffRow = {
  id: string;
  slug: string | undefined;
  pageExcerpt: string;
  topSectionExcerpt: string;
  ms: number;
  candidates: number[];
};
type ArmRow = {
  id: string;
  run: number;
  pick: number | null;
  slug: string | undefined;
  sectionExcerpt: string;
  classifierMs: number;
  costMicrocents: number | null;
  failed: boolean;
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
    sectionExcerpt: section ? sectionExcerpt(section) : off.topSectionExcerpt,
    classifierMs: call.ms,
    costMicrocents: call.result?.costMicrocents ?? null,
    failed: !call.result,
  };
}

const JUDGE_CACHE = "docs-judge-cache.json";
const judgeCache = readRaw<Record<string, Verdict>>(JUDGE_CACHE) ?? {};
const JUDGE_SYSTEM =
  "You grade documentation retrieval for the Customermates CRM. You get a user question and the excerpt a search tool returned. Answer `yes` if the excerpt alone contains the information needed to answer the question correctly, or to state clearly that the product cannot do it. Answer `partial` if it is on the right topic but misses the specific fact asked for. Answer `no` otherwise. Do not use outside knowledge.";

async function judge(question: string, excerpt: string): Promise<Verdict> {
  const key = createHash("sha1")
    .update(`${question}\u0000${excerpt}`)
    .digest("hex");
  const cached = judgeCache[key];
  if (cached && cached !== "error") return cached;
  assertBudget();
  try {
    const result = await generateText({
      model: JUDGE_MODEL,
      system: JUDGE_SYSTEM,
      prompt: `QUESTION: ${question}\n\nEXCERPT:\n${excerpt || "(empty)"}`,
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

async function main() {
  const off = Object.fromEntries(questions.map((q) => [q.id, offRow(q)]));
  const armRows: Record<ClassifierModel, ArmRow[]> = { jev: [], gemini: [] };
  const cached = readRaw<Record<ClassifierModel, ArmRow[]>>("docs-arms.json");
  for (const model of ARMS) {
    if (
      cached?.[model]?.length === questions.length * RUNS &&
      !process.env.FRESH
    ) {
      armRows[model] = cached[model];
      continue;
    }
    const tasks = Array.from({ length: RUNS }, (_, run) =>
      questions.map((q) => ({ q, run })),
    ).flat();
    armRows[model] = await pool(tasks, 4, ({ q, run }) =>
      armRow(q, off[q.id]!, model, run),
    );
    writeRaw("docs-arms.json", armRows);
    console.log(model, "done, spend", spentUsd().toFixed(4));
  }

  const blind = questions.filter((q) => q.set === "blind");
  const judgements = new Map<string, Verdict>();
  const judgeItems: { key: string; question: string; excerpt: string }[] = [];
  for (const q of blind) {
    judgeItems.push({
      key: `off-page:${q.id}`,
      question: q.query,
      excerpt: off[q.id]!.pageExcerpt,
    });
    judgeItems.push({
      key: `off-section:${q.id}`,
      question: q.query,
      excerpt: off[q.id]!.topSectionExcerpt,
    });
    for (const model of ARMS)
      for (const row of armRows[model].filter((r) => r.id === q.id))
        judgeItems.push({
          key: `${model}:${row.run}:${q.id}`,
          question: q.query,
          excerpt: row.sectionExcerpt,
        });
  }
  await pool(judgeItems, 8, async (item) => {
    judgements.set(item.key, await judge(item.question, item.excerpt));
  });
  writeRaw(JUDGE_CACHE, judgeCache);

  const perLanguage: Record<string, unknown> = {};
  const gates: Record<string, unknown> = {};
  for (const set of ["blind", "golden"] as const)
    for (const locale of LOCALES) {
      const qs = questions.filter((q) => q.set === set && q.locale === locale);
      const offFirst = qs.filter((q) => correct(q, off[q.id]!.slug)).length;
      const entry: Record<string, unknown> = {
        n: qs.length,
        off: {
          pageFirst: offFirst,
          pageFirstPct: pct(offFirst, qs.length),
          ...(set === "blind"
            ? {
                pageExcerptYesPct: pct(
                  qs.filter((q) => judgements.get(`off-page:${q.id}`) === "yes")
                    .length,
                  qs.length,
                ),
                topSectionYesPct: pct(
                  qs.filter(
                    (q) => judgements.get(`off-section:${q.id}`) === "yes",
                  ).length,
                  qs.length,
                ),
              }
            : {}),
          keywordMsP50: round(
            percentile(
              qs.map((q) => off[q.id]!.ms),
              0.5,
            ),
          ),
          keywordMsP95: round(
            percentile(
              qs.map((q) => off[q.id]!.ms),
              0.95,
            ),
          ),
        },
      };
      for (const model of ARMS) {
        const rows = armRows[model].filter((r) =>
          qs.some((q) => q.id === r.id),
        );
        const perRun = Array.from(
          { length: RUNS },
          (_, run) =>
            qs.filter((q) =>
              correct(
                q,
                rows.find((r) => r.id === q.id && r.run === run)?.slug,
              ),
            ).length,
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
        const meanPageFirstPct =
          (100 * perRun.reduce((a, b) => a + b, 0)) / RUNS / qs.length;
        const ms = rows.map((r) => r.classifierMs);
        const costs = rows
          .map((r) => r.costMicrocents)
          .filter((c): c is number => c !== null);
        const sectionYes =
          set === "blind"
            ? Array.from(
                { length: RUNS },
                (_, run) =>
                  qs.filter(
                    (q) => judgements.get(`${model}:${run}:${q.id}`) === "yes",
                  ).length,
              )
            : null;
        entry[model] = {
          pageFirstPerRun: perRun,
          pageFirstMeanPct: round(meanPageFirstPct),
          deltaPts: round(meanPageFirstPct - (100 * offFirst) / qs.length),
          majorityWins: wins,
          majorityLosses: losses,
          signTestP: Number(signTestP(wins, losses).toPrecision(3)),
          ...(sectionYes
            ? {
                sectionYesPerRun: sectionYes,
                sectionYesMeanPct: round(
                  (100 * sectionYes.reduce((a, b) => a + b, 0)) /
                    RUNS /
                    qs.length,
                ),
              }
            : {}),
          addedMsP50: round(percentile(ms, 0.5)),
          addedMsP95: round(percentile(ms, 0.95)),
          failedCalls: rows.filter((r) => r.failed).length,
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
        if (set === "blind") {
          const key = `${model}:${locale}`;
          const e = entry[model] as {
            deltaPts: number;
            signTestP: number;
            addedMsP95: number;
          };
          gates[key] = {
            deltaPts: e.deltaPts,
            signTestP: e.signTestP,
            addedMsP95: e.addedMsP95,
            pass: e.deltaPts >= 5 && e.signTestP < 0.05 && e.addedMsP95 <= 1000,
          };
        }
      }
      perLanguage[`${set}:${locale}`] = entry;
    }

  const sample = blind
    .filter((_, i) => i % 6 === 0)
    .map((q) => ({
      id: q.id,
      query: q.query,
      excerpt: armRows.jev.find((r) => r.id === q.id && r.run === 0)!
        .sectionExcerpt,
      verdict: judgements.get(`jev:0:${q.id}`),
    }));
  writeRaw("docs-judge-sample.json", sample);
  const verdictErrors = [...judgements.values()].filter(
    (v) => v === "error",
  ).length;
  writeReport("docs-rerank.json", {
    rule: "Gate per language on the blind bank: mean page-first gain >= 5 points over the shipped ranker, two-sided sign test on per-question majority outcomes (3 runs) p < 0.05, and classifier p95 <= 1000 ms. Timed-out or failed calls fall back to the shipped ranker's top section and count as such.",
    deadlines: { jevMs: 800, geminiMs: 2000 },
    judge: {
      model: JUDGE_MODEL,
      providerOptions: "vertex, thinking low, ZDR, no training",
      verdictErrors,
    },
    offlineTimeoutMs: OFFLINE_TIMEOUT_MS,
    perLanguage,
    gates,
    spendSoFarUsd: Number(spentUsd().toFixed(4)),
    spendByUse: spendByUse(),
  });
  console.log(JSON.stringify({ gates }, null, 2));
}

await main();
