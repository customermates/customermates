import type { PostalCodeRow } from "./geonames-postal-codes";
import type { PostalCodeCountryState, PostalCodeDataStatus, PostalCodeSourceRecord } from "./postal-code.repo";

import { Prisma } from "@/generated/prisma";

import { getTransactionClient } from "@/core/decorators/transaction-context";
import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { prisma } from "@/prisma/db";
import { PostalCodeRepo } from "./postal-code.repo";

const INSERT_BATCH = 5_000;
const LOAD_TIMEOUT_MS = 300_000;

type CountryRow = {
  countryCode: string;
  status: PostalCodeDataStatus;
  version: string;
  rowCount: number;
  loadedAt: Date | null;
  attemptedAt: Date;
  attempts: number;
  failure: string | null;
};

function reader() {
  return getTransactionClient() ?? prisma;
}

function rowColumns(rows: readonly PostalCodeRow[]) {
  return Prisma.sql`unnest(
    ${rows.map((row) => row.postalKey)}::text[],
    ${rows.map((row) => row.ordinal)}::int[],
    ${rows.map((row) => row.postalCode)}::text[],
    ${rows.map((row) => row.city)}::text[],
    ${rows.map((row) => row.region)}::text[],
    ${rows.map((row) => row.latitude)}::double precision[],
    ${rows.map((row) => row.longitude)}::double precision[]
  ) AS r("postalKey", "ordinal", "postalCode", "city", "region", "latitude", "longitude")`;
}

export class PrismaPostalCodeRepo extends PostalCodeRepo {
  async country(countryCode: string): Promise<PostalCodeCountryState | null> {
    const rows = await runWithoutTenant(() =>
      reader().$queryRaw<CountryRow[]>(Prisma.sql`
        SELECT "countryCode", "status", "version", "rowCount", "loadedAt", "attemptedAt", "attempts", "failure"
        FROM "PostalCodeCountry"
        WHERE "countryCode" = ${countryCode}
      `),
    );
    return rows[0] ?? null;
  }

  async claim(
    countryCode: string,
    version: string,
    previous: PostalCodeCountryState | null,
    now: Date,
  ): Promise<boolean> {
    return runWithoutTenant(async () => {
      if (!previous) {
        const inserted = await prisma.$executeRaw(Prisma.sql`
          INSERT INTO "PostalCodeCountry" ("countryCode", "status", "version", "attemptedAt", "attempts")
          VALUES (${countryCode}, 'loading', ${version}, ${now}, 1)
          ON CONFLICT ("countryCode") DO NOTHING
        `);
        return inserted === 1;
      }
      const updated = await prisma.$executeRaw(Prisma.sql`
        UPDATE "PostalCodeCountry"
        SET "attemptedAt" = ${now},
            "attempts" = "attempts" + 1,
            "status" = CASE WHEN "status" = 'ready' THEN 'ready' ELSE 'loading' END
        WHERE "countryCode" = ${countryCode} AND "attemptedAt" = ${previous.attemptedAt}
      `);
      return updated === 1;
    });
  }

  async replace(
    countryCode: string,
    version: string,
    rows: readonly PostalCodeRow[],
    sources: readonly PostalCodeSourceRecord[],
    now: Date,
  ): Promise<void> {
    await runWithoutTenant(() =>
      prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${`PostalCode:${countryCode}`}))`);
          await tx.$executeRaw(Prisma.sql`DELETE FROM "PostalCode" WHERE "countryCode" = ${countryCode}`);
          for (let start = 0; start < rows.length; start += INSERT_BATCH) {
            await tx.$executeRaw(Prisma.sql`
              INSERT INTO "PostalCode" (
                "countryCode", "postalKey", "ordinal", "postalCode", "city", "region", "latitude", "longitude"
              )
              SELECT ${countryCode}, r."postalKey", r."ordinal", r."postalCode", r."city", r."region",
                r."latitude", r."longitude"
              FROM ${rowColumns(rows.slice(start, start + INSERT_BATCH))}
            `);
          }
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO "PostalCodeCountry" (
              "countryCode", "status", "version", "rowCount", "sources", "loadedAt", "attemptedAt", "attempts", "failure"
            )
            VALUES (
              ${countryCode}, 'ready', ${version}, ${rows.length}, ${JSON.stringify(sources)}::jsonb, ${now}, ${now}, 0,
              NULL
            )
            ON CONFLICT ("countryCode") DO UPDATE SET
              "status" = 'ready', "version" = EXCLUDED."version", "rowCount" = EXCLUDED."rowCount",
              "sources" = EXCLUDED."sources", "loadedAt" = EXCLUDED."loadedAt", "attempts" = 0, "failure" = NULL
          `);
        },
        { timeout: LOAD_TIMEOUT_MS, maxWait: LOAD_TIMEOUT_MS },
      ),
    );
  }

  async fail(countryCode: string, status: "failed" | "unavailable", failure: string, now: Date): Promise<void> {
    await runWithoutTenant(() =>
      prisma.$executeRaw(Prisma.sql`
        INSERT INTO "PostalCodeCountry" ("countryCode", "status", "version", "attemptedAt", "attempts", "failure")
        VALUES (${countryCode}, ${status}, '', ${now}, 1, ${failure.slice(0, 500)})
        ON CONFLICT ("countryCode") DO UPDATE SET
          "status" = CASE WHEN "PostalCodeCountry"."status" = 'ready' THEN 'ready' ELSE EXCLUDED."status" END,
          "failure" = EXCLUDED."failure"
      `),
    );
  }

  async places(countryCode: string, keys: readonly string[]): Promise<PostalCodeRow[]> {
    if (!keys.length) return [];
    return runWithoutTenant(() =>
      reader().$queryRaw<PostalCodeRow[]>(Prisma.sql`
        SELECT "postalKey", "postalCode", "ordinal", "city", "region", "latitude", "longitude"
        FROM "PostalCode"
        WHERE "countryCode" = ${countryCode} AND "postalKey" = ANY(${[...keys]}::text[])
        ORDER BY "postalKey", "ordinal"
      `),
    );
  }
}
