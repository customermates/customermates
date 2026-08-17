import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";
import { prisma } from "@/prisma/db";

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
      'INSERT INTO "Contact" ("id", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [contactId, "Guard", "Subject", companyId],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "EntityTerminology" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "Contact" WHERE "companyId" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [[companyId, foreignCompanyId]]);
    await client.end();
  });

  it("rejects an update whose where is not tenant scoped", async () => {
    await expect(
      asTenant(() => prisma.contact.updateMany({ where: { id: contactId }, data: { firstName: "Nope" } })),
    ).rejects.toThrow(/companyId must be set in where/);
  });

  it("rejects an update that would move a row to another tenant", async () => {
    await expect(
      asTenant(() =>
        prisma.contact.updateMany({ where: { id: contactId, companyId }, data: { companyId: foreignCompanyId } }),
      ),
    ).rejects.toThrow(/does not match tenant/);
  });

  it("rejects an update whose where names another tenant", async () => {
    await expect(
      asTenant(() =>
        prisma.contact.updateMany({ where: { companyId: foreignCompanyId }, data: { firstName: "Nope" } }),
      ),
    ).rejects.toThrow(/does not match tenant in where/);
  });

  it("rejects a create without a companyId", async () => {
    await expect(
      asTenant(() => prisma.contact.create({ data: { firstName: "No", lastName: "Tenant" } as never })),
    ).rejects.toThrow(/companyId must be set in data/);
  });

  it("accepts an update scoped by the tenant column", async () => {
    await asTenant(() =>
      prisma.contact.updateMany({ where: { id: contactId, companyId }, data: { firstName: "Allowed" } }),
    );

    const row = await client.query('SELECT "firstName" FROM "Contact" WHERE "id" = $1', [contactId]);
    expect(row.rows[0].firstName).toBe("Allowed");
  });

  it("accepts an upsert whose unique selector carries the tenant inside a compound key", async () => {
    await asTenant(() =>
      prisma.entityTerminology.upsert({
        where: { companyId_entityType: { companyId, entityType: "contact" } },
        create: { companyId, entityType: "contact", presetKey: "guarded" },
        update: { companyId, presetKey: "guarded" },
      } as never),
    );

    const row = await client.query('SELECT "presetKey" FROM "EntityTerminology" WHERE "companyId" = $1', [companyId]);
    expect(row.rows[0].presetKey).toBe("guarded");
  });
});
