import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { prisma } from "@/prisma/db";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("prisma tenant guard on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const foreignCompanyId = randomUUID();
  const contactId = randomUUID();

  const tenant: TenantUser = createMockUser({ companyId });
  const asTenant = <T>(fn: () => Promise<T>) => runWithTenant(tenant, fn);

  beforeAll(async () => {
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP), ($2, CURRENT_TIMESTAMP)',
      [companyId, foreignCompanyId],
    );
    await client.query(
      'INSERT INTO "User" ("id", "firstName", "lastName", "companyId", email, "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [contactId, "Guard", "Subject", companyId, `guard-${contactId}@example.invalid`],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "User" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.end();
  });

  it("rejects an update whose where is not tenant scoped", async () => {
    await expect(
      asTenant(() => prisma.user.updateMany({ where: { id: contactId }, data: { firstName: "Nope" } })),
    ).rejects.toThrow(/companyId must be set in where/);
  });

  it("rejects an update that would move a row to another tenant", async () => {
    await expect(
      asTenant(() =>
        prisma.user.updateMany({ where: { id: contactId, companyId }, data: { companyId: foreignCompanyId } }),
      ),
    ).rejects.toThrow(/does not match tenant/);
  });

  it("rejects an update whose where names another tenant", async () => {
    await expect(
      asTenant(() => prisma.user.updateMany({ where: { companyId: foreignCompanyId }, data: { firstName: "Nope" } })),
    ).rejects.toThrow(/does not match tenant in where/);
  });

  it("rejects a create without a companyId", async () => {
    await expect(
      asTenant(() =>
        prisma.user.create({
          data: { firstName: "No", lastName: "Tenant", email: "missing@example.invalid" } as never,
        }),
      ),
    ).rejects.toThrow(/companyId must be set in data/);
  });

  it("accepts an update scoped by the tenant column", async () => {
    await asTenant(() =>
      prisma.user.updateMany({ where: { id: contactId, companyId }, data: { firstName: "Allowed" } }),
    );

    const row = await client.query('SELECT "firstName" FROM "User" WHERE "id" = $1', [contactId]);
    expect(row.rows[0].firstName).toBe("Allowed");
  });

  it("accepts an upsert whose unique selector is the tenant key", async () => {
    await asTenant(() =>
      prisma.recordSchemaState.upsert({
        where: { companyId },
        create: { companyId, revision: 1 },
        update: { companyId, revision: 2 },
      }),
    );
    const row = await client.query('SELECT revision FROM "RecordSchemaState" WHERE "companyId" = $1', [companyId]);
    expect(row.rows[0].revision).toBe(1);
    await asTenant(() =>
      prisma.recordSchemaState.upsert({
        where: { companyId },
        create: { companyId, revision: 1 },
        update: { companyId, revision: 2 },
      }),
    );
    expect(
      (await client.query('SELECT revision FROM "RecordSchemaState" WHERE "companyId" = $1', [companyId])).rows[0]
        .revision,
    ).toBe(2);
  });
});
