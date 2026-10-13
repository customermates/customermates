import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { createTranslator } from "next-intl";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Action, Resource, Status } from "@/generated/prisma";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { interactorFailureCodes, interactorFailureKind } from "@/core/validation/validation.utils";
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

const { getAdminUpdateUserDetailsInteractor } = await import("@/core/di");
const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const company = randomUUID();
const foreignCompany = randomUUID();
const admin = randomUUID();
const boss = randomUUID();
const teammate = randomUUID();
const foreigner = randomUUID();
const systemRole = randomUUID();
const memberRole = randomUUID();
const salesRole = randomUUID();
const foreignRole = randomUUID();

const actingAdmin: TenantUser = createMockUser({
  id: admin,
  companyId: company,
  roleId: systemRole,
  role: {
    id: systemRole,
    name: "System",
    description: null,
    isSystemRole: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    permissions: [
      { id: "users-0", resource: Resource.users, action: Action.update },
      { id: "users-1", resource: Resource.users, action: Action.readAll },
    ],
  },
});

const update = (data: Record<string, unknown>) =>
  runWithTenant(actingAdmin, () => getAdminUpdateUserDetailsInteractor().invoke(data));

const failure = (result: Awaited<ReturnType<typeof update>>) => {
  if (result.ok) throw new Error("expected a failure");
  return {
    kind: interactorFailureKind(result.error),
    codes: interactorFailureCodes(result.error),
    path: result.error.issues[0].path,
  };
};

describeDatabase("member update on PostgreSQL", { timeout: 120_000 }, () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });

  beforeAll(async () => {
    await client.connect();
    await runWithoutTenant(async () => {
      await prisma.company.createMany({ data: [{ id: company }, { id: foreignCompany }] });
      await prisma.userRole.createMany({
        data: [
          { id: systemRole, companyId: company, name: "System", isSystemRole: true },
          { id: memberRole, companyId: company, name: "Member", isSystemRole: false },
          { id: salesRole, companyId: company, name: "Sales", isSystemRole: false },
          { id: foreignRole, companyId: foreignCompany, name: "Foreign", isSystemRole: false },
        ],
      });
      const user = (id: string, companyId: string, roleId: string, firstName: string, status: Status) => ({
        id,
        companyId,
        roleId,
        email: `${firstName.toLowerCase()}-${id}@example.com`,
        firstName,
        lastName: "Member",
        status,
      });
      await prisma.user.createMany({
        data: [
          user(admin, company, memberRole, "Ada", Status.active),
          user(boss, company, systemRole, "Bea", Status.active),
          user(teammate, company, memberRole, "Tom", Status.active),
          user(foreigner, foreignCompany, foreignRole, "Fay", Status.active),
        ],
      });
      await prisma.subscription.create({ data: { companyId: company, plan: "enterprise", status: "active" } });
    });
  });

  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: [company, foreignCompany] } } }));
    await client.end();
  });

  it("reads the member under the company lock so a concurrent profile change is not overwritten", async () => {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [company]);
    const pending = update({ userId: teammate, roleId: salesRole });
    for (;;) {
      const waiting = await client.query(
        `SELECT count(*)::int AS count FROM pg_locks
         WHERE locktype = 'advisory' AND NOT granted
           AND ((classid::bigint << 32) | objid::bigint) = hashtextextended($1, 0)`,
        [company],
      );
      if (waiting.rows[0].count > 0) break;
    }
    await client.query(`UPDATE "User" SET "firstName" = 'Thomas' WHERE "id" = $1`, [teammate]);
    await client.query("COMMIT");

    const result = await pending;

    expect(result).toMatchObject({ ok: true, data: { firstName: "Thomas", roleId: salesRole } });
    const stored = await runWithoutTenant(() => prisma.user.findUniqueOrThrow({ where: { id: teammate } }));
    expect(stored).toMatchObject({ firstName: "Thomas", lastName: "Member", roleId: salesRole, status: "active" });
  });

  it("answers roleNotFound for a role outside the workspace instead of a database error", async () => {
    for (const roleId of [randomUUID(), foreignRole]) {
      expect(failure(await update({ userId: teammate, roleId }))).toEqual({
        kind: "not_found",
        codes: [CustomErrorCode.roleNotFound],
        path: ["roleId"],
      });
    }
  });

  it("answers userNotFound for an unknown or foreign member by id or email", async () => {
    expect(failure(await update({ userId: foreigner, status: Status.inactive }))).toMatchObject({
      kind: "not_found",
      codes: [CustomErrorCode.userNotFound],
    });
    expect(failure(await update({ email: "nobody@example.com", status: Status.inactive }))).toMatchObject({
      kind: "not_found",
      codes: [CustomErrorCode.userNotFound],
    });
  });

  it("keeps the last active system member and says so with roleSystemRequired", async () => {
    expect(failure(await update({ userId: boss, roleId: memberRole }))).toEqual({
      kind: "validation",
      codes: [CustomErrorCode.roleSystemRequired],
      path: ["roleId"],
    });
    const stored = await runWithoutTenant(() => prisma.user.findUniqueOrThrow({ where: { id: boss } }));
    expect(stored.roleId).toBe(systemRole);
  });
});
