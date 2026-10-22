import { afterAll, describe, expect, it, vi } from "vitest";

import type { PostalCodeRow } from "../geonames-postal-codes";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: { APP_MODE: "self-hosted", DATABASE_URL: process.env.DATABASE_URL, NODE_ENV: "test" },
}));

const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { PrismaPostalCodeRepo } = await import("../prisma-postal-code.repository");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const COUNTRY = "li";
const NOW = new Date("2026-10-16T10:00:00.000Z");

function row(postalKey: string, ordinal: number, city: string, latitude = 47.14, longitude = 9.52): PostalCodeRow {
  return { postalKey, postalCode: postalKey, ordinal, city, region: null, latitude, longitude };
}

async function cleanUp() {
  await runWithoutTenant(async () => {
    await prisma.$executeRaw`DELETE FROM "PostalCode" WHERE "countryCode" = ${COUNTRY}`;
    await prisma.$executeRaw`DELETE FROM "PostalCodeCountry" WHERE "countryCode" = ${COUNTRY}`;
  });
}

describeDatabase("postal code repository", () => {
  afterAll(cleanUp);

  it("claims a country once, replaces its rows atomically and reads them back by key", async () => {
    await cleanUp();
    const repo = new PrismaPostalCodeRepo();
    expect(await repo.country(COUNTRY)).toBeNull();
    expect(await repo.claim(COUNTRY, "1:test", null, NOW)).toBe(true);
    expect(await repo.claim(COUNTRY, "1:test", null, NOW)).toBe(false);
    const claimed = await repo.country(COUNTRY);
    expect(claimed).toMatchObject({ status: "loading", attempts: 1, attemptedAt: NOW });
    const later = new Date(NOW.getTime() + 60_000);
    expect(await repo.claim(COUNTRY, "1:test", claimed, later)).toBe(true);
    expect(await repo.claim(COUNTRY, "1:test", claimed, later)).toBe(false);

    await repo.replace(
      COUNTRY,
      "1:test",
      [row("9490", 0, "Vaduz"), row("9494", 0, "Schaan"), row("9494", 1, "Nendeln", 47.2, 9.54)],
      later,
    );
    expect(await repo.country(COUNTRY)).toMatchObject({ status: "ready", version: "1:test", rowCount: 3, attempts: 0 });
    expect(await repo.places(COUNTRY, ["9494", "949"])).toEqual([
      row("9494", 0, "Schaan"),
      row("9494", 1, "Nendeln", 47.2, 9.54),
    ]);
    expect(await repo.places(COUNTRY, [])).toEqual([]);

    await repo.replace(COUNTRY, "2:test", [row("9490", 0, "Vaduz")], later);
    expect(await repo.places(COUNTRY, ["9494"])).toEqual([]);
    expect(await repo.country(COUNTRY)).toMatchObject({ rowCount: 1, version: "2:test" });
  });

  it("keeps serving loaded data when a refresh fails and records the reason", async () => {
    await cleanUp();
    const repo = new PrismaPostalCodeRepo();
    await repo.replace(COUNTRY, "1:test", [row("9490", 0, "Vaduz")], NOW);
    await repo.fail(COUNTRY, "failed", "timeout", NOW);
    expect(await repo.country(COUNTRY)).toMatchObject({ status: "ready", failure: "timeout", rowCount: 1 });
    await cleanUp();
    await repo.claim(COUNTRY, "1:test", null, NOW);
    await repo.fail(COUNTRY, "unavailable", "status 404", NOW);
    expect(await repo.country(COUNTRY)).toMatchObject({ status: "unavailable", failure: "status 404" });
  });
});
