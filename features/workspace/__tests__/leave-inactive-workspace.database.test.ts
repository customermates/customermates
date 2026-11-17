import { randomUUID } from "node:crypto";

import { serializeSignedCookie } from "better-call";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const requestContext = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(requestContext.headers),
  cookies: () =>
    Promise.resolve({
      get: () => undefined,
      getAll: () => [],
      set: () => undefined,
      delete: () => undefined,
    }),
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => {
    const translate = (key: string) => key;
    return Promise.resolve(Object.assign(translate, { raw: translate }));
  },
}));

import { CustomErrorCode } from "@/core/validation/validation.types";
import { interactorFailureCodes } from "@/core/validation/validation.utils";
import { PrismaBillingUsageRepo } from "@/features/billing-usage/prisma-billing-usage.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

type Workspace = "own" | "deactivated" | "paused" | "pending";

type Fixture = {
  email: string;
  authUserId: string;
  cookie: string;
  companies: Record<Workspace, string>;
};

describeDatabase("leaving a workspace in which the membership is inactive", { timeout: 120_000 }, () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  let fixture: Fixture;

  function asSession() {
    requestContext.headers = new Headers({ cookie: fixture.cookie });
  }

  async function membership(workspace: Workspace) {
    const result = await client.query<{
      status: string;
      leftAt: Date | null;
      pausedByPlanAt: Date | null;
      planPauseNoticeSentAt: Date | null;
    }>(
      'SELECT "status", "leftAt", "pausedByPlanAt", "planPauseNoticeSentAt" FROM "User" WHERE "companyId" = $1 AND "email" = $2',
      [fixture.companies[workspace], fixture.email],
    );
    return result.rows[0] ?? null;
  }

  async function lastUsedCompanyId() {
    const authUser = await client.query<{ companyId: string | null }>(
      'SELECT "companyId" FROM "AuthUser" WHERE "id" = $1',
      [fixture.authUserId],
    );
    return authUser.rows[0]?.companyId ?? null;
  }

  async function leave(companyId: string) {
    const { getLeaveInactiveWorkspaceInteractor } = await import("@/core/di");
    asSession();
    return getLeaveInactiveWorkspaceInteractor().invoke({ companyId });
  }

  async function failureCodes(companyId: string) {
    const result = await leave(companyId);
    return result.ok ? "left" : interactorFailureCodes(result.error);
  }

  beforeAll(async () => {
    await client.connect();
    const email = `inactive-leave-${randomUUID()}@example.invalid`;
    const authUserId = randomUUID();
    const companies: Record<Workspace, string> = {
      own: randomUUID(),
      deactivated: randomUUID(),
      paused: randomUUID(),
      pending: randomUUID(),
    };
    const pausedAt = new Date("2026-11-01T08:00:00.000Z");
    const memberships: Record<Workspace, { status: string; admin: boolean; pausedAt: Date | null }> = {
      own: { status: "active", admin: true, pausedAt: null },
      deactivated: { status: "inactive", admin: true, pausedAt: null },
      paused: { status: "inactive", admin: false, pausedAt },
      pending: { status: "pendingAuthorization", admin: false, pausedAt: null },
    };

    for (const workspace of Object.keys(companies) as Workspace[]) {
      const companyId = companies[workspace];
      const { status, admin, pausedAt: paused } = memberships[workspace];
      const adminRoleId = randomUUID();
      const memberRoleId = randomUUID();
      await client.query('INSERT INTO "Company" ("id", "name", "updatedAt") VALUES ($1, $2, CURRENT_TIMESTAMP)', [
        companyId,
        `Inactive leave ${workspace}`,
      ]);
      await client.query(
        'INSERT INTO "Subscription" ("id", "companyId", "status", "updatedAt") VALUES ($1, $2, \'active\', CURRENT_TIMESTAMP)',
        [randomUUID(), companyId],
      );
      for (const [roleId, name, isSystemRole] of [
        [adminRoleId, "Admin", true],
        [memberRoleId, "Member", false],
      ] as const) {
        await client.query(
          'INSERT INTO "UserRole" ("id", "name", "isSystemRole", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
          [roleId, name, isSystemRole, companyId],
        );
      }
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "roleId", "status", "pausedByPlanAt", "planPauseNoticeSentAt", "onboardingWizardCompletedAt", "updatedAt") VALUES ($1, $2, \'Ben\', \'Leaver\', $3, $4, $5::"Status", $6, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [
          randomUUID(),
          email,
          companyId,
          status === "pendingAuthorization" ? null : admin ? adminRoleId : memberRoleId,
          status,
          paused,
        ],
      );
      if (workspace !== "own" && workspace !== "deactivated") {
        await client.query(
          'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "roleId", "status", "onboardingWizardCompletedAt", "updatedAt") VALUES ($1, $2, \'Anna\', \'Admin\', $3, $4, \'active\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
          [randomUUID(), `inactive-leave-admin-${randomUUID()}@example.invalid`, companyId, adminRoleId],
        );
      }
    }

    await client.query(
      'INSERT INTO "AuthUser" ("id", "name", "email", "emailVerified", "companyId", "updatedAt") VALUES ($1, \'Ben Leaver\', $2, TRUE, $3, CURRENT_TIMESTAMP)',
      [authUserId, email, companies.deactivated],
    );
    const token = randomUUID().replaceAll("-", "");
    await client.query(
      'INSERT INTO "AuthSession" ("id", "token", "userId", "expiresAt", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [randomUUID(), token, authUserId, new Date(Date.now() + 60 * 60 * 1000)],
    );
    const { auth } = await import("@/core/auth/better-auth");
    const secret = (await auth.$context).secret;
    const cookie = (await serializeSignedCookie("app.session_token", token, secret)).split(";")[0];

    fixture = { email, authUserId, cookie, companies };
  });

  afterAll(async () => {
    if (fixture) {
      await client.query('DELETE FROM "AuthUser" WHERE "id" = $1', [fixture.authUserId]);
      await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [Object.values(fixture.companies)]);
    }
    await client.end();
  });

  it("refuses without a session and for memberships that are active or waiting for approval", async () => {
    const { getLeaveInactiveWorkspaceInteractor } = await import("@/core/di");
    requestContext.headers = new Headers();
    const anonymous = await getLeaveInactiveWorkspaceInteractor().invoke({ companyId: fixture.companies.deactivated });
    expect(anonymous.ok ? "left" : interactorFailureCodes(anonymous.error)).toEqual([CustomErrorCode.permissionDenied]);

    expect(await failureCodes(fixture.companies.own)).toEqual([CustomErrorCode.workspaceChanged]);
    expect(await failureCodes(fixture.companies.pending)).toEqual([CustomErrorCode.workspaceChanged]);
    expect(await failureCodes(randomUUID())).toEqual([CustomErrorCode.workspaceNotFound]);

    expect(await membership("own")).toMatchObject({ status: "active", leftAt: null });
    expect(await membership("pending")).toMatchObject({ status: "pendingAuthorization", leftAt: null });
    expect(await membership("deactivated")).toMatchObject({ status: "inactive", leftAt: null });
    expect(await lastUsedCompanyId()).toBe(fixture.companies.deactivated);
  });

  it("ends the membership an admin deactivated, also for the only admin on record, and moves the login on", async () => {
    expect(await leave(fixture.companies.deactivated)).toEqual({
      ok: true,
      data: { companyId: fixture.companies.deactivated },
    });

    expect(await membership("deactivated")).toMatchObject({ status: "inactive", leftAt: expect.any(Date) });
    expect(await lastUsedCompanyId()).toBe(fixture.companies.own);
    expect(await membership("own")).toMatchObject({ status: "active", leftAt: null });
    expect(await membership("paused")).toMatchObject({
      status: "inactive",
      leftAt: null,
      pausedByPlanAt: expect.any(Date),
    });
    expect(await membership("pending")).toMatchObject({ status: "pendingAuthorization", leftAt: null });

    const { getListMyWorkspacesInteractor } = await import("@/core/di");
    asSession();
    const { data } = await getListMyWorkspacesInteractor().invoke();
    expect(data.map((workspace) => workspace.companyId).sort()).toEqual(
      [fixture.companies.own, fixture.companies.paused, fixture.companies.pending].sort(),
    );
  });

  it("answers not found when the same workspace is left a second time", async () => {
    const before = await membership("deactivated");

    expect(await failureCodes(fixture.companies.deactivated)).toEqual([CustomErrorCode.workspaceNotFound]);

    expect(await membership("deactivated")).toEqual(before);
  });

  it("ends a membership the Free plan paused and clears the pause, so a later paid plan cannot bring it back", async () => {
    expect(await leave(fixture.companies.paused)).toEqual({ ok: true, data: { companyId: fixture.companies.paused } });

    expect(await membership("paused")).toEqual({
      status: "inactive",
      leftAt: expect.any(Date),
      pausedByPlanAt: null,
      planPauseNoticeSentAt: null,
    });
    expect(await lastUsedCompanyId()).toBe(fixture.companies.own);

    const { PermissionService } = await import("@/core/base/permission.service");
    const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
    const users = new PrismaUserRepo(new PermissionService(), new PrismaBillingUsageRepo());
    expect(await users.resumeMembersForPlanUnscoped({ companyId: fixture.companies.paused })).toBe(0);
    expect(await membership("paused")).toMatchObject({ status: "inactive", leftAt: expect.any(Date) });
  });

  it("does not let a paid plan approve the new join request of a person who left while paused", async () => {
    const { PermissionService } = await import("@/core/base/permission.service");
    const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
    const users = new PrismaUserRepo(new PermissionService(), new PrismaBillingUsageRepo());
    await client.query(
      'UPDATE "User" SET "status" = \'pendingAuthorization\', "leftAt" = NULL, "roleId" = NULL WHERE "companyId" = $1 AND "email" = $2',
      [fixture.companies.paused, fixture.email],
    );
    expect(await users.resumeMembersForPlanUnscoped({ companyId: fixture.companies.paused })).toBe(0);
    expect(await membership("paused")).toMatchObject({ status: "pendingAuthorization", leftAt: null });
  });
});
