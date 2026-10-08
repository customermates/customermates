import { DocsSectionRepo } from "./docs-section.repo";
import type { DocsCorpus, DocsSectionPart } from "./docs-corpus";
import type { FullTextUnit } from "@/core/retrieval/full-text-query";
import type { DocsLocale, DocsSource } from "./docs-manifest";
import type { SectionCorpusSql } from "@/core/retrieval/section-search-sql";

import { Prisma } from "@/generated/prisma";

import { textSearchConfigFor, typoCandidates } from "@/core/retrieval/full-text-query";
import {
  rankedSectionsSql,
  sectionEmbeddingAvailableSql,
  sectionTypoCorrectionsSql,
  semanticSectionsSql,
} from "@/core/retrieval/section-search-sql";
import { prisma } from "@/prisma/db";
import { runWithoutTenant } from "@/core/decorators/tenant-context";

const DOCS_SYNC_LOCK = "DocsSection:sync";
const DOCS_SYNC_TIMEOUT_MS = 120_000;
const DOCS_SYNC_BATCH = 500;
const DOCS_BUILD_RETENTION_DAYS = 7;
const DOCS_ROW_COLUMNS = ["source", "slug", "sectionOrder", "partOrdinal", "anchor"] as const;

export type DocsScope = {
  buildHash: string;
  locale: DocsLocale;
  sources: readonly DocsSource[];
  slug?: string;
};
export type DocsSectionRow = {
  source: DocsSource;
  slug: string;
  sectionOrder: number;
  partOrdinal: number;
  anchor: string;
};
export type DocsFullTextRow = DocsSectionRow & { coverage: number };
export type DocsSemanticRow = DocsSectionRow & { similarity: number };
export type DocsStoredBuild = { buildHash: string; current: boolean };
export type DocsPendingPart = { contentHash: string };

const syncedBuilds = new Map<string, Promise<void>>();
const completeBuilds = new Set<string>();
const completeSemanticIndexes = new Set<string>();
let embeddingColumn: Promise<boolean> | undefined;

function scopeFilter(scope: DocsScope) {
  return Prisma.sql`s."buildHash" = ${scope.buildHash} AND s."locale" = ${scope.locale}
    AND s."source" = ANY(${[...scope.sources]}::text[])
    ${scope.slug === undefined ? Prisma.empty : Prisma.sql`AND s."slug" = ${scope.slug}`}`;
}

function docsCorpusSql(scope: DocsScope): SectionCorpusSql {
  const config = textSearchConfigFor(scope.locale);
  return {
    table: Prisma.raw('"DocsSection"'),
    scope: scopeFilter(scope),
    group: Prisma.sql`s."source" || ':' || s."slug" || ':' || s."sectionOrder"::text`,
    columns: DOCS_ROW_COLUMNS,
    order: Prisma.sql`s."source", s."slug", s."sectionOrder", s."partOrdinal"`,
    configs: [config],
    stopConfig: config,
  };
}

function partColumns(parts: readonly DocsSectionPart[]) {
  return Prisma.sql`unnest(
    ${parts.map((part) => part.locale)}::text[],
    ${parts.map((part) => part.source)}::text[],
    ${parts.map((part) => part.slug)}::text[],
    ${parts.map((part) => part.sectionOrder)}::int[],
    ${parts.map((part) => part.partOrdinal)}::int[],
    ${parts.map((part) => part.anchor)}::text[],
    ${parts.map((part) => part.pageTitle)}::text[],
    ${parts.map((part) => JSON.stringify(part.headingPath))}::text[],
    ${parts.map((part) => part.text)}::text[],
    ${parts.map((part) => part.contentHash)}::text[]
  ) AS c("locale", "source", "slug", "sectionOrder", "partOrdinal", "anchor", "pageTitle", "headingPath", "text",
    "contentHash")`;
}

export class PrismaDocsSectionRepo extends DocsSectionRepo {
  async semanticIndexAvailable() {
    embeddingColumn ??= prisma
      .$queryRaw<Array<{ available: boolean }>>(sectionEmbeddingAvailableSql("DocsSection"))
      .then((rows) => rows[0]?.available === true)
      .catch((error: unknown) => {
        embeddingColumn = undefined;
        throw error;
      });
    return embeddingColumn;
  }

  async semanticIndexComplete(scope: DocsScope, version: string) {
    if (!(await this.semanticIndexAvailable())) return false;
    const key = [scope.buildHash, scope.locale, scope.slug ?? "", version, ...scope.sources].join("\u0000");
    if (completeSemanticIndexes.has(key)) return true;
    const rows = await prisma.$queryRaw<Array<{ missing: boolean }>>(Prisma.sql`
      SELECT EXISTS (
        SELECT 1 FROM "DocsSection" s
        WHERE ${scopeFilter(scope)} AND (s."embedding" IS NULL OR s."embeddingVersion" IS DISTINCT FROM ${version})
      ) AS "missing"
    `);
    const complete = rows[0]?.missing === false;
    if (complete) completeSemanticIndexes.add(key);
    return complete;
  }

  ensureCorpus(corpus: DocsCorpus): Promise<void> {
    const known = syncedBuilds.get(corpus.buildHash);
    if (known) return known;
    const syncing = this.syncCorpus(corpus).catch((error: unknown) => {
      syncedBuilds.delete(corpus.buildHash);
      throw error;
    });
    syncedBuilds.set(corpus.buildHash, syncing);
    return syncing;
  }

  async storedBuild(corpus: DocsCorpus): Promise<DocsStoredBuild | null> {
    if (completeBuilds.has(corpus.buildHash)) return { buildHash: corpus.buildHash, current: true };
    const rows = await runWithoutTenant(() =>
      prisma.docsSection.groupBy({
        by: ["buildHash"],
        _count: { _all: true },
        _max: { createdAt: true },
        orderBy: [{ _max: { createdAt: "desc" } }, { buildHash: "asc" }],
      }),
    );
    const builds = rows.map((row) => ({
      buildHash: row.buildHash,
      count: row._count._all,
    }));
    if (builds.find((build) => build.buildHash === corpus.buildHash)?.count === corpus.parts.length) {
      completeBuilds.add(corpus.buildHash);
      return { buildHash: corpus.buildHash, current: true };
    }
    const previous = builds.find((build) => build.buildHash !== corpus.buildHash && build.count > 0);
    return previous ? { buildHash: previous.buildHash, current: false } : null;
  }

  private storedParts(buildHash: string, client: Pick<typeof prisma, "docsSection"> = prisma) {
    return runWithoutTenant(() => client.docsSection.count({ where: { buildHash } }));
  }

  private async syncCorpus(corpus: DocsCorpus) {
    await this.writeCorpus(corpus);
    completeBuilds.add(corpus.buildHash);
  }

  private async writeCorpus(corpus: DocsCorpus) {
    if ((await this.storedParts(corpus.buildHash)) === corpus.parts.length) return;
    const withEmbedding = await this.semanticIndexAvailable();
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${DOCS_SYNC_LOCK}))`);
        if ((await this.storedParts(corpus.buildHash, tx)) === corpus.parts.length) return;
        for (let start = 0; start < corpus.parts.length; start += DOCS_SYNC_BATCH) {
          const batch = corpus.parts.slice(start, start + DOCS_SYNC_BATCH);
          const reused = withEmbedding ? Prisma.sql`, "embeddingVersion", "embedding"` : Prisma.empty;
          const reusedValues = withEmbedding ? Prisma.sql`, known."embeddingVersion", known."embedding"` : Prisma.empty;
          const knownJoin = withEmbedding
            ? Prisma.sql`LEFT JOIN LATERAL (
                SELECT d."embeddingVersion", d."embedding" FROM "DocsSection" d
                WHERE d."contentHash" = c."contentHash" AND d."embedding" IS NOT NULL
                ORDER BY d."createdAt" DESC LIMIT 1
              ) AS known ON true`
            : Prisma.empty;
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO "DocsSection" (
              "id", "buildHash", "locale", "source", "slug", "sectionOrder", "partOrdinal", "anchor", "pageTitle",
              "headingPath", "language", "text", "contentHash" ${reused}
            )
            SELECT gen_random_uuid()::text, ${corpus.buildHash}, c."locale", c."source", c."slug", c."sectionOrder",
              c."partOrdinal", c."anchor", c."pageTitle", ARRAY(SELECT jsonb_array_elements_text(c."headingPath"::jsonb)),
              c."locale", c."text", c."contentHash" ${reusedValues}
            FROM ${partColumns(batch)}
            ${knownJoin}
            ON CONFLICT ("buildHash", "locale", "source", "slug", "sectionOrder", "partOrdinal") DO NOTHING
          `);
        }
        await tx.$executeRaw(Prisma.sql`
          DELETE FROM "DocsSection"
          WHERE "buildHash" <> ${corpus.buildHash}
            AND "createdAt" < CURRENT_TIMESTAMP - make_interval(days => ${DOCS_BUILD_RETENTION_DAYS})
        `);
      },
      { timeout: DOCS_SYNC_TIMEOUT_MS, maxWait: DOCS_SYNC_TIMEOUT_MS },
    );
  }

  async fullTextSections(scope: DocsScope, units: readonly FullTextUnit[], limit: number): Promise<DocsFullTextRow[]> {
    const found = await this.rankedSections(scope, units, limit);
    const corrections = await this.typoCorrections(scope, typoCandidates(units, found.matched));
    if (corrections.size === 0) return found.rows;
    const corrected = units.map((unit) => ({
      ...unit,
      text: corrections.get(unit.text) ?? unit.text,
    }));
    return (await this.rankedSections(scope, corrected, limit)).rows;
  }

  private async rankedSections(scope: DocsScope, units: readonly FullTextUnit[], limit: number) {
    if (units.length === 0) return { rows: [], matched: new Set<number>() };
    const rows = await prisma.$queryRaw<
      Array<(DocsFullTextRow & { id: string | null }) & { matched: number[] | null }>
    >(rankedSectionsSql({ corpus: docsCorpusSql(scope), units, limit }));
    return {
      rows: rows.flatMap(({ id, source, slug, sectionOrder, partOrdinal, anchor, coverage }) =>
        id === null ? [] : [{ source, slug, sectionOrder, partOrdinal, anchor, coverage }],
      ),
      matched: new Set(rows.find(({ id }) => id === null)?.matched ?? []),
    };
  }

  private async typoCorrections(scope: DocsScope, terms: string[]): Promise<Map<string, string>> {
    if (terms.length === 0) return new Map();
    const rows = await prisma.$queryRaw<Array<{ term: string; word: string }>>(
      sectionTypoCorrectionsSql(docsCorpusSql(scope), terms),
    );
    return new Map(rows.map(({ term, word }) => [term, word]));
  }

  async semanticSections(scope: DocsScope, vector: number[], version: string, limit: number) {
    if (!(await this.semanticIndexAvailable())) return null;
    const rows = await prisma.$queryRaw<Array<DocsSemanticRow & { group: string; id: string }>>(
      semanticSectionsSql({
        corpus: docsCorpusSql(scope),
        vector,
        version,
        limit,
      }),
    );
    return rows.map(({ source, slug, sectionOrder, partOrdinal, anchor, similarity }) => ({
      source,
      slug,
      sectionOrder,
      partOrdinal,
      anchor,
      similarity,
    }));
  }

  async pendingEmbeddings(buildHash: string, version: string, limit: number): Promise<DocsPendingPart[]> {
    if (!(await this.semanticIndexAvailable())) return [];
    return prisma.$queryRaw<DocsPendingPart[]>(Prisma.sql`
      SELECT DISTINCT ON (s."contentHash") s."contentHash"
      FROM "DocsSection" s
      WHERE s."buildHash" = ${buildHash}
        AND (s."embedding" IS NULL OR s."embeddingVersion" IS DISTINCT FROM ${version})
      ORDER BY s."contentHash"
      LIMIT ${limit}
    `);
  }

  async storeEmbeddings(version: string, rows: Array<{ contentHash: string; embedding: string }>) {
    if (rows.length === 0) return;
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "DocsSection" AS s SET "embedding" = v."embedding"::vector, "embeddingVersion" = ${version}
      FROM unnest(
        ${rows.map((row) => row.contentHash)}::text[],
        ${rows.map((row) => row.embedding)}::text[]
      ) AS v("contentHash", "embedding")
      WHERE s."contentHash" = v."contentHash"
    `);
  }
}
