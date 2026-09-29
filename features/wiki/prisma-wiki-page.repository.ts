import { detectedWikiLanguage, dominantWikiLanguageFromCounts, WIKI_LANGUAGE_SAMPLE_CHARACTERS } from "./wiki-language";
import type { RepoArgs } from "@/core/utils/types";
import type { CreateWikiPagesRepo } from "./create-wiki-pages.interactor";
import type { DeleteWikiPageRepo } from "./delete-wiki-page.interactor";
import type { GetWikiPageRepo } from "./get-wiki-page.interactor";
import type { GetWikiPagesRepo } from "./get-wiki-pages.interactor";
import type { GetWikiCatalogRepo } from "./get-wiki-catalog.interactor";
import type {
  SearchWikiPagesRepo,
  WikiFullTextCandidates,
  WikiSemanticCandidate,
} from "./search-wiki-pages.interactor";
import type { UpdateWikiPageRepo } from "./update-wiki-page.interactor";
import type { StartWikiHomepageSetupRepo } from "./start-wiki-homepage-setup.interactor";
import type { WikiPageDto } from "./wiki.schema";
import type { WikiSemanticChunk } from "./wiki-chunks";
import type { WikiSemanticIndexPage, WikiSemanticIndexRepo } from "@/ee/wiki-retrieval/wiki-semantic-index.service";

import { Prisma } from "@/generated/prisma";

import {
  fullTextUnits,
  fullTextUnitsCte,
  idfWeight,
  replaceQueryWords,
  substringUnits,
  textSearchConfigFor,
  typoCandidates,
  type FullTextUnit,
} from "@/core/retrieval/full-text-query";

import { RETRIEVAL_SEMANTIC_MIN_SIMILARITY } from "@/core/retrieval/retrieval-pipeline";
import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { WIKI_CATALOG_PAGE_SIZE, wikiPageKindFields, wikiPageKindIssue } from "./wiki.schema";
import { WIKI_EXCERPT_MAX_LENGTH } from "./wiki-content";
import { wikiIdentifierPattern, wikiIdentifierTerms } from "./wiki-identifiers";

const WIKI_IDENTIFIER_MAX_PAGES = 3;
const WIKI_SEMANTIC_STALE_LIMIT = 1_000;
const WIKI_SEMANTIC_CLAIM_SECONDS = 300;
const WIKI_SEMANTIC_INTRO_MARGIN = 0.03;
const WIKI_FULL_TEXT_CONFIGS = ["english", "german", "spanish", "french", "italian"] as const;
const WIKI_TITLE_WEIGHT = 2;
const WIKI_TYPO_PREFIX = 3;
const WIKI_TYPO_LENGTH_SLACK = 2;
const WIKI_TYPO_MIN_SIMILARITY = 0.4;
const WIKI_TYPO_TRANSPOSITION_MIN_LENGTH = 5;
const WIKI_TYPO_PAGE_LIMIT = 200;
const WIKI_HEADLINE_OPTIONS = "StartSel=**, StopSel=**, MaxWords=35, MinWords=15";
const WIKI_SHORT_HEADLINE_OPTIONS = "StartSel=**, StopSel=**, HighlightAll=true";

let semanticIndexColumn: Promise<boolean> | undefined;

export class PrismaWikiPageRepo
  extends BaseRepository<Prisma.WikiPageWhereInput>
  implements
    GetWikiPagesRepo,
    GetWikiCatalogRepo,
    SearchWikiPagesRepo,
    GetWikiPageRepo,
    CreateWikiPagesRepo,
    UpdateWikiPageRepo,
    DeleteWikiPageRepo,
    StartWikiHomepageSetupRepo,
    WikiSemanticIndexRepo
{
  private get pageSelect() {
    return {
      id: true,
      title: true,
      markdown: true,
      kind: true,
      whenToUse: true,
      draft: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  private get summarySelect() {
    return {
      id: true,
      title: true,
      kind: true,
      whenToUse: true,
      draft: true,
      createdAt: true,
      updatedAt: true,
    } as const;
  }

  private async guideExists(exceptId?: string) {
    return (
      (await this.prisma.wikiPage.count({
        where: { companyId: this.companyId, kind: "guide", ...(exceptId ? { id: { not: exceptId } } : {}) },
      })) > 0
    );
  }

  async listPages({ page, pageSize, kind }: RepoArgs<GetWikiPagesRepo, "listPages">) {
    const where = { companyId: this.companyId, ...(kind ? { kind } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.wikiPage.findMany({
        where,
        select: this.summarySelect,
        orderBy: [{ kind: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.wikiPage.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async semanticPageCandidates(vector: number[], model: string, limit: number) {
    if (!(await this.semanticIndexAvailable())) return null;
    const embedding = `[${vector.join(",")}]`;
    const [candidates, stale] = await Promise.all([
      this.prisma.$queryRaw<WikiSemanticCandidate[]>(Prisma.sql`
        WITH distances AS MATERIALIZED (
          SELECT c."pageId", c."offset", c."ordinal", c."embedding" <=> ${embedding}::vector AS "distance"
          FROM "WikiPageChunk" c
          JOIN "WikiPage" p ON p."id" = c."pageId" AND p."updatedAt" = c."pageUpdatedAt"
          WHERE c."companyId" = ${this.companyId} AND c."model" = ${model} AND c."embedding" IS NOT NULL
        ),
        pages AS (
          SELECT "pageId", min("distance") AS "distance" FROM distances GROUP BY "pageId"
        ),
        sections AS (
          SELECT DISTINCT ON ("pageId") "pageId", "offset"
          FROM distances
          ORDER BY "pageId", "distance" + CASE WHEN "ordinal" = 0 THEN ${WIKI_SEMANTIC_INTRO_MARGIN}::float8 ELSE 0 END,
            "ordinal"
        )
        SELECT p."pageId" AS "id", s."offset", (1 - p."distance")::float8 AS "similarity"
        FROM pages p
        JOIN sections s ON s."pageId" = p."pageId"
        WHERE p."distance" <= ${1 - RETRIEVAL_SEMANTIC_MIN_SIMILARITY}
        ORDER BY p."distance", p."pageId"
        LIMIT ${limit}
      `),
      this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT p."id" FROM "WikiPage" p
        WHERE p."companyId" = ${this.companyId} AND ${this.staleSemanticPage(model)}
        LIMIT ${WIKI_SEMANTIC_STALE_LIMIT}
      `),
    ]);
    return { candidates, stalePageIds: new Set(stale.map(({ id }) => id)) };
  }

  private get fullTextStopConfig() {
    return textSearchConfigFor(this.user.displayLanguage);
  }

  private fullTextUnitsCte(units: readonly FullTextUnit[]) {
    return fullTextUnitsCte({ units, configs: WIKI_FULL_TEXT_CONFIGS, stopConfig: this.fullTextStopConfig });
  }

  async fullTextPageCandidates(text: string, limit: number): Promise<WikiFullTextCandidates> {
    const identifiers = wikiIdentifierTerms(text);
    const [ranked, pinned] = await Promise.all([
      this.rankedFullTextPages(text, limit),
      identifiers.length === 0
        ? Promise.resolve([])
        : this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT m."id" FROM (
            SELECT p."id", terms."ord", count(*) OVER (PARTITION BY terms."ord") AS "pages"
            FROM "WikiPage" p
            JOIN unnest(${identifiers.map(wikiIdentifierPattern)}::text[]) WITH ORDINALITY AS terms("pattern", "ord")
              ON p."searchCompact" ~ terms."pattern"
            WHERE p."companyId" = ${this.companyId}
          ) AS m
          WHERE m."pages" <= ${WIKI_IDENTIFIER_MAX_PAGES}::int
          ORDER BY m."ord", m."id"
        `),
    ]);
    const pinnedIds = [...new Set(pinned.map(({ id }) => id))];
    const corrections = await this.typoCorrections(typoCandidates(ranked.units, ranked.matched));
    if (corrections.size === 0) return { keys: ranked.ids, pinned: pinnedIds, coverage: ranked.coverage };
    const corrected = replaceQueryWords(text, corrections);
    const retried = await this.rankedFullTextPages(corrected, limit);
    return { keys: retried.ids, pinned: pinnedIds, coverage: retried.coverage, corrected };
  }

  private async rankedFullTextPages(text: string, limit: number) {
    const units = fullTextUnits(text);
    if (units.length === 0) return { units, ids: [], coverage: 0, matched: new Set<number>() };
    const substrings = substringUnits(units);
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string | null; coverage: number | null; matched: number[] | null }>
    >(Prisma.sql`
      WITH ${this.fullTextUnitsCte(units)},
      "substringUnits" AS (
        SELECT * FROM unnest(${substrings.map(({ text: term }) => term)}::text[], ${substrings.map(({ ord }) => ord)}::int[])
          AS sub("term", "ord")
      ),
      hits AS MATERIALIZED (
        SELECT p."id", u."ord", bool_or(ts_filter(p."searchVector", '{a}'::"char"[]) @@ u."query") AS "title"
        FROM "WikiPage" p JOIN units u ON p."searchVector" @@ u."query"
        WHERE p."companyId" = ${this.companyId}
        GROUP BY p."id", u."ord"
        UNION ALL
        SELECT p."id", t."ord", bool_or(strpos(lower(p."title"), t."term") > 0)
        FROM "WikiPage" p
        JOIN "substringUnits" t ON strpos(lower(p."title"), t."term") > 0 OR strpos(lower(p."markdown"), t."term") > 0
        WHERE p."companyId" = ${this.companyId}
        GROUP BY p."id", t."ord"
      ),
      frequency AS MATERIALIZED (SELECT h."ord", count(*)::float8 AS "pages" FROM hits h GROUP BY h."ord"),
      total AS (SELECT count(*)::float8 AS "pages" FROM "WikiPage" WHERE "companyId" = ${this.companyId}),
      weights AS (
        SELECT q."ord", ${idfWeight(Prisma.sql`t."pages"`, Prisma.sql`coalesce(f."pages", 0)`)} AS "weight"
        FROM (SELECT u."ord" FROM units u UNION SELECT sub."ord" FROM "substringUnits" sub) AS q
        CROSS JOIN total t LEFT JOIN frequency f ON f."ord" = q."ord"
      ),
      "queryWeight" AS (SELECT sum(w."weight") AS "weight" FROM weights w),
      scored AS (
        SELECT h."id", round(sum(${idfWeight(Prisma.sql`t."pages"`, Prisma.sql`f."pages"`)}
          * CASE WHEN h."title" THEN ${WIKI_TITLE_WEIGHT}::float8 ELSE 1 END)::numeric, 9) AS "score",
          (sum(w."weight") / nullif(max(q."weight"), 0))::float8 AS "coverage"
        FROM hits h JOIN frequency f ON f."ord" = h."ord" JOIN weights w ON w."ord" = h."ord"
          CROSS JOIN total t CROSS JOIN "queryWeight" q
        GROUP BY h."id"
      ),
      ranked AS (
        SELECT s."id", s."coverage", row_number() OVER (
          ORDER BY (to_tsvector('simple', p."title") = to_tsvector('simple', ${text})) DESC, s."score" DESC,
            ts_rank_cd(p."searchVector", coalesce(a."query", ''::tsquery), 1) DESC, p."createdAt" ASC, p."id" ASC
        ) AS "rank"
        FROM scored s
        JOIN "WikiPage" p ON p."id" = s."id" AND p."companyId" = ${this.companyId}
        CROSS JOIN "anyUnit" a
      )
      SELECT r."id", r."rank", coalesce(r."coverage", 0) AS "coverage", NULL::int[] AS "matched"
      FROM ranked r WHERE r."rank" <= ${limit}
      UNION ALL
      SELECT NULL, NULL, NULL, array_agg(f."ord")::int[] FROM frequency f
      ORDER BY "rank" ASC NULLS LAST
    `);
    return {
      units,
      ids: rows.flatMap(({ id }) => (id === null ? [] : [id])),
      coverage: Math.max(0, ...rows.map(({ coverage }) => coverage ?? 0)),
      matched: new Set(rows.find(({ id }) => id === null)?.matched ?? []),
    };
  }

  private async typoCorrections(terms: string[]): Promise<Map<string, string>> {
    if (terms.length === 0) return new Map();
    const prefixes = [...new Set(terms.map((term) => `%${Array.from(term).slice(0, WIKI_TYPO_PREFIX).join("")}%`))];
    const rows = await this.prisma.$queryRaw<Array<{ term: string; word: string }>>(Prisma.sql`
      WITH terms AS MATERIALIZED (
        SELECT w."term", wiki_search_sorted_letters(w."term") AS "sorted"
        FROM unnest(${terms}::text[]) AS w("term")
        WHERE numnode(plainto_tsquery(${this.fullTextStopConfig}::regconfig, w."term")) > 0
      ),
      pages AS MATERIALIZED (
        SELECT p."title", p."markdown"
        FROM "WikiPage" p
        WHERE p."companyId" = ${this.companyId} AND p."searchCompact" LIKE ANY (${prefixes}::text[])
        ORDER BY p."updatedAt" DESC, p."id" ASC
        LIMIT ${WIKI_TYPO_PAGE_LIMIT}
      ),
      words AS MATERIALIZED (
        SELECT w."word", count(*)::int AS "pages"
        FROM pages p
        CROSS JOIN LATERAL unnest(
          tsvector_to_array(to_tsvector('simple', p."title" || E'\n' || wiki_search_markdown_text(p."markdown")))
        ) AS w("word")
        GROUP BY w."word"
      ),
      matches AS (
        SELECT t."term", w."word", w."pages", similarity(t."term", w."word") AS "score",
          length(w."word") = length(t."term") AND wiki_search_sorted_letters(w."word") = t."sorted" AS "transposed"
        FROM terms t
        JOIN words w ON left(w."word", ${WIKI_TYPO_PREFIX}::int) = left(t."term", ${WIKI_TYPO_PREFIX}::int)
          AND w."word" <> t."term"
          AND abs(length(w."word") - length(t."term")) <= ${WIKI_TYPO_LENGTH_SLACK}::int
      )
      SELECT DISTINCT ON (m."term") m."term", m."word"
      FROM matches m
      WHERE m."score" >= ${WIKI_TYPO_MIN_SIMILARITY}::float4
        OR (m."transposed" AND length(m."term") >= ${WIKI_TYPO_TRANSPOSITION_MIN_LENGTH}::int)
      ORDER BY m."term", m."score" DESC, m."pages" DESC, m."word" ASC
    `);
    return new Map(rows.map(({ term, word }) => [term, word]));
  }

  async rankPageSections(
    text: string,
    sections: Array<{ key: number; heading: string; body: string }>,
  ): Promise<Map<number, number>> {
    const units = fullTextUnits(text);
    if (units.length === 0 || sections.length === 0) return new Map();
    const substrings = substringUnits(units);
    const rows = await this.prisma.$queryRaw<Array<{ key: number; score: number }>>(Prisma.sql`
      WITH ${this.fullTextUnitsCte(units)},
      "substringUnits" AS (
        SELECT * FROM unnest(${substrings.map(({ text: term }) => term)}::text[], ${substrings.map(({ ord }) => ord)}::int[])
          AS sub("term", "ord")
      ),
      sections AS MATERIALIZED (
        SELECT * FROM unnest(
          ${sections.map(({ key }) => key)}::int[],
          ${sections.map(({ heading }) => heading)}::text[],
          ${sections.map(({ body }) => body)}::text[]
        ) AS s("key", "heading", "body")
      ),
      vectors AS MATERIALIZED (
        SELECT s."key", wiki_search_weighted_vector(s."heading", 'A') || wiki_search_weighted_vector(s."body", 'C')
          AS "vector"
        FROM sections s
      ),
      hits AS MATERIALIZED (
        SELECT v."key", u."ord", ts_filter(v."vector", '{a}'::"char"[]) @@ u."query" AS "title"
        FROM vectors v JOIN units u ON v."vector" @@ u."query"
        UNION ALL
        SELECT s."key", t."ord", strpos(lower(s."heading"), t."term") > 0
        FROM sections s JOIN "substringUnits" t ON strpos(lower(s."heading" || ' ' || s."body"), t."term") > 0
      ),
      frequency AS (SELECT h."ord", count(*)::float8 AS "sections" FROM hits h GROUP BY h."ord"),
      total AS (SELECT count(*)::float8 AS "sections" FROM sections)
      SELECT h."key", round(sum(${idfWeight(Prisma.sql`t."sections"`, Prisma.sql`f."sections"`)}
        * CASE WHEN h."title" THEN ${WIKI_TITLE_WEIGHT}::float8 ELSE 1 END)::numeric, 9)::float8 AS "score"
      FROM hits h JOIN frequency f ON f."ord" = h."ord" CROSS JOIN total t
      GROUP BY h."key"
    `);
    return new Map(rows.map(({ key, score }) => [key, score]));
  }

  async sectionHeadlines(text: string, bodies: string[]): Promise<string[]> {
    if (bodies.length === 0) return [];
    const units = fullTextUnits(text);
    const rows = await this.prisma.$queryRaw<Array<{ ord: number; headline: string }>>(Prisma.sql`
      WITH ${this.fullTextUnitsCte(units)}
      SELECT b."ord"::int AS "ord",
        ts_headline(${this.fullTextStopConfig}::regconfig, b."body", coalesce(a."query", ''::tsquery),
          CASE WHEN length(b."body") <= ${WIKI_EXCERPT_MAX_LENGTH} THEN ${WIKI_SHORT_HEADLINE_OPTIONS}
            ELSE ${WIKI_HEADLINE_OPTIONS} END) AS "headline"
      FROM unnest(${bodies}::text[]) WITH ORDINALITY AS b("body", "ord")
      CROSS JOIN "anyUnit" a
      ORDER BY b."ord"
    `);
    return rows.map(({ headline }) => headline);
  }

  async getPagesByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return this.prisma.wikiPage.findMany({
      where: { id: { in: ids }, companyId: this.companyId },
      select: this.pageSelect,
    });
  }

  async semanticIndexAvailable() {
    semanticIndexColumn ??= this.prisma
      .$queryRaw<Array<{ available: boolean }>>(
        Prisma.sql`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'WikiPageChunk' AND column_name = 'embedding'
        ) AS "available"
      `,
      )
      .then((rows) => rows[0]?.available === true)
      .catch((error: unknown) => {
        semanticIndexColumn = undefined;
        throw error;
      });
    return semanticIndexColumn;
  }

  async claimStaleSemanticPages(model: string, limit: number): Promise<WikiSemanticIndexPage[]> {
    return this.prisma.$queryRaw<WikiSemanticIndexPage[]>(Prisma.sql`
      WITH claimable AS MATERIALIZED (
        SELECT p."id" FROM "WikiPage" p
        WHERE p."companyId" = ${this.companyId}
          AND (
            p."semanticIndexClaimedAt" IS NULL
            OR p."semanticIndexClaimedAt" < CURRENT_TIMESTAMP - make_interval(secs => ${WIKI_SEMANTIC_CLAIM_SECONDS})
          )
          AND ${this.staleSemanticPage(model)}
        ORDER BY p."updatedAt" DESC, p."id" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "WikiPage" w SET "semanticIndexClaimedAt" = CURRENT_TIMESTAMP
      FROM claimable c
      WHERE w."id" = c."id" AND w."companyId" = ${this.companyId}
      RETURNING w."id", w."title", w."markdown", w."updatedAt"
    `);
  }

  async semanticEmbeddingsByHash(pageId: string, model: string) {
    const rows = await this.prisma.$queryRaw<Array<{ contentHash: string; embedding: string }>>(Prisma.sql`
      SELECT "contentHash", "embedding"::text AS "embedding" FROM "WikiPageChunk"
      WHERE "pageId" = ${pageId} AND "companyId" = ${this.companyId} AND "model" = ${model}
        AND "embedding" IS NOT NULL
    `);
    return new Map(rows.map((row) => [row.contentHash, row.embedding]));
  }

  @Transaction
  async replaceSemanticChunks(args: {
    pageId: string;
    pageUpdatedAt: Date;
    model: string;
    chunks: Array<WikiSemanticChunk & { embedding: string }>;
  }) {
    const current = await this.prisma.$queryRaw<Array<{ updatedAt: Date }>>(Prisma.sql`
      SELECT "updatedAt" FROM "WikiPage" WHERE "id" = ${args.pageId} AND "companyId" = ${this.companyId} FOR UPDATE
    `);
    if (current[0]?.updatedAt.getTime() !== args.pageUpdatedAt.getTime()) return false;

    await this.prisma.$executeRaw(Prisma.sql`
      DELETE FROM "WikiPageChunk" WHERE "pageId" = ${args.pageId} AND "companyId" = ${this.companyId}
    `);
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "WikiPageChunk" (
        "id", "companyId", "pageId", "ordinal", "offset", "section", "contentHash", "model", "pageUpdatedAt", "embedding"
      )
      SELECT gen_random_uuid()::text, ${this.companyId}, ${args.pageId}, c."ordinal", c."offset", c."section",
        c."contentHash", ${args.model}, ${args.pageUpdatedAt}, c."embedding"::vector
      FROM unnest(
        ${args.chunks.map((chunk) => chunk.ordinal)}::int[],
        ${args.chunks.map((chunk) => chunk.offset)}::int[],
        ${args.chunks.map((chunk) => chunk.section)}::text[],
        ${args.chunks.map((chunk) => chunk.contentHash)}::text[],
        ${args.chunks.map((chunk) => chunk.embedding)}::text[]
      ) AS c("ordinal", "offset", "section", "contentHash", "embedding")
    `);
    return true;
  }

  async releaseSemanticClaims(pageIds: string[]) {
    if (pageIds.length === 0) return;
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "WikiPage" SET "semanticIndexClaimedAt" = NULL
      WHERE "id" = ANY(${pageIds}::text[]) AND "companyId" = ${this.companyId}
    `);
  }

  async loadOperatingPages(procedureLimit: number) {
    const procedureWhere = { companyId: this.companyId, kind: "procedure" as const, draft: false };
    const [guide, procedures, proceduresTotal] = await Promise.all([
      this.prisma.wikiPage.findFirst({
        where: { companyId: this.companyId, kind: "guide", draft: false },
        select: this.pageSelect,
      }),
      this.prisma.wikiPage.findMany({
        where: procedureWhere,
        select: this.pageSelect,
        orderBy: [{ title: "asc" }, { id: "asc" }],
        take: procedureLimit,
      }),
      this.prisma.wikiPage.count({ where: procedureWhere }),
    ]);
    return { guide, procedures, proceduresTotal };
  }

  async listCatalogPages({ page }: RepoArgs<GetWikiCatalogRepo, "listCatalogPages">) {
    const where = { companyId: this.companyId, kind: "knowledge" as const, draft: false };
    const [items, total] = await Promise.all([
      this.prisma.wikiPage.findMany({
        where,
        select: this.pageSelect,
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * WIKI_CATALOG_PAGE_SIZE,
        take: WIKI_CATALOG_PAGE_SIZE,
      }),
      this.prisma.wikiPage.count({ where }),
    ]);
    return { items, total };
  }

  async getPage(id: string) {
    return this.prisma.wikiPage.findFirst({
      where: { id, companyId: this.companyId },
      select: this.pageSelect,
    });
  }

  async dominantWikiLanguage() {
    const counts = new Map<string, number>();
    let after = "";
    while (true) {
      const pages = await this.prisma.$queryRaw<Array<{ id: string; sample: string }>>(Prisma.sql`
        SELECT "id", left("markdown", ${WIKI_LANGUAGE_SAMPLE_CHARACTERS}) AS "sample"
        FROM "WikiPage"
        WHERE "companyId" = ${this.companyId} AND "id" > ${after}
        ORDER BY "id" ASC LIMIT 100
      `);
      for (const page of pages) {
        const language = detectedWikiLanguage(page.sample);
        if (language) counts.set(language, (counts.get(language) ?? 0) + 1);
      }
      if (pages.length < 100) break;
      after = pages[pages.length - 1].id;
    }
    return dominantWikiLanguageFromCounts(counts);
  }

  async wikiIsEmpty() {
    return (
      (await this.prisma.wikiPage.count({
        where: { companyId: this.companyId },
      })) === 0
    );
  }

  async createPages(data: RepoArgs<CreateWikiPagesRepo, "createPages">) {
    if (
      data.requireEmpty &&
      (await this.prisma.wikiPage.count({
        where: { companyId: this.companyId },
      })) > 0
    )
      return { status: "wiki-not-empty" as const };

    const guides = data.pages.filter((page) => page.kind === "guide").length;
    if (guides > 1 || (guides === 1 && (await this.guideExists()))) return { status: "guide-exists" as const };

    const pages: WikiPageDto[] = [];
    const createdAt = Date.now();
    for (const [index, page] of data.pages.entries()) {
      pages.push(
        await this.prisma.wikiPage.create({
          data: {
            id: page.id,
            companyId: this.companyId,
            title: page.title,
            markdown: page.markdown,
            kind: wikiPageKindFields(page).kind,
            whenToUse: wikiPageKindFields(page).whenToUse,
            draft: page.draft ?? false,
            createdAt: new Date(createdAt + index),
          },
          select: this.pageSelect,
        }),
      );
    }
    return { status: "created" as const, pages };
  }

  async updatePage(data: RepoArgs<UpdateWikiPageRepo, "updatePage">) {
    const previous = await this.getPage(data.id);
    if (!previous) return { status: "not-found" as const };
    if (previous.updatedAt.getTime() !== data.expectedUpdatedAt.getTime()) return { status: "conflict" as const };

    const title = data.title?.trim() ?? previous.title;
    const markdown = data.markdown ?? previous.markdown;
    const kind = data.kind ?? previous.kind;
    const whenToUse = kind === "procedure" ? (data.whenToUse ?? previous.whenToUse) : null;
    const draft = data.draft ?? previous.draft;
    if (
      title === previous.title &&
      markdown === previous.markdown &&
      kind === previous.kind &&
      whenToUse === previous.whenToUse &&
      draft === previous.draft
    )
      return { status: "unchanged" as const, previous, page: previous };
    const invalid = wikiPageKindIssue({ kind, whenToUse, markdown });
    if (invalid) return { status: "invalid" as const, error: invalid };
    if (kind === "guide" && previous.kind !== "guide" && (await this.guideExists(previous.id)))
      return { status: "guide-exists" as const };

    const updated = await this.prisma.wikiPage.updateMany({
      where: {
        id: data.id,
        companyId: this.companyId,
        updatedAt: data.expectedUpdatedAt,
      },
      data: {
        title,
        markdown,
        kind,
        whenToUse,
        draft,
        updatedAt: new Date(Math.max(Date.now(), previous.updatedAt.getTime() + 1)),
      },
    });
    if (updated.count !== 1) {
      const current = await this.getPage(data.id);
      return {
        status: current ? ("conflict" as const) : ("not-found" as const),
      };
    }

    const page = await this.getPage(data.id);
    if (!page) return { status: "not-found" as const };
    return { status: "updated" as const, previous, page };
  }

  async deletePage(data: RepoArgs<DeleteWikiPageRepo, "deletePage">) {
    const page = await this.getPage(data.id);
    if (!page) return { status: "not-found" as const };
    if (page.updatedAt.getTime() !== data.expectedUpdatedAt.getTime()) return { status: "conflict" as const };

    const deleted = await this.prisma.wikiPage.deleteMany({
      where: {
        id: data.id,
        companyId: this.companyId,
        updatedAt: data.expectedUpdatedAt,
      },
    });
    if (deleted.count !== 1) {
      const current = await this.getPage(data.id);
      return {
        status: current ? ("conflict" as const) : ("not-found" as const),
      };
    }
    return { status: "deleted" as const, page };
  }

  private staleSemanticPage(model: string) {
    return Prisma.sql`NOT EXISTS (
      SELECT 1 FROM "WikiPageChunk" c
      WHERE c."pageId" = p."id" AND c."model" = ${model} AND c."pageUpdatedAt" = p."updatedAt"
        AND c."embedding" IS NOT NULL
    )`;
  }
}
