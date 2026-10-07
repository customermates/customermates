import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import messages from "@/i18n/locales/en.json";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: (namespace?: string) =>
    Promise.resolve(createTranslator({ locale: "en", messages, namespace: namespace as never })),
}));
vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    DATABASE_URL: process.env.DATABASE_URL,
    BASE_URL: "http://localhost:4000",
    NODE_ENV: "test",
  },
}));

const { runWithTenant } = await import("@/core/decorators/tenant-context");
const { PrismaP13nRepo } = await import("../prisma-p13n.repository");
const { UpsertP13nInteractor } = await import("../upsert-p13n.interactor");
const { GetP13nInteractor } = await import("../get-p13n.interactor");

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("personal Configure graph layout in P13n settings", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const firstUserId = randomUUID();
  const secondUserId = randomUUID();
  const tenant = (id: string): TenantUser => createMockUser({ id, companyId });
  const repo = new PrismaP13nRepo();
  const upsert = (userId: string, data: unknown) =>
    runWithTenant(tenant(userId), () => new UpsertP13nInteractor(repo).invoke(data as never));
  const read = (userId: string) =>
    runWithTenant(
      tenant(userId),
      async () => (await new GetP13nInteractor(repo).invoke({ p13nId: "configure-graph" })).data,
    );
  const layout = { positions: { [randomUUID()]: { x: 120, y: -40 }, accounts: { x: 640, y: 80 } } };

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $7, CURRENT_TIMESTAMP), ($5, $6, $3, $4, $7, CURRENT_TIMESTAMP)',
      [
        firstUserId,
        `first-${firstUserId}@example.invalid`,
        "Graph",
        "Tester",
        secondUserId,
        `second-${secondUserId}@example.invalid`,
        companyId,
      ],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "P13n" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("stores node positions per person and leaves other people on the automatic layout", async () => {
    expect(await read(firstUserId)).toBeUndefined();
    expect((await upsert(firstUserId, { p13nId: "configure-graph", settings: layout })).ok).toBe(true);
    expect((await read(firstUserId))?.settings).toEqual(layout);
    expect((await read(secondUserId))?.settings).toBeUndefined();
  });

  it("resets to the automatic layout by clearing the settings", async () => {
    expect((await upsert(firstUserId, { p13nId: "configure-graph", settings: null })).ok).toBe(true);
    expect((await read(firstUserId))?.settings).toBeUndefined();
  });

  it("refuses positions that are malformed or stored for another surface", async () => {
    const tooMany = Object.fromEntries(Array.from({ length: 501 }, (_, index) => [`list-${index}`, { x: 0, y: 0 }]));
    const invalid = [
      { p13nId: "configure-graph", settings: { positions: { list: { x: Number.NaN, y: 0 } } } },
      { p13nId: "configure-graph", settings: { positions: { list: { x: 0, y: 2_000_000 } } } },
      { p13nId: "configure-graph", settings: { positions: { list: { x: 0, y: 0, z: 1 } } } },
      { p13nId: "configure-graph", settings: { positions: tooMany } },
      { p13nId: "configure-graph", settings: { sections: [], hidden: [] } },
      { p13nId: "sidebar", settings: layout },
      { p13nId: "contact-detail", settings: layout },
    ];
    for (const data of invalid) await expect(upsert(secondUserId, data)).rejects.toThrow();
    expect(await read(secondUserId)).toBeUndefined();
  });
});
