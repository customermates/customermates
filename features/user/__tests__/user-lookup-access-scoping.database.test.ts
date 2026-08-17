import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Action, Resource } from "@/generated/prisma";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { PrismaUserRepo } from "../prisma-user.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("user lookup access scoping on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const viewerId = randomUUID();
  const colleagueId = randomUUID();

  const viewer = (action: Action): TenantUser => ({
    ...createMockUserWithPermissions([{ resource: Resource.users, action }]),
    id: viewerId,
    companyId,
  });

  beforeAll(async () => {
    await client.connect();
    await client.query('INSERT INTO "Company" ("id", "updatedAt") VALUES ($1, CURRENT_TIMESTAMP)', [companyId]);
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $7, CURRENT_TIMESTAMP), ($5, $6, $3, $4, $7, CURRENT_TIMESTAMP)',
      [
        viewerId,
        `viewer-${viewerId}@example.com`,
        "Read",
        "Own",
        colleagueId,
        `mate-${colleagueId}@example.com`,
        companyId,
      ],
    );
  });

  afterAll(async () => {
    await client.query('DELETE FROM "User" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = $1', [companyId]);
    await client.end();
  });

  it("returns null when a readOwn viewer asks for a colleague", async () => {
    const user = await runWithTenant(viewer(Action.readOwn), () => new PrismaUserRepo().getUserById(colleagueId));

    expect(user).toBeNull();
  });

  it("returns the viewer's own record to a readOwn viewer", async () => {
    const user = await runWithTenant(viewer(Action.readOwn), () => new PrismaUserRepo().getUserById(viewerId));

    expect(user?.id).toBe(viewerId);
  });

  it("returns the colleague to a readAll viewer", async () => {
    const user = await runWithTenant(viewer(Action.readAll), () => new PrismaUserRepo().getUserById(colleagueId));

    expect(user?.id).toBe(colleagueId);
  });

  it("resolves only the requested ids for a readOwn viewer", async () => {
    const found = await runWithTenant(viewer(Action.readOwn), () =>
      new PrismaUserRepo().findIds(new Set([colleagueId])),
    );

    expect(found).toEqual(new Set());
  });
});
