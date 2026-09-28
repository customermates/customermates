import type { RepoArgs } from "@/core/utils/types";
import type { CreateWikiPagesRepo } from "./create-wiki-pages.interactor";
import type { DeleteWikiPageRepo } from "./delete-wiki-page.interactor";
import type { GetWikiPageRepo } from "./get-wiki-page.interactor";
import type { GetWikiPagesRepo } from "./get-wiki-pages.interactor";
import type { GetWikiCatalogRepo } from "./get-wiki-catalog.interactor";
import type { SearchWikiPagesRepo } from "./search-wiki-pages.interactor";
import type { UpdateWikiPageRepo } from "./update-wiki-page.interactor";
import type { StartWikiHomepageSetupRepo } from "./start-wiki-homepage-setup.interactor";
import type { WikiPageDto } from "./wiki.schema";
import type { WikiSearchQuery } from "./wiki-search";
import type { WikiKeywordCandidate, WikiSemanticCandidate } from "./wiki-hybrid-ranking";
import type { WikiSemanticChunk } from "./wiki-chunks";
import type { WikiSemanticIndexPage, WikiSemanticIndexRepo } from "@/ee/wiki-retrieval/wiki-semantic-index.service";

import { Prisma } from "@/generated/prisma";

import {
  fullTextUnits,
  fullTextUnitsCte,
  idfWeight,
  substringUnits,
  textSearchConfigFor,
  type FullTextUnit,
} from "@/core/retrieval/full-text-query";

import { BaseRepository } from "@/core/base/base-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { WIKI_CATALOG_PAGE_SIZE, wikiPageKindFields, wikiPageKindIssue } from "./wiki.schema";
import { WIKI_EXCERPT_MAX_LENGTH } from "./wiki-content";
import { WIKI_SEMANTIC_MIN_SIMILARITY } from "./wiki-hybrid-ranking";
import { wikiIdentifierTerms } from "./wiki-identifiers";
import {
  parseWikiSearchQuery,
  WIKI_FUZZY_SIMILARITY,
  WIKI_SEARCH_CONFIGS,
  wikiSearchMatch,
  wikiIdentifierPattern,
  wikiSortedLetters,
} from "./wiki-search";

const WIKI_RRF_K = 60;
const WIKI_TEXT_RANK_DEPTH = 100;
const WIKI_SUGGESTION_SIMILARITY = 0.3;
const WIKI_SUGGESTION_LIMIT = 3;
const WIKI_SUBSTRING_ORD_BASE = 1_000;
const WIKI_SUGGESTION_BODY_PAGES = 200;
const WIKI_SUGGESTION_BODY_CHARS = 20_000;
const WIKI_SUGGESTION_VOCABULARY_LIMIT = 5_000;
const WIKI_IDENTIFIER_ORD_BASE = 2_000;
const WIKI_IDENTIFIER_MAX_PAGES = 3;
const WIKI_SEMANTIC_STALE_LIMIT = 1_000;
const WIKI_SEMANTIC_CLAIM_SECONDS = 300;
const WIKI_SEMANTIC_INTRO_MARGIN = 0.03;
const WIKI_FULL_TEXT_CONFIGS = WIKI_SEARCH_CONFIGS.filter((config) => config !== "simple");
const WIKI_TITLE_WEIGHT = 2;
const WIKI_HEADLINE_OPTIONS = "StartSel=**, StopSel=**, MaxWords=35, MinWords=15";
const WIKI_SHORT_HEADLINE_OPTIONS = "StartSel=**, StopSel=**, HighlightAll=true";

let semanticIndexColumn: Promise<boolean> | undefined;

type WikiSearchRow = WikiPageDto & { total: number; allTerms: boolean; identifier: boolean };

function wikiFuzzyTerms(terms: WikiSearchQuery["fuzzyTerms"]) {
  return Prisma.sql`unnest(
    ${terms.map(({ term }) => term)}::text[],
    ${terms.map(({ term }) => wikiSortedLetters(term))}::text[],
    ${terms.map(({ unit }) => unit)}::int[]
  ) AS terms("term", "sorted", "ord")`;
}

function wikiFuzzySimilarity(word: Prisma.Sql) {
  return Prisma.sql`
    CASE
      WHEN left(${word}, 1) <> left(terms."term", 1) THEN NULL
      WHEN similarity(terms."term", ${word}) >= ${WIKI_FUZZY_SIMILARITY} THEN similarity(terms."term", ${word})
      WHEN length(${word}) = length(terms."term") AND length(${word}) >= 5
        AND wiki_search_sorted_letters(${word}) = terms."sorted"
        THEN ${WIKI_FUZZY_SIMILARITY}::float4
    END`;
}

function isSearchableWikiQuery(query: WikiSearchQuery) {
  return query.units.length > 0 || query.substringTerms.length > 0 || query.identifierTerms.length > 0;
}

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

  async searchPages(data: RepoArgs<SearchWikiPagesRepo, "searchPages">) {
    const { page, pageSize } = data;
    const query = parseWikiSearchQuery(data.query);
    if (!isSearchableWikiQuery(query)) return { items: [], total: 0, page, pageSize };
    const rows = await this.prisma.$queryRaw<WikiSearchRow[]>(this.wikiSearchSql(query, data.query, page, pageSize));
    const total = rows[0]?.total ?? (page > 1 ? await this.countWikiSearchMatches(query, data.query) : 0);
    const didYouMean = total === 0 ? await this.wikiSearchSuggestions(query) : [];
    return {
      items: rows.map(({ total: _total, allTerms: _allTerms, identifier: _identifier, ...row }) => ({
        ...row,
        ...wikiSearchMatch(row.markdown, query),
      })),
      total,
      page,
      pageSize,
      ...(didYouMean.length > 0 ? { didYouMean } : {}),
    };
  }

  async searchPageCandidates(text: string, limit: number): Promise<WikiKeywordCandidate[]> {
    const query = parseWikiSearchQuery(text);
    if (!isSearchableWikiQuery(query)) return [];
    return this.prisma.$queryRaw<WikiKeywordCandidate[]>(Prisma.sql`
      SELECT s."id", s."allTerms", s."identifier" FROM (${this.wikiSearchSql(query, text, 1, limit)}) AS s
    `);
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
        WHERE p."distance" <= ${1 - WIKI_SEMANTIC_MIN_SIMILARITY}
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

  async fullTextPageCandidates(text: string, limit: number): Promise<{ keys: string[]; pinned: string[] }> {
    const units = fullTextUnits(text);
    const substrings = substringUnits(units);
    const identifiers = wikiIdentifierTerms(text);
    const [ranked, pinned] = await Promise.all([
      units.length === 0
        ? Promise.resolve([])
        : this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
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
          frequency AS (SELECT h."ord", count(*)::float8 AS "pages" FROM hits h GROUP BY h."ord"),
          total AS (SELECT count(*)::float8 AS "pages" FROM "WikiPage" WHERE "companyId" = ${this.companyId}),
          scored AS (
            SELECT h."id", sum(${idfWeight(Prisma.sql`t."pages"`, Prisma.sql`f."pages"`)}
              * CASE WHEN h."title" THEN ${WIKI_TITLE_WEIGHT}::float8 ELSE 1 END) AS "score"
            FROM hits h JOIN frequency f ON f."ord" = h."ord" CROSS JOIN total t
            GROUP BY h."id"
          )
          SELECT s."id"
          FROM scored s
          JOIN "WikiPage" p ON p."id" = s."id" AND p."companyId" = ${this.companyId}
          CROSS JOIN "anyUnit" a
          ORDER BY (to_tsvector('simple', p."title") = to_tsvector('simple', ${text})) DESC, s."score" DESC,
            ts_rank_cd(p."searchVector", coalesce(a."query", ''::tsquery), 1) DESC, p."createdAt" ASC, p."id" ASC
          LIMIT ${limit}
        `),
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
    return { keys: ranked.map(({ id }) => id), pinned: [...new Set(pinned.map(({ id }) => id))] };
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
      SELECT h."key", sum(${idfWeight(Prisma.sql`t."sections"`, Prisma.sql`f."sections"`)}
        * CASE WHEN h."title" THEN ${WIKI_TITLE_WEIGHT}::float8 ELSE 1 END)::float8 AS "score"
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
      UPDATE "WikiPage" SET "semanticIndexClaimedAt" = CURRENT_TIMESTAMP
      WHERE "id" IN (
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
      AND "companyId" = ${this.companyId}
      RETURNING "id", "title", "markdown", "updatedAt"
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

  private async countWikiSearchMatches(query: WikiSearchQuery, text: string) {
    const rows = await this.prisma.$queryRaw<WikiSearchRow[]>(this.wikiSearchSql(query, text, 1, 1));
    return rows[0]?.total ?? 0;
  }

  private async wikiSearchSuggestions(query: WikiSearchQuery) {
    const terms = query.fuzzyTerms.map(({ term }) => term);
    const [corrections, titles] = await Promise.all([
      terms.length === 0
        ? Promise.resolve([])
        : this.prisma.$queryRaw<Array<{ term: string; correction: string }>>(Prisma.sql`
          WITH words AS (
            SELECT h."word", 2::int AS "source", count(*) AS "frequency"
            FROM "WikiPage" p
            CROSS JOIN LATERAL wiki_search_words(p."searchHeadings") AS h("word")
            WHERE p."companyId" = ${this.companyId}
            GROUP BY h."word"
            UNION ALL
            SELECT b."lexeme", 1::int, sum(coalesce(array_length(b."positions", 1), 1))
            FROM (
              SELECT "markdown" FROM "WikiPage"
              WHERE "companyId" = ${this.companyId}
              ORDER BY "updatedAt" DESC, "id" ASC
              LIMIT ${WIKI_SUGGESTION_BODY_PAGES}
            ) AS p
            CROSS JOIN LATERAL unnest(
              to_tsvector('simple', wiki_search_markdown_text(left(p."markdown", ${WIKI_SUGGESTION_BODY_CHARS})))
            ) AS b
            GROUP BY b."lexeme"
          ),
          vocabulary AS (
            SELECT w."word"
            FROM words w
            WHERE left(w."word", 1) = ANY(${[...new Set(terms.map((term) => Array.from(term)[0]))]}::text[])
            GROUP BY w."word"
            ORDER BY max(w."source") DESC, sum(w."frequency") DESC, w."word" ASC
            LIMIT ${WIKI_SUGGESTION_VOCABULARY_LIMIT}
          )
          SELECT DISTINCT ON (terms."term") terms."term", v."word" AS "correction"
          FROM ${wikiFuzzyTerms(query.fuzzyTerms)}
          JOIN vocabulary v ON left(v."word", 1) = left(terms."term", 1)
            AND abs(length(v."word") - length(terms."term")) <= 2
          WHERE ${wikiFuzzySimilarity(Prisma.sql`v."word"`)} IS NOT NULL
          ORDER BY terms."term", ${wikiFuzzySimilarity(Prisma.sql`v."word"`)} DESC, v."word" ASC
        `),
      this.prisma.$queryRaw<Array<{ title: string }>>(Prisma.sql`
        SELECT "title"
        FROM "WikiPage"
        CROSS JOIN LATERAL (
          SELECT max(word_similarity(terms."term", lower("title"))) AS "score"
          FROM unnest(${[query.title, ...terms]}::text[]) AS terms("term")
        ) AS s
        WHERE "companyId" = ${this.companyId} AND s."score" >= ${WIKI_SUGGESTION_SIMILARITY}
        ORDER BY s."score" DESC, "createdAt" ASC, "id" ASC
        LIMIT ${WIKI_SUGGESTION_LIMIT}
      `),
    ]);
    const replacements = new Map(corrections.map(({ term, correction }) => [term, correction]));
    const corrected = query.title
      .split(" ")
      .map((word) => replacements.get(word) ?? word)
      .join(" ");
    return [...new Set([...(corrected !== query.title ? [corrected] : []), ...titles.map(({ title }) => title)])].slice(
      0,
      WIKI_SUGGESTION_LIMIT,
    );
  }

  private wikiSearchSql(query: WikiSearchQuery, text: string, page: number, pageSize: number) {
    const configured = (value: string, phrase: boolean) =>
      Prisma.join(
        WIKI_SEARCH_CONFIGS.map((config) =>
          phrase
            ? Prisma.sql`phraseto_tsquery(${config}::regconfig, ${value})`
            : Prisma.sql`plainto_tsquery(${config}::regconfig, ${value})`,
        ),
        " || ",
      );
    const unitQueries = query.units.map((unit) => {
      const exact = Prisma.sql`(${configured(unit.text, unit.phrase || unit.words.length > 1)})`;
      return {
        exact,
        query:
          unit.text === query.prefix ? Prisma.sql`(${exact} || to_tsquery('simple', ${`'${unit.text}':*`}))` : exact,
      };
    });
    const units =
      unitQueries.length > 0
        ? Prisma.sql`SELECT * FROM (VALUES ${Prisma.join(
            unitQueries.map(
              ({ exact, query: unitQuery }, index) => Prisma.sql`(${index + 1}::int, ${unitQuery}, ${exact})`,
            ),
          )}) AS v("ord", "query", "exact")`
        : Prisma.sql`SELECT NULL::int AS "ord", NULL::tsquery AS "query", NULL::tsquery AS "exact" WHERE false`;
    const anyQuery =
      unitQueries.length > 0
        ? Prisma.sql`(${Prisma.join(
            unitQueries.map(({ query: unitQuery }) => unitQuery),
            " || ",
          )})`
        : null;
    const textHits = anyQuery
      ? Prisma.sql`
          SELECT p."id", u."ord", (p."searchVector" @@ u."exact") AS "exact", 1::float8 AS "strength"
          FROM "WikiPage" p
          JOIN units u ON p."searchVector" @@ u."query"
          WHERE p."companyId" = ${this.companyId} AND p."searchVector" @@ (SELECT "query" FROM search)`
      : Prisma.sql`SELECT NULL::text AS "id", NULL::int AS "ord", NULL::boolean AS "exact", NULL::float8 AS "strength" WHERE false`;
    const substringHits =
      query.substringTerms.length > 0
        ? Prisma.sql`
          UNION ALL
          SELECT p."id", ${WIKI_SUBSTRING_ORD_BASE}::int + terms."ord"::int, true, 1::float8
          FROM "WikiPage" p
          CROSS JOIN unnest(${query.substringTerms}::text[]) WITH ORDINALITY AS terms("term", "ord")
          WHERE p."companyId" = ${this.companyId}
            AND (strpos(lower(p."title"), terms."term") > 0 OR strpos(lower(p."markdown"), terms."term") > 0)`
        : Prisma.empty;
    const textRank = anyQuery
      ? Prisma.sql`CASE WHEN c."coveredRank" <= ${WIKI_TEXT_RANK_DEPTH}::int
          THEN ts_rank_cd(p."searchVector", (SELECT "query" FROM search), 1) ELSE 0 END`
      : Prisma.sql`0::float4`;
    const titleHit = anyQuery
      ? Prisma.sql`ts_filter(p."searchVector", '{a}'::"char"[]) @@ (SELECT "query" FROM search)`
      : Prisma.sql`false`;
    const titleMatchesUnit = anyQuery
      ? Prisma.sql`EXISTS (SELECT 1 FROM units u WHERE wiki_search_weighted_vector(w."word", 'A') @@ u."query")`
      : Prisma.sql`false`;
    const unitCount = query.units.length;
    const identifierHits =
      query.identifierTerms.length > 0
        ? Prisma.sql`
          UNION ALL
          SELECT m."id", ${WIKI_IDENTIFIER_ORD_BASE}::int + m."ord"::int, true, 1::float8
          FROM (
            SELECT p."id", terms."ord", count(*) OVER (PARTITION BY terms."ord") AS "pages"
            FROM "WikiPage" p
            JOIN unnest(${query.identifierTerms.map(wikiIdentifierPattern)}::text[]) WITH ORDINALITY AS terms("pattern", "ord")
              ON p."searchCompact" ~ terms."pattern"
            WHERE p."companyId" = ${this.companyId}
          ) AS m
          WHERE m."pages" <= ${WIKI_IDENTIFIER_MAX_PAGES}::int`
        : Prisma.empty;

    return Prisma.sql`
      WITH units AS MATERIALIZED (${units}),
      search AS MATERIALIZED (SELECT ${anyQuery ?? Prisma.sql`NULL::tsquery`} AS "query"),
      "textHits" AS MATERIALIZED (${textHits} ${substringHits} ${identifierHits}),
      "unknownTerms" AS MATERIALIZED (
        SELECT terms.* FROM ${wikiFuzzyTerms(query.fuzzyTerms)}
        WHERE NOT EXISTS (SELECT 1 FROM "textHits" h WHERE h."ord" = terms."ord")
      ),
      "fuzzyHits" AS MATERIALIZED (
        SELECT p."id", terms."ord", true AS "exact", max(${wikiFuzzySimilarity(Prisma.sql`w."word"`)}) AS "strength"
        FROM "WikiPage" p
        CROSS JOIN LATERAL wiki_search_words(p."searchHeadings") AS w("word")
        CROSS JOIN "unknownTerms" terms
        WHERE p."companyId" = ${this.companyId} AND EXISTS (SELECT 1 FROM "unknownTerms")
        GROUP BY p."id", terms."ord"
        HAVING max(${wikiFuzzySimilarity(Prisma.sql`w."word"`)}) IS NOT NULL
      ),
      hits AS MATERIALIZED (
        SELECT * FROM "textHits"
        UNION ALL
        SELECT * FROM "fuzzyHits"
      ),
      weights AS MATERIALIZED (
        SELECT f."ord", ln(1 + (n."pages" - f."df" + 0.5) / (f."df" + 0.5)) AS "weight"
        FROM (SELECT "ord", count(*)::float8 AS "df" FROM hits GROUP BY "ord") AS f
        CROSS JOIN (SELECT count(*)::float8 AS "pages" FROM "WikiPage" WHERE "companyId" = ${this.companyId}) AS n
      ),
      coverage AS MATERIALIZED (
        SELECT h."id",
          sum(w."weight" * h."strength") AS "covered",
          count(*) FILTER (WHERE h."ord" < ${WIKI_SUBSTRING_ORD_BASE}::int) AS "matched",
          bool_or(h."ord" >= ${WIKI_IDENTIFIER_ORD_BASE}::int) AS "identifier",
          bool_or(h."exact") AS "exact",
          coalesce(sum(h."strength") FILTER (WHERE h."ord" IN (SELECT "ord" FROM "unknownTerms")), 0) AS "similarity",
          row_number() OVER (ORDER BY sum(w."weight" * h."strength") DESC, h."id") AS "coveredRank"
        FROM hits h
        JOIN weights w ON w."ord" = h."ord"
        GROUP BY h."id"
      ),
      candidates AS MATERIALIZED (
        SELECT p."id", p."title", p."createdAt", c."covered", c."matched", c."similarity", c."identifier",
          ${textRank} AS "textRank",
          (${titleHit} OR c."similarity" > 0) AS "titleHit",
          (to_tsvector('simple', p."title") = to_tsvector('simple', ${text})) AS "exactTitle"
        FROM coverage c
        JOIN "WikiPage" p ON p."id" = c."id" AND p."companyId" = ${this.companyId}
        WHERE c."exact" OR ${unitCount}::int <= 1
      ),
      titles AS MATERIALIZED (
        SELECT c."id", bool_and(
          ${titleMatchesUnit}
          OR EXISTS (SELECT 1 FROM "unknownTerms" terms WHERE ${wikiFuzzySimilarity(Prisma.sql`w."word"`)} IS NOT NULL)
        ) AS "fullTitle"
        FROM candidates c
        CROSS JOIN LATERAL wiki_search_words(c."title") AS w("word")
        WHERE c."titleHit"
          AND to_tsvector('english', w."word") <> ''::tsvector
          AND to_tsvector('german', w."word") <> ''::tsvector
          AND to_tsvector('spanish', w."word") <> ''::tsvector
          AND to_tsvector('french', w."word") <> ''::tsvector
          AND to_tsvector('italian', w."word") <> ''::tsvector
        GROUP BY c."id"
      ),
      ranked AS MATERIALIZED (
        SELECT c."id", c."createdAt", c."identifier",
          (${unitCount}::int > 0 AND c."matched" = ${unitCount}::int) AS "allTerms",
          c."exactTitle",
          coalesce(t."fullTitle", false) AS "fullTitle",
          1.0 / (${WIKI_RRF_K}::int + row_number() OVER (ORDER BY c."covered" DESC, c."textRank" DESC))
            + CASE WHEN c."similarity" > 0
                THEN 1.0 / (${WIKI_RRF_K}::int + row_number() OVER (ORDER BY c."similarity" DESC))
                ELSE 0
              END AS "fusedRank",
          count(*) OVER () AS "total"
        FROM candidates c
        LEFT JOIN titles t ON t."id" = c."id"
      ),
      selected AS MATERIALIZED (
        SELECT * FROM ranked
        ORDER BY "identifier" DESC, "allTerms" DESC, "exactTitle" DESC, "fullTitle" DESC, "fusedRank" DESC,
          "createdAt" ASC, "id" ASC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      )
      SELECT p."id", p."title", p."markdown", p."kind", p."whenToUse", p."draft", p."createdAt", p."updatedAt",
        r."total"::int AS "total",
        r."allTerms", r."identifier"
      FROM selected r
      JOIN "WikiPage" p ON p."id" = r."id" AND p."companyId" = ${this.companyId}
      ORDER BY r."identifier" DESC, r."allTerms" DESC, r."exactTitle" DESC, r."fullTitle" DESC, r."fusedRank" DESC,
        r."createdAt" ASC, r."id" ASC
    `;
  }
}
