import { randomUUID } from "node:crypto";

import { defaultKeyHasher } from "@better-auth/api-key";
import { serializeSignedCookie } from "better-call";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const requestContext = vi.hoisted(() => ({ headers: new Headers() }));

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(requestContext.headers),
  cookies: () =>
    Promise.resolve({ get: () => undefined, getAll: () => [], set: () => undefined, delete: () => undefined }),
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => {
    const translate = (key: string) => key;
    return Promise.resolve(Object.assign(translate, { raw: translate }));
  },
}));

import { GET as me } from "@/app/api/v1/users/me/route";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

type Workspace = "unpaid" | "lapsed" | "active";
type Subscription = {
  status: string;
  lemonSqueezyId: string | null;
  currentPeriodEnd: Date | null;
  updatedAt: Date;
};

const DAY_MS = 24 * 60 * 60 * 1000;

describeDatabase("integration credentials and the plan of their workspace on PostgreSQL", { timeout: 120_000 }, () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const authUserId = randomUUID();
  const email = `plan-${randomUUID()}@example.invalid`;
  const companies: Record<Workspace, string> = { unpaid: randomUUID(), lapsed: randomUUID(), active: randomUUID() };
  const members: Record<Workspace, string> = { unpaid: randomUUID(), lapsed: randomUUID(), active: randomUUID() };
  const keys: Partial<Record<Workspace, string>> = {};
  let unpaidBearer = "";
  let cookie = "";
  let sessionId = "";
  let previousAppMode: string;

  const subscriptions: Record<Workspace, Subscription> = {
    unpaid: {
      status: "expired",
      lemonSqueezyId: null,
      currentPeriodEnd: null,
      updatedAt: new Date(Date.now() - 30 * DAY_MS),
    },
    lapsed: {
      status: "expired",
      lemonSqueezyId: `ls-${randomUUID()}`,
      currentPeriodEnd: new Date(Date.now() - 5 * DAY_MS),
      updatedAt: new Date(Date.now() - DAY_MS),
    },
    active: {
      status: "active",
      lemonSqueezyId: `ls-${randomUUID()}`,
      currentPeriodEnd: new Date(Date.now() + 20 * DAY_MS),
      updatedAt: new Date(),
    },
  };

  async function whoAmI(credential: Record<string, string>) {
    requestContext.headers = new Headers({ "content-type": "application/json", ...credential });
    const response = await me();
    const body = (await response.json()) as { id?: string; error?: { issues?: Array<{ customCode?: string }> } };
    return {
      status: response.status,
      userId: response.status === 200 ? (body.id ?? null) : null,
      customCode: body.error?.issues?.[0]?.customCode ?? null,
    };
  }

  beforeAll(async () => {
    await client.connect();
    const { env } = await import("@/env");
    previousAppMode = env.APP_MODE;
    (env as { APP_MODE: string }).APP_MODE = "cloud";

    for (const workspace of Object.keys(companies) as Workspace[]) {
      const companyId = companies[workspace];
      const roleId = randomUUID();
      const subscription = subscriptions[workspace];
      await client.query('INSERT INTO "Company" ("id", "name", "updatedAt") VALUES ($1, $2, CURRENT_TIMESTAMP)', [
        companyId,
        `Plan ${workspace}`,
      ]);
      await client.query(
        'INSERT INTO "Subscription" ("id", "companyId", "status", "plan", "lemonSqueezyId", "currentPeriodEnd", "updatedAt") VALUES ($1, $2, $3::"SubscriptionStatus", \'pro\', $4, $5, $6)',
        [
          randomUUID(),
          companyId,
          subscription.status,
          subscription.lemonSqueezyId,
          subscription.currentPeriodEnd,
          subscription.updatedAt,
        ],
      );
      await client.query(
        'INSERT INTO "UserRole" ("id", "name", "isSystemRole", "companyId", "updatedAt") VALUES ($1, \'Admin\', TRUE, $2, CURRENT_TIMESTAMP)',
        [roleId, companyId],
      );
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "roleId", "status", "lastActiveAt", "onboardingWizardCompletedAt", "updatedAt") VALUES ($1, $2, \'Plan\', \'Owner\', $3, $4, \'active\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [members[workspace], email, companyId, roleId],
      );
    }
    await client.query(
      'INSERT INTO "AuthUser" ("id", "name", "email", "emailVerified", "companyId", "updatedAt") VALUES ($1, \'Plan Owner\', $2, TRUE, $3, CURRENT_TIMESTAMP)',
      [authUserId, email, companies.unpaid],
    );

    for (const workspace of Object.keys(companies) as Workspace[]) {
      const key = randomUUID().replaceAll("-", "").repeat(2);
      keys[workspace] = key;
      await client.query(
        'INSERT INTO "Apikey" ("id", "name", "key", "referenceId", "companyId", "configId", "enabled", "rateLimitEnabled", "requestCount", "createdAt", "updatedAt") VALUES ($1, \'Plan\', $2, $3, $4, \'default\', TRUE, FALSE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [randomUUID(), await defaultKeyHasher(key), authUserId, companies[workspace]],
      );
    }

    const clientId = `client-${randomUUID()}`;
    unpaidBearer = randomUUID();
    await client.query(
      'INSERT INTO "OauthApplication" ("id", "name", "clientId", "redirectUrls", "type", "createdAt", "updatedAt") VALUES ($1, \'Plan\', $2, \'http://127.0.0.1:1/callback\', \'public\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [randomUUID(), clientId],
    );
    await client.query(
      'INSERT INTO "OauthAccessToken" ("id", "accessToken", "refreshToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", "clientId", "userId", "scopes", "companyId", "createdAt", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL \'1 hour\', CURRENT_TIMESTAMP + INTERVAL \'1 day\', $4, $5, \'openid\', $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [randomUUID(), unpaidBearer, randomUUID(), clientId, authUserId, companies.unpaid],
    );

    sessionId = randomUUID();
    const token = randomUUID().replaceAll("-", "");
    await client.query(
      'INSERT INTO "AuthSession" ("id", "token", "userId", "expiresAt", "activeCompanyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [sessionId, token, authUserId, new Date(Date.now() + 60 * 60 * 1000), companies.unpaid],
    );
    const { auth } = await import("@/core/auth/better-auth");
    const secret = (await auth.$context).secret;
    cookie = (await serializeSignedCookie("app.session_token", token, secret)).split(";")[0];
  });

  afterAll(async () => {
    const { env } = await import("@/env");
    (env as { APP_MODE: string }).APP_MODE = previousAppMode;
    await client.query(
      'DELETE FROM "OauthApplication" WHERE "clientId" IN (SELECT "clientId" FROM "OauthAccessToken" WHERE "userId" = $1)',
      [authUserId],
    );
    await client.query('DELETE FROM "Apikey" WHERE "referenceId" = $1', [authUserId]);
    await client.query('DELETE FROM "AuthUser" WHERE "id" = $1', [authUserId]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [Object.values(companies)]);
    await client.end();
  });

  it("refuses the API key and the MCP token of a workspace that is still waiting for its first plan", async () => {
    expect(await whoAmI({ "x-api-key": keys.unpaid as string })).toEqual({
      status: 403,
      userId: null,
      customCode: "workspacePlanRequired",
    });
    expect(await whoAmI({ authorization: `Bearer ${unpaidBearer}` })).toMatchObject({
      status: 403,
      customCode: "workspacePlanRequired",
    });
  });

  it("keeps the keys of a paying workspace and of a lapsed one within its grace working", async () => {
    expect(await whoAmI({ "x-api-key": keys.active as string })).toEqual({
      status: 200,
      userId: members.active,
      customCode: null,
    });
    expect(await whoAmI({ "x-api-key": keys.lapsed as string })).toEqual({
      status: 200,
      userId: members.lapsed,
      customCode: null,
    });
  });

  it("refuses a new API key in the workspace without a plan even when the action is called directly", async () => {
    const { getCreateApiKeyInteractor } = await import("@/core/di");
    const { CustomErrorCode } = await import("@/core/validation/validation.types");
    const { interactorFailureCodes } = await import("@/core/validation/validation.utils");
    requestContext.headers = new Headers({ cookie });

    const refused = await getCreateApiKeyInteractor().invoke({ name: "Direct call" });

    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(interactorFailureCodes(refused.error)).toEqual([CustomErrorCode.workspacePlanRequired]);
    const count = await client.query<{ count: number }>(
      'SELECT count(*)::int AS count FROM "Apikey" WHERE "referenceId" = $1',
      [authUserId],
    );
    expect(count.rows[0].count).toBe(3);
  });

  it("still deactivates the members of a lapsed paid workspace after the grace and skips the one awaiting its first plan", async () => {
    await client.query('UPDATE "Subscription" SET "updatedAt" = $2 WHERE "companyId" = $1', [
      companies.lapsed,
      new Date(Date.now() - 4 * DAY_MS),
    ]);
    const { getUserRepo } = await import("@/core/di");
    const { runWithoutTenant } = await import("@/core/decorators/tenant-context");

    const due = await runWithoutTenant(() => getUserRepo().findUsersPastSubscriptionGracePeriod());
    const ours = due.map((user) => user.id).filter((id) => Object.values(members).includes(id));

    expect(ours).toEqual([members.lapsed]);
  });
});
