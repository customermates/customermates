import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { prisma } from "@/prisma/db";

import { PrismaDataViewRepo } from "../prisma-data-view.repository";
import { PrismaDataViewOverrideRepo } from "../prisma-data-view-override.repository";

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
        visibility: "private",
        position: 0,
        state: { pageSize: 25 },
      }),
    );
    viewId = created.id;
  });

  afterAll(async () => {
    await client.query('DELETE FROM "DataViewOverride" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "DataView" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
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

  it("rejects an override upsert that omits companyId from the update payload", async () => {
    await expect(
      asTenant(() =>
        prisma.dataViewOverride.upsert({
          where: {
            companyId_userId_surfaceKey_viewKey: { companyId, userId, surfaceKey: SURFACE, viewKey: "__all__" },
            companyId,
          },
          create: { companyId, userId, surfaceKey: SURFACE, viewKey: "__all__", viewId: null },
          update: { userId, surfaceKey: SURFACE, viewKey: "__all__", viewId: null } as never,
        }),
      ),
    ).rejects.toThrow("companyId must be set in update");
  });

  it("rejects an override upsert whose compound key names a foreign company", async () => {
    await expect(
      asTenant(() =>
        prisma.dataViewOverride.upsert({
          where: {
            companyId_userId_surfaceKey_viewKey: {
              companyId: foreignCompanyId,
              userId,
              surfaceKey: SURFACE,
              viewKey: "__all__",
            },
            companyId: foreignCompanyId,
          },
          create: { companyId: foreignCompanyId, userId, surfaceKey: SURFACE, viewKey: "__all__", viewId: null },
          update: { companyId: foreignCompanyId, userId, surfaceKey: SURFACE, viewKey: "__all__", viewId: null },
        }),
      ),
    ).rejects.toThrow("companyId does not match tenant");
  });

  it("accepts the shapes the repository itself writes", async () => {
    await expect(
      asTenant(() =>
        new PrismaDataViewOverrideRepo().upsertOverride({
          surfaceKey: SURFACE,
          viewKey: "__all__",
          delta: { pageSize: 10 },
        }),
      ),
    ).resolves.toBeUndefined();

    expect(await asTenant(() => new PrismaDataViewRepo().updateOwned({ id: viewId, name: "Renamed" }))).toMatchObject({
      name: "Renamed",
    });
    expect(await asTenant(() => new PrismaDataViewRepo().deleteOwned(viewId))).toBe(true);
  });
});
