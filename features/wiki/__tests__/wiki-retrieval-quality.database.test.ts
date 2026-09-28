import type { TenantUser } from "@/features/user/user.schema";
import type { WikiSearchResult } from "../wiki.schema";

import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

import { PrismaWikiPageRepo } from "../prisma-wiki-page.repository";
import { SearchWikiPagesInteractor } from "../search-wiki-pages.interactor";
import { WikiMarkdownSchema } from "../wiki.schema";
import { wikiMarkdownSections } from "../wiki-search";
import {
  WIKI_RETRIEVAL_CORPUS,
  WIKI_RETRIEVAL_QUERIES,
  type WikiEvalCategory as EvalCategory,
} from "@/scripts/agent-benchmark/retrieval-eval-cases";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

type Target = { recallAt1: number; recallAt5: number; mrr: number; sectionHitAt1?: number };

const LEGACY_TARGETS: Record<string, Target> = {
  "exact-title": { recallAt1: 1, recallAt5: 1, mrr: 1 },
  inflection: { recallAt1: 1, recallAt5: 1, mrr: 1, sectionHitAt1: 1 },
  typo: { recallAt1: 0.875, recallAt5: 0.875, mrr: 0.875, sectionHitAt1: 1 },
  partial: { recallAt1: 1, recallAt5: 1, mrr: 1 },
  "natural-language": { recallAt1: 1, recallAt5: 1, mrr: 1, sectionHitAt1: 1 },
  "multi-term": { recallAt1: 1, recallAt5: 1, mrr: 1, sectionHitAt1: 1 },
  phrase: { recallAt1: 1, recallAt5: 1, mrr: 1, sectionHitAt1: 1 },
  "cross-language": { recallAt1: 1, recallAt5: 1, mrr: 1 },
  section: { recallAt1: 1, recallAt5: 1, mrr: 1, sectionHitAt1: 1 },
  "rare-term": { recallAt1: 1, recallAt5: 1, mrr: 1, sectionHitAt1: 1 },
  cjk: { recallAt1: 1, recallAt5: 1, mrr: 1, sectionHitAt1: 1 },
  "no-match": { recallAt1: 1, recallAt5: 1, mrr: 1 },
  overall: { recallAt1: 0.985, recallAt5: 0.985, mrr: 0.985, sectionHitAt1: 1 },
};

const UNIFIED_FULL_TEXT_TARGETS: Record<string, Target> = {
  ...LEGACY_TARGETS,
  typo: { recallAt1: 0.375, recallAt5: 0.5, mrr: 0.375, sectionHitAt1: 0 },
  "no-match": { recallAt1: 0.8, recallAt5: 0.8, mrr: 0.8 },
  overall: { recallAt1: 0.925, recallAt5: 0.94, mrr: 0.93, sectionHitAt1: 0.96 },
};

type Metrics = { queries: number; recallAt1: number; recallAt5: number; mrr: number; sectionHitAt1: number | null };

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

describeDatabase("Workspace Wiki retrieval quality", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const userId = randomUUID();
  const user: TenantUser = createMockUser({ id: userId, companyId });
  const markdownByTitle = new Map<string, string>();

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [userId, `wiki-eval-${userId}@example.invalid`, "Wiki", "Evaluator", companyId],
    );
    for (const [index, page] of WIKI_RETRIEVAL_CORPUS.entries()) {
      const markdown = WikiMarkdownSchema.parse(page.markdown);
      markdownByTitle.set(page.title, markdown);
      await client.query(
        'INSERT INTO "WikiPage" ("id", "companyId", "title", "markdown", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, $5)',
        [randomUUID(), companyId, page.title, markdown, new Date(Date.UTC(2026, 0, 1, 0, 0, index))],
      );
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await client.query('DELETE FROM "WikiPage" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  function sectionHit(item: WikiSearchResult, answer: string) {
    const expected = answer.toLocaleLowerCase();
    if (item.snippet.replaceAll("**", "").toLocaleLowerCase().includes(expected)) return true;
    const markdown = markdownByTitle.get(item.title) ?? "";
    const section = wikiMarkdownSections(markdown).find(({ offset }) => offset === (item.offset ?? 0));
    if (!section) return false;
    const text = markdown.slice(section.offset, section.end).replaceAll("**", "").toLocaleLowerCase();
    return text.includes(expected);
  }

  const pipelines: Array<{ pipeline: "legacy" | "unified"; targets: Record<string, Target> }> = [
    { pipeline: "legacy", targets: LEGACY_TARGETS },
    { pipeline: "unified", targets: UNIFIED_FULL_TEXT_TARGETS },
  ];

  it.each(pipelines)(
    "meets the labelled retrieval targets per query category ($pipeline)",
    async ({ pipeline, targets }) => {
      if (pipeline === "legacy") {
        vi.stubEnv("LOCAL_AGENT_BENCHMARK", "true");
        vi.stubEnv("AGENT_BENCHMARK_RETRIEVAL", "legacy");
      }
      expect(WIKI_RETRIEVAL_CORPUS.length).toBeGreaterThanOrEqual(25);
      expect(WIKI_RETRIEVAL_QUERIES.length).toBeGreaterThanOrEqual(40);

      const byCategory = new Map<EvalCategory, Array<{ rank: number; sectionHit: boolean | null; empty: boolean }>>();
      const misses: string[] = [];
      for (const labelled of WIKI_RETRIEVAL_QUERIES) {
        const result = await runWithTenant(user, () =>
          new SearchWikiPagesInteractor(new PrismaWikiPageRepo(), "stored").invoke({
            query: labelled.query,
            page: 1,
            pageSize: 5,
          }),
        );
        if (!result.ok) throw new Error(`Search failed for ${labelled.query}`);
        const titles = result.data.items.map((item) => item.title);
        const rank = titles.findIndex((title) => labelled.expect.includes(title)) + 1;
        const [top] = result.data.items;
        const hit = labelled.answer === undefined ? null : rank === 1 && sectionHit(top, labelled.answer);
        const outcome = { rank, sectionHit: hit, empty: titles.length === 0 };
        byCategory.set(labelled.category, [...(byCategory.get(labelled.category) ?? []), outcome]);
        const passed = labelled.expect.length === 0 ? outcome.empty : rank === 1 && hit !== false;
        if (!passed) misses.push(`${labelled.category} | ${labelled.query} -> ${JSON.stringify(titles.slice(0, 3))}`);
      }

      const metrics = new Map<string, Metrics>();
      const summarize = (
        outcomes: Array<{ rank: number; sectionHit: boolean | null; empty: boolean }>,
        negative = false,
      ) => {
        const sections = outcomes.filter((outcome) => outcome.sectionHit !== null);
        const share = (predicate: (outcome: (typeof outcomes)[number]) => boolean) =>
          round(outcomes.filter(predicate).length / outcomes.length);
        return {
          queries: outcomes.length,
          recallAt1: negative ? share((outcome) => outcome.empty) : share((outcome) => outcome.rank === 1),
          recallAt5: negative ? share((outcome) => outcome.empty) : share((outcome) => outcome.rank >= 1),
          mrr: negative
            ? share((outcome) => outcome.empty)
            : round(
                outcomes.reduce((sum, outcome) => sum + (outcome.rank > 0 ? 1 / outcome.rank : 0), 0) / outcomes.length,
              ),
          sectionHitAt1:
            sections.length === 0
              ? null
              : round(sections.filter((outcome) => outcome.sectionHit).length / sections.length),
        };
      };
      for (const [category, outcomes] of byCategory)
        metrics.set(category, summarize(outcomes, category === "no-match"));
      const positives = [...byCategory.entries()]
        .filter(([category]) => category !== "no-match")
        .flatMap(([, value]) => value);
      metrics.set("overall", summarize(positives));

      vi.unstubAllEnvs();
      const reportPath = process.env.WIKI_RETRIEVAL_EVAL_REPORT;
      if (reportPath) {
        writeFileSync(
          reportPath.replace(/(\.json)?$/, `.${pipeline}.json`),
          JSON.stringify({ pipeline, metrics: Object.fromEntries(metrics), misses }, null, 2),
        );
      }

      for (const [category, target] of Object.entries(targets)) {
        const measured = metrics.get(category);
        expect(measured?.recallAt1, `${category} recall@1; misses: ${misses.join("; ")}`).toBeGreaterThanOrEqual(
          target.recallAt1,
        );
        expect(measured?.recallAt5, `${category} recall@5`).toBeGreaterThanOrEqual(target.recallAt5);
        expect(measured?.mrr, `${category} MRR`).toBeGreaterThanOrEqual(target.mrr);
        if (target.sectionHitAt1 !== undefined)
          expect(measured?.sectionHitAt1, `${category} section-hit@1`).toBeGreaterThanOrEqual(target.sectionHitAt1);
      }
    },
    60_000,
  );
});
