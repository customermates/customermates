import type { SectionCorpusSql } from "@/core/retrieval/section-search-sql";
import type {
  SearchWikiPagesRepo,
  WikiFullTextSections,
  WikiSectionHit,
  WikiSectionMatch,
  WikiSectionSync,
} from "@/features/wiki/search-wiki-pages.repo";
import type { WikiSemanticIndexRepo } from "@/ee/wiki-retrieval/wiki-semantic-index.repo";
import type { WikiIndexPage } from "@/ee/wiki-retrieval/wiki-semantic-index.service";
import type { WikiSectionRow } from "./wiki-sections";

import { Prisma } from "@/generated/prisma";

import {
  fullTextUnits,
  replaceQueryWords,
  textSearchConfigFor,
  typoCandidates,
} from "@/core/retrieval/full-text-query";
import {
  rankedSectionsSql,
  sectionEmbeddingAvailableSql,
  sectionTypoCorrectionsSql,
  semanticSectionsSql,
} from "@/core/retrieval/section-search-sql";
import { TenantRepository } from "@/core/base/tenant-repository";
import { Transaction } from "@/core/decorators/transaction.decorator";

import { wikiIdentifierPattern, wikiIdentifierTerms } from "./wiki-identifiers";
import { wikiSectionRows } from "./wiki-sections";
import { currentWikiSummary } from "./wiki-summary";

const WIKI_FULL_TEXT_CONFIGS = ["english", "german", "spanish", "french", "italian"] as const;
const WIKI_SECTION_COLUMNS = ["pageId", "offset", "ordinal", "pageUpdatedAt"] as const;
const WIKI_IDENTIFIER_MAX_PAGES = 3;
const WIKI_SECTION_SYNC_LIMIT = 100;
const WIKI_INDEX_CLAIM_SECONDS = 300;
const WIKI_SEMANTIC_INTRO_MARGIN = 0.03;

let sectionEmbeddingColumn: Promise<boolean> | undefined;

type RankedRow = {
  id: string | null;
  pageId: string;
  coverage: number;
  matched: number[] | null;
};

const WIKI_CONTENT_HASH = Prisma.sql`encode(sha256(convert_to(p."title" || E'\\n' || p."markdown", 'UTF8')), 'hex')`;
const UNTOUCHED_IMPORT = Prisma.sql`(p."sourceImportedUpdatedAt" IS NOT NULL AND p."sourceImportedUpdatedAt" = p."updatedAt")`;

export class PrismaWikiSectionRepo
  extends TenantRepository
  implements SearchWikiPagesRepo, WikiSemanticIndexRepo
{
  private get corpus(): SectionCorpusSql {
    return {
      table: Prisma.raw('"WikiPageSection"'),
      scope: Prisma.sql`s."companyId" = ${this.companyId} AND EXISTS (SELECT 1 FROM "WikiPage" live WHERE live."id" = s."pageId" AND live."deletedAt" IS NULL)`,
      group: Prisma.sql`s."pageId"`,
      columns: WIKI_SECTION_COLUMNS,
      order: Prisma.sql`s."pageUpdatedAt" DESC, s."pageId" ASC, s."ordinal" ASC`,
      configs: WIKI_FULL_TEXT_CONFIGS,
      stopConfig: textSearchConfigFor(this.user.displayLanguage),
    };
  }

  private unsyncedPage() {
    return Prisma.sql`NOT EXISTS (
      SELECT 1 FROM "WikiPageSection" s WHERE s."pageId" = p."id" AND s."pageUpdatedAt" = p."updatedAt"
    )`;
  }

  private unembeddedPage(version: string) {
    return Prisma.sql`(${this.unsyncedPage()} OR EXISTS (
      SELECT 1 FROM "WikiPageSection" s
      WHERE s."pageId" = p."id" AND (s."embedding" IS NULL OR s."embeddingVersion" IS DISTINCT FROM ${version})
    ))`;
  }

  private staleIndexPage(version: string) {
    return Prisma.sql`(${this.unembeddedPage(version)}
      OR (NOT ${UNTOUCHED_IMPORT} AND p."summaryContentHash" IS DISTINCT FROM ${WIKI_CONTENT_HASH}))`;
  }

  async semanticIndexAvailable() {
    sectionEmbeddingColumn ??= this.prisma
      .$queryRaw<Array<{ available: boolean }>>(sectionEmbeddingAvailableSql("WikiPageSection"))
      .then((rows) => rows[0]?.available === true)
      .catch((error: unknown) => {
        sectionEmbeddingColumn = undefined;
        throw error;
      });
    return sectionEmbeddingColumn;
  }

  async syncStaleSections(limit = WIKI_SECTION_SYNC_LIMIT): Promise<WikiSectionSync> {
    const found = await this.prisma.$queryRaw<WikiIndexPage[]>(Prisma.sql`
      SELECT p."id", p."title", p."markdown", p."updatedAt", p."summary", p."summaryContentHash",
        p."sourceImportedUpdatedAt"
      FROM "WikiPage" p
      WHERE p."companyId" = ${this.companyId} AND p."deletedAt" IS NULL AND ${this.unsyncedPage()}
      ORDER BY p."updatedAt" DESC, p."id" ASC
      LIMIT ${limit + 1}
    `);
    let synced = 0;
    for (const page of found.slice(0, limit)) {
      const summary = currentWikiSummary(page);
      const written = await this.replaceSections({
        pageId: page.id,
        pageUpdatedAt: page.updatedAt,
        pageTitle: page.title,
        summary,
        rows: wikiSectionRows(page, summary),
        embeddings: new Map(),
        version: null,
        onlyIfStale: true,
      });
      if (written) synced += 1;
    }
    return { synced, remaining: found.length > limit };
  }

  @Transaction
  async replaceSections(args: {
    pageId: string;
    pageUpdatedAt: Date;
    pageTitle: string;
    summary: string | null;
    rows: WikiSectionRow[];
    embeddings: ReadonlyMap<string, string>;
    version: string | null;
    onlyIfStale: boolean;
  }): Promise<boolean> {
    const current = await this.prisma.$queryRaw<Array<{ updatedAt: Date; synced: boolean }>>(Prisma.sql`
      SELECT p."updatedAt", NOT ${this.unsyncedPage()} AS "synced"
      FROM "WikiPage" p WHERE p."id" = ${args.pageId} AND p."companyId" = ${this.companyId} FOR UPDATE
    `);
    if (current[0]?.updatedAt.getTime() !== args.pageUpdatedAt.getTime()) return false;
    if (args.onlyIfStale && current[0].synced) return false;

    const withEmbedding = await this.semanticIndexAvailable();
    const known = new Map<string, { embedding: string; version: string }>();
    if (withEmbedding) {
      const previous = await this.prisma.$queryRaw<Array<{ contentHash: string; embedding: string; version: string }>>(
        Prisma.sql`
          SELECT DISTINCT ON ("contentHash") "contentHash", "embedding"::text AS "embedding",
            "embeddingVersion" AS "version"
          FROM "WikiPageSection"
          WHERE "pageId" = ${args.pageId} AND "companyId" = ${this.companyId}
            AND "embedding" IS NOT NULL AND "embeddingVersion" IS NOT NULL
          ORDER BY "contentHash", "createdAt" DESC
        `,
      );
      for (const row of previous) {
        known.set(row.contentHash, {
          embedding: row.embedding,
          version: row.version,
        });
      }
    }
    for (const [contentHash, embedding] of args.embeddings)
      if (args.version) known.set(contentHash, { embedding, version: args.version });

    await this.prisma.$executeRaw(Prisma.sql`
      DELETE FROM "WikiPageSection" WHERE "pageId" = ${args.pageId} AND "companyId" = ${this.companyId}
    `);
    if (args.rows.length === 0) return true;
    const embedded = args.rows.map((row) => known.get(row.contentHash) ?? null);
    const vectorColumns = withEmbedding ? Prisma.sql`, "embeddingVersion", "embedding"` : Prisma.empty;
    const vectorValues = withEmbedding ? Prisma.sql`, r."embeddingVersion", r."embedding"::vector` : Prisma.empty;
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "WikiPageSection" (
        "id", "companyId", "pageId", "ordinal", "offset", "pageTitle", "headingPath", "anchor", "summary", "text",
        "contentHash", "pageUpdatedAt" ${vectorColumns}
      )
      SELECT gen_random_uuid()::text, ${this.companyId}, ${args.pageId}, r."ordinal", r."offset", ${args.pageTitle},
        ARRAY(SELECT jsonb_array_elements_text(r."headingPath"::jsonb)), r."anchor", ${args.summary}, r."text",
        r."contentHash", ${args.pageUpdatedAt} ${vectorValues}
      FROM unnest(
        ${args.rows.map((row) => row.ordinal)}::int[],
        ${args.rows.map((row) => row.offset)}::int[],
        ${args.rows.map((row) => JSON.stringify(row.headingPath))}::text[],
        ${args.rows.map((row) => row.anchor)}::text[],
        ${args.rows.map((row) => row.text)}::text[],
        ${args.rows.map((row) => row.contentHash)}::text[],
        ${embedded.map((entry) => entry?.version ?? null)}::text[],
        ${embedded.map((entry) => entry?.embedding ?? null)}::text[]
      ) AS r("ordinal", "offset", "headingPath", "anchor", "text", "contentHash", "embeddingVersion", "embedding")
    `);
    return true;
  }

  async fullTextSections(text: string, limit: number): Promise<WikiFullTextSections> {
    const [ranked, pinned] = await Promise.all([this.rankedSections(text, limit), this.identifierPins(text)]);
    const units = fullTextUnits(text);
    const corrections = await this.typoCorrections(typoCandidates(units, ranked.matched));
    if (corrections.size === 0) return { hits: ranked.hits, pinned, coverage: ranked.coverage };
    const corrected = replaceQueryWords(text, corrections);
    const retried = await this.rankedSections(corrected, limit);
    return {
      hits: retried.hits,
      pinned,
      coverage: retried.coverage,
      corrected,
    };
  }

  private async rankedSections(text: string, limit: number) {
    const units = fullTextUnits(text);
    if (units.length === 0) return { hits: [], coverage: 0, matched: new Set<number>() };
    const rows = await this.prisma.$queryRaw<RankedRow[]>(
      rankedSectionsSql({
        corpus: this.corpus,
        units,
        limit,
        exactTitle: text,
      }),
    );
    const hits = rows.flatMap(({ id, pageId, coverage }) =>
      id === null ? [] : [{ pageId, sectionId: id, coverage: coverage ?? 0 }],
    );
    return {
      hits,
      coverage: Math.max(0, ...hits.map(({ coverage }) => coverage)),
      matched: new Set(rows.find(({ id }) => id === null)?.matched ?? []),
    };
  }

  private async identifierPins(text: string): Promise<WikiSectionMatch[]> {
    const identifiers = wikiIdentifierTerms(text);
    if (identifiers.length === 0) return [];
    return this.prisma.$queryRaw<WikiSectionMatch[]>(Prisma.sql`
      WITH matches AS MATERIALIZED (
        SELECT s."pageId", s."id", s."ordinal", terms."ord"
        FROM "WikiPageSection" s
        JOIN unnest(${identifiers.map(wikiIdentifierPattern)}::text[]) WITH ORDINALITY AS terms("pattern", "ord")
          ON wiki_search_compact(s."pageTitle" || E'\\n' || retrieval_heading_text(s."headingPath"), s."text")
            ~ terms."pattern"
        WHERE s."companyId" = ${this.companyId} AND EXISTS (SELECT 1 FROM "WikiPage" live WHERE live."id" = s."pageId" AND live."deletedAt" IS NULL)
      ),
      selective AS (
        SELECT m."ord" FROM matches m GROUP BY m."ord"
        HAVING count(DISTINCT m."pageId") <= ${WIKI_IDENTIFIER_MAX_PAGES}::int
      ),
      pinned AS (
        SELECT DISTINCT ON (m."pageId") m."pageId", m."id" AS "sectionId", m."ord", m."ordinal"
        FROM matches m JOIN selective t ON t."ord" = m."ord"
        ORDER BY m."pageId", m."ord", m."ordinal"
      )
      SELECT p."pageId", p."sectionId" FROM pinned p ORDER BY p."ord", p."pageId"
    `);
  }

  private async typoCorrections(terms: string[]): Promise<Map<string, string>> {
    if (terms.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<Array<{ term: string; word: string }>>(
      sectionTypoCorrectionsSql(this.corpus, terms),
    );
    return new Map(rows.map(({ term, word }) => [term, word]));
  }

  async semanticSections(vector: number[], version: string, limit: number) {
    if (!(await this.semanticIndexAvailable())) return null;
    const [rows, unembedded] = await Promise.all([
      this.prisma.$queryRaw<Array<{ pageId: string; id: string; similarity: number }>>(
        semanticSectionsSql({
          corpus: this.corpus,
          vector,
          version,
          limit,
          penalty: Prisma.sql`CASE WHEN s."ordinal" = 0 THEN ${WIKI_SEMANTIC_INTRO_MARGIN}::float8 ELSE 0 END`,
        }),
      ),
      this.prisma.$queryRaw<Array<{ unembedded: boolean; stale: boolean }>>(Prisma.sql`
        SELECT
          EXISTS (SELECT 1 FROM "WikiPage" p WHERE p."companyId" = ${this.companyId} AND p."deletedAt" IS NULL AND ${this.unembeddedPage(version)})
            AS "unembedded",
          EXISTS (SELECT 1 FROM "WikiPage" p WHERE p."companyId" = ${this.companyId} AND p."deletedAt" IS NULL AND ${this.staleIndexPage(version)})
            AS "stale"
      `),
    ]);
    return {
      hits: rows.map(({ pageId, id, similarity }) => ({
        pageId,
        sectionId: id,
        similarity,
      })),
      complete: unembedded[0]?.unembedded === false,
      stale: unembedded[0]?.stale === true,
    };
  }

  async getSectionsByIds(ids: string[]): Promise<WikiSectionHit[]> {
    if (ids.length === 0) return [];
    return this.prisma.$queryRaw<WikiSectionHit[]>(Prisma.sql`
      SELECT h."id", h."pageId", h."offset", h."headingPath", h."anchor",
        (
          SELECT string_agg(p."text", E'\n\n' ORDER BY p."ordinal") FROM "WikiPageSection" p
          WHERE p."pageId" = h."pageId" AND p."offset" = h."offset" AND p."companyId" = h."companyId"
        ) AS "text"
      FROM "WikiPageSection" h
      WHERE h."id" = ANY(${ids}::text[]) AND h."companyId" = ${this.companyId} AND EXISTS (SELECT 1 FROM "WikiPage" live WHERE live."id" = h."pageId" AND live."deletedAt" IS NULL)
    `);
  }

  async getPagesByIds(ids: string[]) {
    if (ids.length === 0) return [];
    return this.prisma.wikiPage.findMany({
      where: { id: { in: ids }, companyId: this.companyId, deletedAt: null },
      select: {
        id: true,
        title: true,
        markdown: true,
        kind: true,
        whenToUse: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async claimStaleIndexPages(version: string, limit: number): Promise<WikiIndexPage[]> {
    return this.prisma.$queryRaw<WikiIndexPage[]>(Prisma.sql`
      WITH claimable AS MATERIALIZED (
        SELECT p."id" FROM "WikiPage" p
        WHERE p."companyId" = ${this.companyId} AND p."deletedAt" IS NULL
          AND (
            p."semanticIndexClaimedAt" IS NULL
            OR p."semanticIndexClaimedAt" < CURRENT_TIMESTAMP - make_interval(secs => ${WIKI_INDEX_CLAIM_SECONDS})
          )
          AND ${this.staleIndexPage(version)}
        ORDER BY p."updatedAt" DESC, p."id" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "WikiPage" w SET "semanticIndexClaimedAt" = CURRENT_TIMESTAMP
      FROM claimable c
      WHERE w."id" = c."id" AND w."companyId" = ${this.companyId}
      RETURNING w."id", w."title", w."markdown", w."updatedAt", w."summary", w."summaryContentHash",
        w."sourceImportedUpdatedAt"
    `);
  }

  async hasStaleIndexPages(version: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ stale: boolean }>>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1 FROM "WikiPage" p WHERE p."companyId" = ${this.companyId} AND p."deletedAt" IS NULL AND ${this.staleIndexPage(version)}
      ) AS "stale"
    `);
    return rows[0]?.stale === true;
  }

  async sectionEmbeddingsByHash(pageId: string, version: string) {
    const rows = await this.prisma.$queryRaw<Array<{ contentHash: string; embedding: string }>>(Prisma.sql`
      SELECT DISTINCT ON ("contentHash") "contentHash", "embedding"::text AS "embedding" FROM "WikiPageSection"
      WHERE "pageId" = ${pageId} AND "companyId" = ${this.companyId} AND "embeddingVersion" = ${version}
        AND "embedding" IS NOT NULL
      ORDER BY "contentHash", "createdAt" DESC
    `);
    return new Map(rows.map((row) => [row.contentHash, row.embedding]));
  }

  async storeSummary(args: { pageId: string; pageUpdatedAt: Date; summary: string | null; contentHash: string }) {
    const updated = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "WikiPage" SET "summary" = ${args.summary}, "summaryContentHash" = ${args.contentHash}
      WHERE "id" = ${args.pageId} AND "companyId" = ${this.companyId} AND "updatedAt" = ${args.pageUpdatedAt}
    `);
    return updated === 1;
  }

  async releaseIndexClaims(pageIds: string[]) {
    if (pageIds.length === 0) return;
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "WikiPage" SET "semanticIndexClaimedAt" = NULL
      WHERE "id" = ANY(${pageIds}::text[]) AND "companyId" = ${this.companyId}
    `);
  }

  async claimIndexSchedule(intervalSeconds: number): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ companyId: string }>>(Prisma.sql`
      INSERT INTO "WikiIndexSchedule" ("companyId", "scheduledAt")
      VALUES (${this.companyId}, CURRENT_TIMESTAMP)
      ON CONFLICT ("companyId") DO UPDATE SET "scheduledAt" = EXCLUDED."scheduledAt"
      WHERE "WikiIndexSchedule"."scheduledAt" < CURRENT_TIMESTAMP - make_interval(secs => ${intervalSeconds})
      RETURNING "companyId"
    `);
    return rows.length === 1;
  }
}
