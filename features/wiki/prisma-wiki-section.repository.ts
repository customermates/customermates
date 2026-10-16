import type { SectionCorpusSql } from "@/core/retrieval/section-search-sql";
import type {
  SearchWikiPagesRepo,
  WikiFullTextSections,
  WikiSectionHit,
  WikiSectionMatch,
  WikiSectionSync,
} from "@/features/wiki/search-wiki-pages.repo";
import type { WikiSemanticIndexRepo } from "@/ee/wiki-retrieval/wiki-semantic-index.repo";
import type { WikiIndexClaim, WikiIndexPage } from "@/ee/wiki-retrieval/wiki-semantic-index.service";
import type { WikiIndexClaimRepo } from "./wiki-index-claim.repo";
import type { WikiSectionRow } from "./wiki-sections";
import type { SyncStaleWikiSectionsRepo } from "./sync-stale-wiki-sections.repo";

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
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { Transaction } from "@/core/decorators/transaction.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { isBusyDatabaseError } from "@/core/errors/prisma-client-error";

import { wikiIdentifierPattern, wikiIdentifierTerms } from "./wiki-identifiers";
import { UNCLAIMED_WIKI_INDEX_PAGE, staleWikiIndexPage, unembeddedWikiPage, unsyncedWikiPage } from "./wiki-index-sql";
import { wikiSectionRows } from "./wiki-sections";
import { currentWikiSummary } from "./wiki-summary";

const WIKI_FULL_TEXT_CONFIGS = ["english", "german", "spanish", "french", "italian"] as const;
const WIKI_SECTION_COLUMNS = ["pageId", "offset", "ordinal", "pageUpdatedAt"] as const;
const WIKI_IDENTIFIER_MAX_PAGES = 3;
const WIKI_SECTION_SYNC_LIMIT = 100;
const WIKI_SECTION_SEARCH_LOCK_WAIT_MS = 100;
const WIKI_SEMANTIC_INTRO_MARGIN = 0.03;

let sectionEmbeddingColumn: Promise<boolean> | undefined;

type RankedRow = {
  id: string | null;
  pageId: string;
  coverage: number;
  matched: number[] | null;
};

type WikiSectionReplacement = {
  pageId: string;
  pageUpdatedAt: Date;
  pageTitle: string;
  summary: string | null;
  rows: WikiSectionRow[];
  embeddings: ReadonlyMap<string, string>;
  version: string | null;
  onlyIfStale: boolean;
};

export class PrismaWikiSectionRepo
  extends TenantRepository
  implements SearchWikiPagesRepo, WikiSemanticIndexRepo, SyncStaleWikiSectionsRepo
{
  constructor(private readonly pages: WikiIndexClaimRepo) {
    super();
  }

  private get corpus(): SectionCorpusSql {
    return {
      table: Prisma.raw('"WikiPageSection"'),
      scope: Prisma.sql`s."companyId" = ${this.companyId} AND EXISTS (SELECT 1 FROM "WikiPage" live WHERE live."id" = s."pageId" AND live."companyId" = s."companyId" AND live."deletedAt" IS NULL)`,
      group: Prisma.sql`s."pageId"`,
      columns: WIKI_SECTION_COLUMNS,
      order: Prisma.sql`s."pageUpdatedAt" DESC, s."pageId" ASC, s."ordinal" ASC`,
      configs: WIKI_FULL_TEXT_CONFIGS,
      stopConfig: textSearchConfigFor(this.user.displayLanguage),
    };
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
    return this.syncStalePages(this.companyId, limit, Prisma.empty, (args) => this.replaceSections(args));
  }

  async syncStaleSectionsUnlessBusy(limit = WIKI_SECTION_SYNC_LIMIT): Promise<WikiSectionSync> {
    return this.syncStalePages(
      this.companyId,
      limit,
      Prisma.empty,
      (args) =>
        runInTransaction(() => this.writeSections(this.companyId, args), {
          companyLockWait: WIKI_SECTION_SEARCH_LOCK_WAIT_MS,
        }),
      true,
    );
  }

  @BypassTenantGuard
  async findCompaniesWithStaleSectionsUnscoped(limit: number): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ companyId: string }>>(Prisma.sql`
      SELECT DISTINCT p."companyId" FROM "WikiPage" p
      WHERE p."deletedAt" IS NULL AND ${unsyncedWikiPage()} AND ${UNCLAIMED_WIKI_INDEX_PAGE}
      ORDER BY p."companyId" ASC
      LIMIT ${limit}
    `);
    return rows.map((row) => row.companyId);
  }

  @BypassTenantGuard
  async syncStaleSectionsUnscoped(companyId: string, limit: number): Promise<WikiSectionSync> {
    return this.syncStalePages(companyId, limit, Prisma.sql`AND ${UNCLAIMED_WIKI_INDEX_PAGE}`, (args) =>
      this.withCompanyTransaction(companyId, () => this.writeSections(companyId, args)),
    );
  }

  private async syncStalePages(
    companyId: string,
    limit: number,
    filter: Prisma.Sql,
    replace: (args: WikiSectionReplacement) => Promise<boolean>,
    stopWhenBusy = false,
  ): Promise<WikiSectionSync> {
    const found = await this.prisma.$queryRaw<WikiIndexPage[]>(Prisma.sql`
      SELECT p."id", p."title", p."markdown", p."updatedAt", p."summary", p."summaryContentHash",
        p."sourceImportedUpdatedAt"
      FROM "WikiPage" p
      WHERE p."companyId" = ${companyId} AND p."deletedAt" IS NULL AND ${unsyncedWikiPage()} ${filter}
      ORDER BY p."updatedAt" DESC, p."id" ASC
      LIMIT ${limit + 1}
    `);
    let synced = 0;
    for (const page of found.slice(0, limit)) {
      const summary = currentWikiSummary(page);
      try {
        const written = await replace({
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
      } catch (error) {
        if (stopWhenBusy && isBusyDatabaseError(error)) return { synced, remaining: true };
        throw error;
      }
    }
    return { synced, remaining: found.length > limit };
  }

  @Transaction
  async replaceSections(args: WikiSectionReplacement): Promise<boolean> {
    return this.writeSections(this.companyId, args);
  }

  private async writeSections(companyId: string, args: WikiSectionReplacement): Promise<boolean> {
    const current = await this.prisma.$queryRaw<Array<{ updatedAt: Date; synced: boolean }>>(Prisma.sql`
      SELECT p."updatedAt", NOT ${unsyncedWikiPage()} AS "synced"
      FROM "WikiPage" p WHERE p."id" = ${args.pageId} AND p."companyId" = ${companyId} FOR UPDATE
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
          WHERE "pageId" = ${args.pageId} AND "companyId" = ${companyId}
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
      DELETE FROM "WikiPageSection" WHERE "pageId" = ${args.pageId} AND "companyId" = ${companyId}
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
      SELECT gen_random_uuid()::text, ${companyId}, ${args.pageId}, r."ordinal", r."offset", ${args.pageTitle},
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
        WHERE s."companyId" = ${this.companyId} AND EXISTS (SELECT 1 FROM "WikiPage" live WHERE live."id" = s."pageId" AND live."companyId" = s."companyId" AND live."deletedAt" IS NULL)
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
          EXISTS (SELECT 1 FROM "WikiPage" p WHERE p."companyId" = ${this.companyId} AND p."deletedAt" IS NULL AND ${unembeddedWikiPage(version)})
            AS "unembedded",
          EXISTS (SELECT 1 FROM "WikiPage" p WHERE p."companyId" = ${this.companyId} AND p."deletedAt" IS NULL AND ${staleWikiIndexPage(version)})
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
      WHERE h."id" = ANY(${ids}::text[]) AND h."companyId" = ${this.companyId} AND EXISTS (SELECT 1 FROM "WikiPage" live WHERE live."id" = h."pageId" AND live."companyId" = h."companyId" AND live."deletedAt" IS NULL)
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

  claimStaleIndexPages(version: string, limit: number): Promise<WikiIndexClaim[]> {
    return this.pages.claimStaleIndexPages(version, limit);
  }

  async hasStaleIndexPages(version: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ stale: boolean }>>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1 FROM "WikiPage" p WHERE p."companyId" = ${this.companyId} AND p."deletedAt" IS NULL AND ${staleWikiIndexPage(version)}
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

  storeSummary(args: { pageId: string; pageUpdatedAt: Date; summary: string | null; contentHash: string }) {
    return this.pages.storeSummary(args);
  }

  releaseIndexClaims(pageIds: string[]) {
    return this.pages.releaseIndexClaims(pageIds);
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
