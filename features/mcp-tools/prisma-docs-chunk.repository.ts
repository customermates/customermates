import type { DocsChunk, DocsCorpus } from "./docs-corpus";
import type { FullTextUnit } from "@/core/retrieval/full-text-query";

import { Prisma } from "@/generated/prisma";

import { fullTextUnitsCte, idfWeight, textSearchConfigFor } from "@/core/retrieval/full-text-query";
import { RETRIEVAL_SEMANTIC_MIN_SIMILARITY } from "@/core/retrieval/retrieval-pipeline";
import { prisma } from "@/prisma/db";

const DOCS_SYNC_LOCK = "DocsChunk:sync";
const DOCS_SYNC_TIMEOUT_MS = 120_000;
const DOCS_SYNC_BATCH = 500;
const DOCS_BUILD_RETENTION_DAYS = 7;
const DOCS_TITLE_WEIGHT = 2;

export type DocsScope = { buildHash: string; locale: string; sources: readonly string[]; slug?: string };
export type DocsSectionRow = {
  source: string;
  slug: string;
  sectionOrder: number;
  chunkOrdinal: number;
  anchor: string;
};
export type DocsFullTextRow = DocsSectionRow & { coverage: number };
export type DocsSemanticRow = DocsSectionRow & { similarity: number };
export type DocsStoredBuild = { buildHash: string; current: boolean };
export type DocsPendingChunk = { contentHash: string; label: string; body: string };

export abstract class DocsChunkRepo {
  abstract ensureCorpus(corpus: DocsCorpus): Promise<void>;
  abstract storedBuild(corpus: DocsCorpus): Promise<DocsStoredBuild | null>;
  abstract fullTextSections(
    scope: DocsScope,
    units: readonly FullTextUnit[],
    limit: number,
  ): Promise<DocsFullTextRow[]>;
  abstract semanticSections(
    scope: DocsScope,
    vector: number[],
    model: string,
    limit: number,
  ): Promise<DocsSemanticRow[] | null>;
  abstract semanticIndexAvailable(): Promise<boolean>;
  abstract pendingEmbeddings(buildHash: string, model: string, limit: number): Promise<DocsPendingChunk[]>;
  abstract storeEmbeddings(model: string, rows: Array<{ contentHash: string; embedding: string }>): Promise<void>;
}

const syncedBuilds = new Map<string, Promise<void>>();
const completeBuilds = new Set<string>();
let embeddingColumn: Promise<boolean> | undefined;

function scopeFilter(scope: DocsScope) {
  return Prisma.sql`c."buildHash" = ${scope.buildHash} AND c."locale" = ${scope.locale}
    AND c."source" = ANY(${[...scope.sources]}::text[])
    ${scope.slug === undefined ? Prisma.empty : Prisma.sql`AND c."slug" = ${scope.slug}`}`;
}

function chunkColumns(chunks: readonly DocsChunk[]) {
  return Prisma.sql`unnest(
    ${chunks.map((chunk) => chunk.locale)}::text[],
    ${chunks.map((chunk) => chunk.source)}::text[],
    ${chunks.map((chunk) => chunk.slug)}::text[],
    ${chunks.map((chunk) => chunk.sectionOrder)}::int[],
    ${chunks.map((chunk) => chunk.chunkOrdinal)}::int[],
    ${chunks.map((chunk) => chunk.charOffset)}::int[],
    ${chunks.map((chunk) => chunk.anchor)}::text[],
    ${chunks.map((chunk) => chunk.pageTitle)}::text[],
    ${chunks.map((chunk) => JSON.stringify(chunk.headingPath))}::text[],
    ${chunks.map((chunk) => chunk.label)}::text[],
    ${chunks.map((chunk) => chunk.body)}::text[],
    ${chunks.map((chunk) => chunk.contentHash)}::text[]
  ) AS c("locale", "source", "slug", "sectionOrder", "chunkOrdinal", "charOffset", "anchor", "pageTitle",
    "headingPath", "label", "body", "contentHash")`;
}

export class PrismaDocsChunkRepo extends DocsChunkRepo {
  async semanticIndexAvailable() {
    embeddingColumn ??= prisma
      .$queryRaw<Array<{ available: boolean }>>(
        Prisma.sql`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'DocsChunk' AND column_name = 'embedding'
        ) AS "available"
      `,
      )
      .then((rows) => rows[0]?.available === true)
      .catch((error: unknown) => {
        embeddingColumn = undefined;
        throw error;
      });
    return embeddingColumn;
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
    const builds = await prisma.$queryRaw<Array<{ buildHash: string; count: number }>>(Prisma.sql`
      SELECT "buildHash", count(*)::int AS "count" FROM "DocsChunk"
      GROUP BY "buildHash"
      ORDER BY max("createdAt") DESC, "buildHash"
    `);
    if (builds.find((build) => build.buildHash === corpus.buildHash)?.count === corpus.chunks.length) {
      completeBuilds.add(corpus.buildHash);
      return { buildHash: corpus.buildHash, current: true };
    }
    const previous = builds.find((build) => build.buildHash !== corpus.buildHash && build.count > 0);
    return previous ? { buildHash: previous.buildHash, current: false } : null;
  }

  private async storedChunks(buildHash: string, client: Pick<typeof prisma, "$queryRaw"> = prisma) {
    const rows = await client.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT count(*)::int AS "count" FROM "DocsChunk" WHERE "buildHash" = ${buildHash}
    `);
    return rows[0]?.count ?? 0;
  }

  private async syncCorpus(corpus: DocsCorpus) {
    await this.writeCorpus(corpus);
    completeBuilds.add(corpus.buildHash);
  }

  private async writeCorpus(corpus: DocsCorpus) {
    if ((await this.storedChunks(corpus.buildHash)) === corpus.chunks.length) return;
    const withEmbedding = await this.semanticIndexAvailable();
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${DOCS_SYNC_LOCK}))`);
        if ((await this.storedChunks(corpus.buildHash, tx)) === corpus.chunks.length) return;
        for (let start = 0; start < corpus.chunks.length; start += DOCS_SYNC_BATCH) {
          const batch = corpus.chunks.slice(start, start + DOCS_SYNC_BATCH);
          const reused = withEmbedding ? Prisma.sql`, "model", "embedding"` : Prisma.empty;
          const reusedValues = withEmbedding ? Prisma.sql`, known."model", known."embedding"` : Prisma.empty;
          const knownJoin = withEmbedding
            ? Prisma.sql`LEFT JOIN LATERAL (
                SELECT d."model", d."embedding" FROM "DocsChunk" d
                WHERE d."contentHash" = c."contentHash" AND d."embedding" IS NOT NULL
                ORDER BY d."createdAt" DESC LIMIT 1
              ) AS known ON true`
            : Prisma.empty;
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO "DocsChunk" (
              "id", "buildHash", "locale", "source", "slug", "sectionOrder", "chunkOrdinal", "charOffset", "anchor",
              "pageTitle", "headingPath", "label", "body", "contentHash" ${reused}
            )
            SELECT gen_random_uuid()::text, ${corpus.buildHash}, c."locale", c."source", c."slug", c."sectionOrder",
              c."chunkOrdinal", c."charOffset", c."anchor", c."pageTitle",
              ARRAY(SELECT jsonb_array_elements_text(c."headingPath"::jsonb)), c."label", c."body", c."contentHash"
              ${reusedValues}
            FROM ${chunkColumns(batch)}
            ${knownJoin}
            ON CONFLICT ("buildHash", "locale", "source", "slug", "sectionOrder", "chunkOrdinal") DO NOTHING
          `);
        }
        await tx.$executeRaw(Prisma.sql`
          DELETE FROM "DocsChunk"
          WHERE "buildHash" <> ${corpus.buildHash}
            AND "createdAt" < CURRENT_TIMESTAMP - make_interval(days => ${DOCS_BUILD_RETENTION_DAYS})
        `);
      },
      { timeout: DOCS_SYNC_TIMEOUT_MS, maxWait: DOCS_SYNC_TIMEOUT_MS },
    );
  }

  async fullTextSections(scope: DocsScope, units: readonly FullTextUnit[], limit: number): Promise<DocsFullTextRow[]> {
    if (!units.some((unit) => !unit.substring)) return [];
    const config = textSearchConfigFor(scope.locale);
    return prisma.$queryRaw<DocsFullTextRow[]>(Prisma.sql`
      WITH ${fullTextUnitsCte({ units, configs: [config], stopConfig: config })},
      scoped AS MATERIALIZED (
        SELECT c."source", c."slug", c."sectionOrder", c."chunkOrdinal", c."anchor", c."searchVector"
        FROM "DocsChunk" c WHERE ${scopeFilter(scope)}
      ),
      hits AS MATERIALIZED (
        SELECT s."source", s."slug", s."sectionOrder", u."ord",
          bool_or(ts_filter(s."searchVector", '{a}'::"char"[]) @@ u."query") AS "title"
        FROM scoped s JOIN units u ON s."searchVector" @@ u."query"
        GROUP BY s."source", s."slug", s."sectionOrder", u."ord"
      ),
      frequency AS (SELECT h."ord", count(*)::float8 AS "sections" FROM hits h GROUP BY h."ord"),
      total AS (
        SELECT count(*)::float8 AS "sections"
        FROM (SELECT DISTINCT s."source", s."slug", s."sectionOrder" FROM scoped s) AS d
      ),
      weights AS (
        SELECT u."ord", ${idfWeight(Prisma.sql`t."sections"`, Prisma.sql`coalesce(f."sections", 0)`)} AS "weight"
        FROM units u CROSS JOIN total t LEFT JOIN frequency f ON f."ord" = u."ord"
      ),
      "queryWeight" AS (SELECT sum(w."weight") AS "weight" FROM weights w),
      scored AS (
        SELECT h."source", h."slug", h."sectionOrder",
          round(
            sum(${idfWeight(Prisma.sql`t."sections"`, Prisma.sql`f."sections"`)}
              * CASE WHEN h."title" THEN ${DOCS_TITLE_WEIGHT}::float8 ELSE 1 END)::numeric,
            9
          ) AS "score",
          (sum(w."weight") / nullif(max(q."weight"), 0))::float8 AS "coverage"
        FROM hits h JOIN frequency f ON f."ord" = h."ord" JOIN weights w ON w."ord" = h."ord"
          CROSS JOIN total t CROSS JOIN "queryWeight" q
        GROUP BY h."source", h."slug", h."sectionOrder"
        ORDER BY "score" DESC, h."source", h."slug", h."sectionOrder"
        LIMIT ${limit * 2}
      ),
      chunks AS (
        SELECT DISTINCT ON (s."source", s."slug", s."sectionOrder")
          s."source", s."slug", s."sectionOrder", s."chunkOrdinal", s."anchor",
          ts_rank_cd(s."searchVector", a."query", 1) AS "rank"
        FROM scoped s
        JOIN scored r ON r."source" = s."source" AND r."slug" = s."slug" AND r."sectionOrder" = s."sectionOrder"
        CROSS JOIN "anyUnit" a
        ORDER BY s."source", s."slug", s."sectionOrder", ts_rank_cd(s."searchVector", a."query", 1) DESC,
          s."chunkOrdinal"
      )
      SELECT r."source", r."slug", r."sectionOrder", c."chunkOrdinal", c."anchor", coalesce(r."coverage", 0) AS "coverage"
      FROM scored r
      JOIN chunks c ON c."source" = r."source" AND c."slug" = r."slug" AND c."sectionOrder" = r."sectionOrder"
      ORDER BY r."score" DESC, c."rank" DESC, r."source", r."slug", r."sectionOrder"
      LIMIT ${limit}
    `);
  }

  async semanticSections(scope: DocsScope, vector: number[], model: string, limit: number) {
    if (!(await this.semanticIndexAvailable())) return null;
    const embedding = `[${vector.join(",")}]`;
    return prisma.$queryRaw<DocsSemanticRow[]>(Prisma.sql`
      WITH distances AS MATERIALIZED (
        SELECT c."source", c."slug", c."sectionOrder", c."chunkOrdinal", c."anchor",
          c."embedding" <=> ${embedding}::vector AS "distance"
        FROM "DocsChunk" c
        WHERE ${scopeFilter(scope)} AND c."model" = ${model} AND c."embedding" IS NOT NULL
      ),
      best AS (
        SELECT DISTINCT ON (d."source", d."slug", d."sectionOrder") d.*
        FROM distances d
        WHERE d."distance" <= ${1 - RETRIEVAL_SEMANTIC_MIN_SIMILARITY}
        ORDER BY d."source", d."slug", d."sectionOrder", d."distance", d."chunkOrdinal"
      )
      SELECT b."source", b."slug", b."sectionOrder", b."chunkOrdinal", b."anchor", (1 - b."distance")::float8 AS "similarity"
      FROM best b
      ORDER BY b."distance", b."source", b."slug", b."sectionOrder"
      LIMIT ${limit}
    `);
  }

  async pendingEmbeddings(buildHash: string, model: string, limit: number): Promise<DocsPendingChunk[]> {
    if (!(await this.semanticIndexAvailable())) return [];
    return prisma.$queryRaw<DocsPendingChunk[]>(Prisma.sql`
      SELECT DISTINCT ON (c."contentHash") c."contentHash", c."label", c."body"
      FROM "DocsChunk" c
      WHERE c."buildHash" = ${buildHash}
        AND (c."embedding" IS NULL OR c."model" IS DISTINCT FROM ${model})
      ORDER BY c."contentHash"
      LIMIT ${limit}
    `);
  }

  async storeEmbeddings(model: string, rows: Array<{ contentHash: string; embedding: string }>) {
    if (rows.length === 0) return;
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "DocsChunk" AS c SET "embedding" = v."embedding"::vector, "model" = ${model}
      FROM unnest(
        ${rows.map((row) => row.contentHash)}::text[],
        ${rows.map((row) => row.embedding)}::text[]
      ) AS v("contentHash", "embedding")
      WHERE c."contentHash" = v."contentHash"
    `);
  }
}
