import type { SearchCatalogText, StaticSearchCatalog } from "./search-catalog-corpus";

import { Prisma } from "@/generated/prisma";
import { prisma } from "@/prisma/db";

import { SearchCatalogRepo, type SearchCatalogMatch, type SearchCatalogScope } from "./search-catalog.repo";

const STATIC_SYNC_LOCK = "SearchCatalogEntry:static";
const WORKSPACE_SYNC_LOCK = "SearchCatalogEntry:workspace:";
const SYNC_TIMEOUT_MS = 60_000;
const STATIC_BUILD_RETENTION_DAYS = 7;
const CLAIM_EXPIRY_SECONDS = 300;

const syncedBuilds = new Map<string, Promise<void>>();
let embeddingColumn: Promise<boolean> | undefined;

function scopeFilter(scope: SearchCatalogScope, alias: Prisma.Sql = Prisma.sql`e`) {
  return "companyId" in scope
    ? Prisma.sql`${alias}."companyId" = ${scope.companyId}`
    : Prisma.sql`${alias}."companyId" IS NULL AND ${alias}."buildHash" = ${scope.buildHash}`;
}

function textColumns(entries: readonly SearchCatalogText[]) {
  return Prisma.sql`unnest(
    ${entries.map((entry) => entry.targetId)}::text[],
    ${entries.map((entry) => entry.text)}::text[],
    ${entries.map((entry) => entry.contentHash)}::text[]
  ) AS v("targetId", "text", "contentHash")`;
}

export class PrismaSearchCatalogRepo extends SearchCatalogRepo {
  semanticIndexAvailable(): Promise<boolean> {
    embeddingColumn ??= prisma
      .$queryRaw<Array<{ available: boolean }>>(
        Prisma.sql`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'SearchCatalogEntry' AND column_name = 'embedding'
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

  ensureStaticCatalog(catalog: StaticSearchCatalog): Promise<void> {
    const known = syncedBuilds.get(catalog.buildHash);
    if (known) return known;
    const syncing = this.writeStaticCatalog(catalog).catch((error: unknown) => {
      syncedBuilds.delete(catalog.buildHash);
      throw error;
    });
    syncedBuilds.set(catalog.buildHash, syncing);
    return syncing;
  }

  private async storedStaticEntries(buildHash: string, client: Pick<typeof prisma, "$queryRaw"> = prisma) {
    const rows = await client.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT count(*)::int AS "count" FROM "SearchCatalogEntry" e WHERE e."companyId" IS NULL AND e."buildHash" = ${buildHash}
    `);
    return rows[0]?.count ?? 0;
  }

  private async writeStaticCatalog(catalog: StaticSearchCatalog) {
    if ((await this.storedStaticEntries(catalog.buildHash)) === catalog.entries.length) return;
    const withEmbedding = await this.semanticIndexAvailable();
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${STATIC_SYNC_LOCK}))`);
        if ((await this.storedStaticEntries(catalog.buildHash, tx)) === catalog.entries.length) return;
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "SearchCatalogEntry" (
            "id", "buildHash", "locale", "targetId", "text", "contentHash"
            ${withEmbedding ? Prisma.sql`, "model", "embedding"` : Prisma.empty}
          )
          SELECT gen_random_uuid()::text, ${catalog.buildHash}, v."locale", v."targetId", v."text", v."contentHash"
            ${withEmbedding ? Prisma.sql`, known."model", known."embedding"` : Prisma.empty}
          FROM unnest(
            ${catalog.entries.map((entry) => entry.locale)}::text[],
            ${catalog.entries.map((entry) => entry.targetId)}::text[],
            ${catalog.entries.map((entry) => entry.text)}::text[],
            ${catalog.entries.map((entry) => entry.contentHash)}::text[]
          ) AS v("locale", "targetId", "text", "contentHash")
          ${
            withEmbedding
              ? Prisma.sql`LEFT JOIN LATERAL (
                  SELECT e."model", e."embedding" FROM "SearchCatalogEntry" e
                  WHERE e."companyId" IS NULL AND e."contentHash" = v."contentHash" AND e."embedding" IS NOT NULL
                  ORDER BY e."createdAt" DESC LIMIT 1
                ) AS known ON true`
              : Prisma.empty
          }
          ON CONFLICT ("buildHash", "locale", "targetId") DO NOTHING
        `);
        await tx.$executeRaw(Prisma.sql`
          DELETE FROM "SearchCatalogEntry"
          WHERE "companyId" IS NULL AND "buildHash" <> ${catalog.buildHash}
            AND "createdAt" < CURRENT_TIMESTAMP - make_interval(days => ${STATIC_BUILD_RETENTION_DAYS})
        `);
      },
      { timeout: SYNC_TIMEOUT_MS, maxWait: SYNC_TIMEOUT_MS },
    );
  }

  async replaceWorkspaceCatalog(companyId: string, entries: readonly SearchCatalogText[]): Promise<void> {
    const withEmbedding = await this.semanticIndexAvailable();
    await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${WORKSPACE_SYNC_LOCK + companyId}))`);
        await tx.$executeRaw(Prisma.sql`
          DELETE FROM "SearchCatalogEntry" e
          WHERE ${scopeFilter({ companyId })}
            AND NOT (e."targetId" = ANY(${entries.map((entry) => entry.targetId)}::text[]))
        `);
        if (entries.length === 0) return;
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO "SearchCatalogEntry" (
            "id", "companyId", "targetId", "text", "contentHash"
            ${withEmbedding ? Prisma.sql`, "model", "embedding"` : Prisma.empty}
          )
          SELECT gen_random_uuid()::text, ${companyId}, v."targetId", v."text", v."contentHash"
            ${withEmbedding ? Prisma.sql`, known."model", known."embedding"` : Prisma.empty}
          FROM ${textColumns(entries)}
          ${
            withEmbedding
              ? Prisma.sql`LEFT JOIN LATERAL (
                  SELECT e."model", e."embedding" FROM "SearchCatalogEntry" e
                  WHERE e."companyId" = ${companyId} AND e."contentHash" = v."contentHash" AND e."embedding" IS NOT NULL
                  LIMIT 1
                ) AS known ON true`
              : Prisma.empty
          }
          ON CONFLICT ("companyId", "targetId") DO UPDATE SET
            "text" = EXCLUDED."text",
            "contentHash" = EXCLUDED."contentHash",
            "claimedAt" = NULL
            ${withEmbedding ? Prisma.sql`, "model" = EXCLUDED."model", "embedding" = EXCLUDED."embedding"` : Prisma.empty}
          WHERE "SearchCatalogEntry"."contentHash" IS DISTINCT FROM EXCLUDED."contentHash"
        `);
      },
      { timeout: SYNC_TIMEOUT_MS, maxWait: SYNC_TIMEOUT_MS },
    );
  }

  async claimPendingEmbeddings(scope: SearchCatalogScope, model: string, limit: number): Promise<SearchCatalogText[]> {
    if (!(await this.semanticIndexAvailable())) return [];
    const claimable = (alias: Prisma.Sql) => Prisma.sql`${scopeFilter(scope, alias)}
      AND (${alias}."embedding" IS NULL OR ${alias}."model" IS DISTINCT FROM ${model})
      AND (${alias}."claimedAt" IS NULL
        OR ${alias}."claimedAt" < CURRENT_TIMESTAMP - make_interval(secs => ${CLAIM_EXPIRY_SECONDS}))`;
    const rows = await prisma.$queryRaw<SearchCatalogText[]>(Prisma.sql`
      UPDATE "SearchCatalogEntry" e SET "claimedAt" = CURRENT_TIMESTAMP
      WHERE ${claimable(Prisma.sql`e`)} AND e."contentHash" IN (
        SELECT c."contentHash" FROM "SearchCatalogEntry" c
        WHERE ${claimable(Prisma.sql`c`)}
        ORDER BY c."contentHash" LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING e."targetId", e."text", e."contentHash"
    `);
    return [...new Map(rows.map((row) => [row.contentHash, row])).values()];
  }

  async releaseClaims(scope: SearchCatalogScope, contentHashes: readonly string[]): Promise<void> {
    if (contentHashes.length === 0) return;
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "SearchCatalogEntry" e SET "claimedAt" = NULL
      WHERE ${scopeFilter(scope)} AND e."contentHash" = ANY(${[...contentHashes]}::text[])
    `);
  }

  async storeEmbeddings(
    scope: SearchCatalogScope,
    model: string,
    rows: ReadonlyArray<{ contentHash: string; embedding: string }>,
  ): Promise<void> {
    if (rows.length === 0) return;
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "SearchCatalogEntry" AS e SET "embedding" = v."embedding"::vector, "model" = ${model}, "claimedAt" = NULL
      FROM unnest(
        ${rows.map((row) => row.contentHash)}::text[],
        ${rows.map((row) => row.embedding)}::text[]
      ) AS v("contentHash", "embedding")
      WHERE ${scopeFilter(scope)} AND e."contentHash" = v."contentHash"
    `);
  }

  async semanticMatches(args: {
    companyId: string;
    buildHash: string;
    locale: string;
    targetIds: readonly string[];
    vector: number[];
    model: string;
    minSimilarity: number;
    limit: number;
  }): Promise<SearchCatalogMatch[]> {
    if (!(await this.semanticIndexAvailable())) return [];
    const embedding = `[${args.vector.join(",")}]`;
    return prisma.$queryRaw<SearchCatalogMatch[]>(Prisma.sql`
      WITH distances AS MATERIALIZED (
        SELECT e."targetId", e."embedding" <=> ${embedding}::vector AS "distance"
        FROM "SearchCatalogEntry" e
        WHERE (${scopeFilter({ buildHash: args.buildHash })} AND e."locale" = ${args.locale}
            OR ${scopeFilter({ companyId: args.companyId })})
          AND e."targetId" = ANY(${[...args.targetIds]}::text[])
          AND e."model" = ${args.model} AND e."embedding" IS NOT NULL
      )
      SELECT d."targetId", (1 - d."distance")::float8 AS "similarity"
      FROM distances d
      WHERE d."distance" <= ${1 - args.minSimilarity}
      ORDER BY d."distance", d."targetId"
      LIMIT ${args.limit}
    `);
  }
}
