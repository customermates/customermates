import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { prisma } from "@/prisma/db";

import { PrismaDataViewRepo } from "../prisma-data-view.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const SURFACE = "deals-card-store";

describeDatabase("data view tenant guard on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const foreignCompanyId = randomUUID();
  const userId = randomUUID();

  const tenant: TenantUser = createMockUser({ id: userId, companyId });
  const asTenant = <T>(fn: () => Promise<T>) => runWithTenant(tenant, fn);

  let viewId = "";

  beforeAll(async () => {
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)',
      [companyId, foreignCompanyId],
    );
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [userId, `guard-${userId}@example.invalid`, "Guard", "Tester", companyId],
    );

    const created = await asTenant(() =>
      new PrismaDataViewRepo().createView({
        surfaceKey: SURFACE,
        name: "Guarded",
        position: 0,
        state: { pageSize: 25 },
      }),
    );
    viewId = created.id;
  });

  afterAll(async () => {
    await client.query('DELETE FROM "DataView" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "P13n" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "User" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.end();
  });

  it("rejects a create whose data carries a foreign companyId", async () => {
    await expect(
      asTenant(() =>
        prisma.dataView.create({
          data: { companyId: foreignCompanyId, userId, surfaceKey: SURFACE, name: "Foreign" },
        }),
      ),
    ).rejects.toThrow("companyId does not match tenant in data");
  });

  it("rejects an update whose where carries a foreign companyId", async () => {
    await expect(
      asTenant(() =>
        prisma.dataView.updateMany({ where: { id: viewId, companyId: foreignCompanyId }, data: { name: "Foreign" } }),
      ),
    ).rejects.toThrow("companyId does not match tenant in where");
  });

  it("rejects a delete that carries no companyId in its where at all", async () => {
    await expect(asTenant(() => prisma.dataView.deleteMany({ where: { id: viewId } } as never))).rejects.toThrow(
      "companyId must be set in where",
    );
  });

  it("rejects a state autosave whose where names a foreign company", async () => {
    await expect(
      asTenant(() =>
        prisma.dataView.updateMany({
          where: { id: viewId, companyId: foreignCompanyId, userId, surfaceKey: SURFACE },
          data: { pageSize: 10 },
        }),
      ),
    ).rejects.toThrow("companyId does not match tenant in where");
  });

  it("accepts the shapes the repository itself writes", async () => {
    expect(
      await asTenant(() =>
        new PrismaDataViewRepo().updateOwnedState({ id: viewId, surfaceKey: SURFACE, state: { pageSize: 10 } }),
      ),
    ).toBe(true);
    expect(await asTenant(() => new PrismaDataViewRepo().updateOwned({ id: viewId, name: "Renamed" }))).toMatchObject({
      name: "Renamed",
      state: { pageSize: 10 },
    });
    expect(await asTenant(() => new PrismaDataViewRepo().deleteOwned(viewId))).toBe(true);
  });
});
