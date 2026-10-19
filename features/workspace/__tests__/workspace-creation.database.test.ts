import { randomUUID } from "node:crypto";

import { serializeSignedCookie } from "better-call";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { PrismaBillingUsageRepo } from "@/features/billing-usage/prisma-billing-usage.repository";

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

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("creating workspaces under one login on PostgreSQL", { timeout: 180_000 }, () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companyId = randomUUID();
  const authUserId = randomUUID();
  let previousAppMode: string;
  let cookie = "";

  beforeAll(async () => {
    await client.connect();
    const { env } = await import("@/env");
    previousAppMode = env.APP_MODE;
    (env as { APP_MODE: string }).APP_MODE = "cloud";

    const email = `creator-${randomUUID()}@example.invalid`;
    const roleId = randomUUID();
    await client.query(
      'INSERT INTO "Company" ("id", "name", "createdByAuthUserId", "updatedAt") VALUES ($1, \'Home\', $2, CURRENT_TIMESTAMP)',
      [companyId, randomUUID()],
    );
    await client.query(
      'INSERT INTO "Subscription" ("id", "companyId", "status", "updatedAt") VALUES ($1, $2, \'active\', CURRENT_TIMESTAMP)',
      [randomUUID(), companyId],
    );
    await client.query(
      'INSERT INTO "UserRole" ("id", "name", "isSystemRole", "companyId", "updatedAt") VALUES ($1, \'Admin\', TRUE, $2, CURRENT_TIMESTAMP)',
      [roleId, companyId],
    );
    await client.query(
      'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "roleId", "status", "agreeToTerms", "lastActiveAt", "onboardingWizardCompletedAt", "updatedAt") VALUES ($1, $2, \'Crea\', \'Tor\', $3, $4, \'active\', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [randomUUID(), email, companyId, roleId],
    );
    await client.query(
      'INSERT INTO "AuthUser" ("id", "name", "email", "emailVerified", "companyId", "updatedAt") VALUES ($1, \'Crea Tor\', $2, TRUE, $3, CURRENT_TIMESTAMP)',
      [authUserId, email, companyId],
    );

    const token = randomUUID().replaceAll("-", "");
    await client.query(
      'INSERT INTO "AuthSession" ("id", "token", "userId", "expiresAt", "activeCompanyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [randomUUID(), token, authUserId, new Date(Date.now() + 60 * 60 * 1000), companyId],
    );
    const { auth } = await import("@/core/auth/better-auth");
    const secret = (await auth.$context).secret;
    cookie = (await serializeSignedCookie("app.session_token", token, secret)).split(";")[0];
  });

  afterAll(async () => {
    const { env } = await import("@/env");
    (env as { APP_MODE: string }).APP_MODE = previousAppMode;
    const created = await client.query<{ id: string }>('SELECT "id" FROM "Company" WHERE "createdByAuthUserId" = $1', [
      authUserId,
    ]);
    await client.query('DELETE FROM "AuthUser" WHERE "id" = $1', [authUserId]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [
      [companyId, ...created.rows.map((row) => row.id)],
    ]);
    await client.end();
  });

  async function create(name: string) {
    const { getCreateWorkspaceInteractor } = await import("@/core/di");
    requestContext.headers = new Headers({ cookie });
    return getCreateWorkspaceInteractor().invoke({
      name,
      agreeToTerms: true,
    });
  }

  async function state() {
    const created = await client.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM "Company" WHERE "createdByAuthUserId" = $1',
      [authUserId],
    );
    const session = await client.query<{ activeCompanyId: string | null }>(
      'SELECT "activeCompanyId" FROM "AuthSession" WHERE "userId" = $1',
      [authUserId],
    );
    return {
      created: created.rows[0].count,
      activeCompanyId: session.rows[0].activeCompanyId,
    };
  }

  async function createdSubscriptions() {
    const result = await client.query<{ status: string }>(
      'SELECT s."status" FROM "Subscription" s JOIN "Company" c ON c."id" = s."companyId" WHERE c."createdByAuthUserId" = $1 ORDER BY s."status"::text',
      [authUserId],
    );
    return result.rows.map((row) => row.status);
  }

  it("gives the cloud trial to exactly one of several workspaces created at the same time", async () => {
    const results = await Promise.all(["Parallel 1", "Parallel 2", "Parallel 3"].map((name) => create(name)));

    expect(results.map((result) => result.ok)).toEqual([true, true, true]);
    expect(results.filter((result) => result.ok && result.data.trial)).toHaveLength(1);
    expect(await createdSubscriptions()).toEqual(["expired", "expired", "trial"]);
  });

  it("stops at the creation limit and leaves no partial workspace behind", async () => {
    const { CLOUD_WORKSPACE_CREATION_LIMIT } = await import("@/core/commercial/plan-catalog");
    const { CustomErrorCode } = await import("@/core/validation/validation.types");
    const { interactorFailureCodes } = await import("@/core/validation/validation.utils");
    const filler = Array.from({ length: CLOUD_WORKSPACE_CREATION_LIMIT - 3 }, () => randomUUID());
    for (const id of filler) {
      await client.query(
        'INSERT INTO "Company" ("id", "name", "createdByAuthUserId", "updatedAt") VALUES ($1, \'Filler\', $2, CURRENT_TIMESTAMP)',
        [id, authUserId],
      );
    }
    const before = await state();

    const refused = await create("One too many");

    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(interactorFailureCodes(refused.error)).toEqual([CustomErrorCode.workspaceLimitReached]);
    expect(await state()).toEqual(before);
    expect(before.created).toBe(CLOUD_WORKSPACE_CREATION_LIMIT);
  });

  it("counts a workspace the old deployment created without a creator for its earliest administrator only", async () => {
    const { PermissionService } = await import("@/core/base/permission.service");
    const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
    const repo = new PrismaUserRepo(new PermissionService(), new PrismaBillingUsageRepo());
    const legacyCompanyId = randomUUID();
    const roleId = randomUUID();
    const logins = { founder: randomUUID(), laterAdmin: randomUUID() };
    const emails = {
      founder: `legacy-founder-${randomUUID()}@example.invalid`,
      laterAdmin: `legacy-admin-${randomUUID()}@example.invalid`,
    };

    try {
      await client.query(
        'INSERT INTO "Company" ("id", "name", "updatedAt") VALUES ($1, \'Legacy\', CURRENT_TIMESTAMP)',
        [legacyCompanyId],
      );
      await client.query(
        'INSERT INTO "UserRole" ("id", "name", "isSystemRole", "companyId", "updatedAt") VALUES ($1, \'Admin\', TRUE, $2, CURRENT_TIMESTAMP)',
        [roleId, legacyCompanyId],
      );
      for (const [login, createdAt] of [
        ["founder", "2026-10-18T08:00:00.000Z"],
        ["laterAdmin", "2026-10-18T09:00:00.000Z"],
      ] as const) {
        await client.query(
          'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "roleId", "status", "createdAt", "updatedAt") VALUES ($1, $2, \'Leg\', \'Acy\', $3, $4, \'active\', $5, CURRENT_TIMESTAMP)',
          [randomUUID(), emails[login], legacyCompanyId, roleId, new Date(createdAt)],
        );
        await client.query(
          'INSERT INTO "AuthUser" ("id", "name", "email", "emailVerified", "companyId", "updatedAt") VALUES ($1, \'Leg Acy\', $2, TRUE, $3, CURRENT_TIMESTAMP)',
          [logins[login], emails[login], legacyCompanyId],
        );
      }

      expect(await repo.countCreatedWorkspacesUnscoped(logins.founder)).toBe(1);
      expect(await repo.hasCreatedWorkspaceUnscoped(logins.founder)).toBe(true);
      expect(await repo.countCreatedWorkspacesUnscoped(logins.laterAdmin)).toBe(0);
    } finally {
      await client.query('DELETE FROM "AuthUser" WHERE "id" = ANY($1)', [Object.values(logins)]);
      await client.query('DELETE FROM "Company" WHERE "id" = $1', [legacyCompanyId]);
    }
  });
});
