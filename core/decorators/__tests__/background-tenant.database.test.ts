import { randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Action, Resource } from "@/generated/prisma";

import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { getTenantUser } from "@/core/decorators/tenant-context";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { PrismaUserRepo } from "@/features/user/prisma-user.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

class ReadUsersProbe {
  invoke() {
    const { id, companyId } = getTenantUser();

    return Promise.resolve({ id, companyId });
  }
}

const GuardedProbe = TenantInteractor<typeof ReadUsersProbe>({
  resource: Resource.users,
  action: Action.readAll,
})(ReadUsersProbe);

describeDatabase("background tenant context on PostgreSQL", () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });

  const companyId = randomUUID();
  const otherCompanyId = randomUUID();
  const capableRoleId = randomUUID();
  const powerlessRoleId = randomUUID();
  const activeUserId = randomUUID();
  const powerlessUserId = randomUUID();
  const inactiveUserId = randomUUID();
  const outsiderId = randomUUID();

  const insertUser = (id: string, roleId: string | null, company: string, status: string) =>
    client.query(
      'INSERT INTO "User" ("id","email","firstName","lastName","companyId","roleId","status","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7::"Status",CURRENT_TIMESTAMP)',
      [id, `user-${id}@example.com`, "Back", "Ground", company, roleId, status],
    );

  beforeAll(async () => {
    await client.connect();
    await client.query(
      'INSERT INTO "Company" ("id","updatedAt") VALUES ($1,CURRENT_TIMESTAMP),($2,CURRENT_TIMESTAMP)',
      [companyId, otherCompanyId],
    );
    await client.query(
      'INSERT INTO "UserRole" ("id","name","isSystemRole","companyId","updatedAt") VALUES ($1,$2,false,$4,CURRENT_TIMESTAMP),($3,$5,false,$4,CURRENT_TIMESTAMP)',
      [capableRoleId, `capable-${capableRoleId}`, powerlessRoleId, companyId, `powerless-${powerlessRoleId}`],
    );
    await client.query(
      'INSERT INTO "RolePermission" ("id","roleId","companyId","resource","action") VALUES ($1,$2,$3,$4::"Resource",$5::"Action")',
      [randomUUID(), capableRoleId, companyId, Resource.users, Action.readAll],
    );
    await insertUser(activeUserId, capableRoleId, companyId, "active");
    await insertUser(powerlessUserId, powerlessRoleId, companyId, "active");
    await insertUser(inactiveUserId, capableRoleId, companyId, "inactive");
    await insertUser(outsiderId, null, otherCompanyId, "active");
  });

  afterAll(async () => {
    await client.query('DELETE FROM "User" WHERE "companyId" = ANY($1)', [[companyId, otherCompanyId]]);
    await client.query('DELETE FROM "RolePermission" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "UserRole" WHERE "companyId" = $1', [companyId]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [[companyId, otherCompanyId]]);
    await client.end();
  });

  it("establishes tenant identity for a user loaded by id, with no request session", async () => {
    const identity = await runAsBackgroundTenant(activeUserId, () => getTenantUser());

    expect(identity.id).toBe(activeUserId);
    expect(identity.companyId).toBe(companyId);
  });

  it("scopes a tenant repository to the background tenant's company", async () => {
    const own = await runAsBackgroundTenant(activeUserId, () => new PrismaUserRepo().getUserById(activeUserId));
    const foreign = await runAsBackgroundTenant(activeUserId, () => new PrismaUserRepo().getUserById(outsiderId));

    expect(own?.id).toBe(activeUserId);
    expect(foreign).toBeNull();
  });

  it("runs a tenant interactor from a background step", async () => {
    const result = await runAsBackgroundTenant(activeUserId, () => new GuardedProbe().invoke());

    expect(result).toEqual({ id: activeUserId, companyId });
  });

  it("still enforces the interactor's permission requirement", async () => {
    await expect(runAsBackgroundTenant(powerlessUserId, () => new GuardedProbe().invoke())).rejects.toThrow(
      /Access denied/,
    );
  });

  it("refuses to assume an inactive user", async () => {
    await expect(runAsBackgroundTenant(inactiveUserId, () => getTenantUser())).rejects.toThrow(/not active/);
  });

  it("refuses to assume a user that does not exist", async () => {
    await expect(runAsBackgroundTenant(randomUUID(), () => getTenantUser())).rejects.toThrow(
      /No .*User.* found|not found|P2025/i,
    );
  });

  it("leaves no ambient identity outside a background tenant", async () => {
    expect(() => getTenantUser()).toThrow(/Tenant context missing/);

    const identity = await new GuardedProbe()
      .invoke()
      .then((value) => ({ assumed: true as const, value }))
      .catch(() => ({ assumed: false as const, value: null }));

    expect(identity.assumed).toBe(false);
    expect(() => getTenantUser()).toThrow(/Tenant context missing/);
  });
});
