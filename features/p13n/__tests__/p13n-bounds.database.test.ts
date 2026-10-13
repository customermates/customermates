import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { createTranslator } from "next-intl";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

import { FilterOperatorKey } from "@/core/base/base-query-builder";

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

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("bounded P13n writes", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const userId = randomUUID();
  const tenant = (): TenantUser => createMockUser({ id: userId, companyId });
  const repo = new PrismaP13nRepo();
  const upsert = (data: unknown) => runWithTenant(tenant(), () => new UpsertP13nInteractor(repo).invoke(data as never));
  const stored = () =>
    client
      .query<{ p13nId: string }>('SELECT "p13nId" FROM "P13n" WHERE "companyId" = $1 ORDER BY "p13nId"', [companyId])
      .then((result) => result.rows.map((row) => row.p13nId));
  const panels = `record-panels:${randomUUID()}`;
  const sublist = `sublist-columns:${randomUUID()}`;

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [userId, `bounds-${userId}@example.invalid`, "Bounds", "Tester", companyId],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "P13n" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("stores the known personalization ids within their bounds", async () => {
    expect((await upsert({ p13nId: panels, columnWidths: { main: 62.5, side: 37.5 } })).ok).toBe(true);
    expect((await upsert({ p13nId: "wiki-layout", columnWidths: { tree: 280 } })).ok).toBe(true);
    expect((await upsert({ p13nId: sublist, columnOrder: Array.from({ length: 500 }, (_, i) => `c${i}`) })).ok).toBe(
      true,
    );
    expect(await stored()).toEqual([panels, sublist, "wiki-layout"].sort());
  });

  it("caps saved filters at fifty otherwise valid filters", async () => {
    const filter = { field: "name", operator: FilterOperatorKey.contains, value: "acme" };
    expect((await upsert({ p13nId: panels, filters: Array.from({ length: 50 }, () => filter) })).ok).toBe(true);
    const refused = await upsert({ p13nId: panels, filters: Array.from({ length: 51 }, () => filter) }).catch(
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(ZodError);
    expect((refused as ZodError).issues).toEqual([expect.objectContaining({ code: "too_big", path: ["filters"] })]);
  });

  it("refuses unknown ids, oversized ids and unbounded layout state", async () => {
    const widths = Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`c${i}`, 100]));
    const invalid = [
      { p13nId: "contacts", columnOrder: ["name"] },
      { p13nId: "records:anything", columnOrder: ["name"] },
      { p13nId: "record-panels:not-a-uuid", columnWidths: { main: 50 } },
      { p13nId: `record-panels:${"a".repeat(200)}`, columnWidths: { main: 50 } },
      { p13nId: panels, columnOrder: Array.from({ length: 501 }, (_, i) => `c${i}`) },
      { p13nId: panels, columnOrder: ["x".repeat(201)] },
      { p13nId: panels, columnWidths: widths },
      { p13nId: panels, columnWidths: { main: 20_000 } },
      { p13nId: panels, columnWidths: { main: Number.POSITIVE_INFINITY } },
    ];
    const before = await stored();
    for (const data of invalid) await expect(upsert(data)).resolves.toMatchObject({ ok: false });
    expect(await stored()).toEqual(before);
  });
});
