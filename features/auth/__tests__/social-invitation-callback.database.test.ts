import { randomInt, randomUUID } from "node:crypto";

import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { localOAuthClients, localOAuthCode, localOAuthRequest } from "@/tests/e2e/local-oauth-provider.mjs";

const requestContext = vi.hoisted(() => {
  process.env.GOOGLE_CLIENT_ID = "e2e-local-google-client";
  process.env.GOOGLE_CLIENT_SECRET = "e2e-local-google-secret";
  return { headers: new Headers() };
});

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

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const BASE_URL = "http://localhost:4000";

type Identity = { sub: string; email: string; name: string };

describeDatabase("Google sign-in from an invitation link on PostgreSQL", { timeout: 120_000 }, () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const existing = { authUserId: randomUUID(), email: `existing-${randomUUID()}@example.invalid` };
  const companies = { own: randomUUID(), invited: randomUUID() };
  const roles = { own: randomUUID(), invited: randomUUID() };
  const members = { own: randomUUID(), invitedAdmin: randomUUID() };
  const newEmail = `new-${randomUUID()}@example.invalid`;
  const newSub = String(randomInt(100_000_000, 999_999_999));
  let intent = "";

  async function socialSignIn(identity: Identity) {
    const { auth } = await import("@/core/auth/better-auth");
    const callbackURL = `/auth/invitation?intent=${encodeURIComponent(intent)}`;
    const started = await auth.handler(
      new Request(`${BASE_URL}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE_URL },
        body: JSON.stringify({ provider: "google", callbackURL, errorCallbackURL: "/auth/signin" }),
      }),
    );
    expect(started.status).toBe(200);
    const authorization = new URL(((await started.json()) as { url: string }).url);
    expect(`${authorization.origin}${authorization.pathname}`).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(authorization.searchParams.get("client_id")).toBe(localOAuthClients.google.id);
    const redirectUri = authorization.searchParams.get("redirect_uri") ?? "";
    expect(redirectUri).toBe(`${BASE_URL}/api/auth/callback/google`);

    const callback = new URL(redirectUri);
    callback.searchParams.set("state", authorization.searchParams.get("state") ?? "");
    callback.searchParams.set(
      "code",
      localOAuthCode({
        provider: "google",
        identity,
        codeChallenge: authorization.searchParams.get("code_challenge"),
        redirectUri,
      }),
    );
    const returned = await auth.handler(
      new Request(callback, { headers: { cookie: cookiePairs(started).join("; ") } }),
    );
    const session = cookiePairs(returned).find((pair) => pair.startsWith("app.session_token="));
    return { status: returned.status, location: returned.headers.get("location"), cookie: session ?? null };
  }

  function cookiePairs(response: Response) {
    return response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);
  }

  async function invitationCardFor(cookie: string) {
    const { getRouteGuardService } = await import("@/core/di");
    requestContext.headers = new Headers({ cookie });
    const resolution = await getRouteGuardService().resolveAccountState();
    return {
      email: resolution.sessionUser?.email ?? null,
      card: resolution.user ? "join" : resolution.sessionUser ? "invitation" : "signup",
    };
  }

  async function membershipsIn(companyId: string, email: string) {
    const { rows } = await client.query<{ status: string }>(
      'SELECT status::text FROM "User" WHERE "companyId"=$1 AND email=$2',
      [companyId, email],
    );
    return rows;
  }

  beforeAll(async () => {
    expect(process.env.GOOGLE_CLIENT_ID).toBe(localOAuthClients.google.id);
    expect(process.env.GOOGLE_CLIENT_SECRET).toBe(localOAuthClients.google.secret);
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const local = localOAuthRequest(input, init);
      if (local) return local;
      throw new Error(`Unexpected outgoing request to ${String(input instanceof Request ? input.url : input)}`);
    });
    await client.connect();
    for (const [companyId, name, roleId] of [
      [companies.own, "Own CRM", roles.own],
      [companies.invited, "Hoffmann Consulting", roles.invited],
    ]) {
      await client.query('INSERT INTO "Company" ("id","name","updatedAt") VALUES ($1,$2,CURRENT_TIMESTAMP)', [
        companyId,
        name,
      ]);
      await client.query(
        'INSERT INTO "Subscription" ("id","companyId","status","updatedAt") VALUES ($1,$2,\'active\',CURRENT_TIMESTAMP)',
        [randomUUID(), companyId],
      );
      await client.query(
        'INSERT INTO "UserRole" ("id","name","isSystemRole","companyId","updatedAt") VALUES ($1,\'Admin\',TRUE,$2,CURRENT_TIMESTAMP)',
        [roleId, companyId],
      );
    }
    for (const [userId, email, companyId, roleId] of [
      [members.own, existing.email, companies.own, roles.own],
      [members.invitedAdmin, `admin-${randomUUID()}@example.invalid`, companies.invited, roles.invited],
    ]) {
      await client.query(
        'INSERT INTO "User" ("id","email","firstName","lastName","country","companyId","roleId","status","lastActiveAt","onboardingWizardCompletedAt","updatedAt") VALUES ($1,$2,\'Ben\',\'Joiner\',\'de\',$3,$4,\'active\',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)',
        [userId, email, companyId, roleId],
      );
    }
    await client.query(
      'INSERT INTO "AuthUser" ("id","name","email","emailVerified","companyId","updatedAt") VALUES ($1,\'Ben Joiner\',$2,TRUE,$3,CURRENT_TIMESTAMP)',
      [existing.authUserId, existing.email, companies.own],
    );

    const { runWithTenant } = await import("@/core/decorators/tenant-context");
    const { InitializeRecordModelService } = await import("@/features/records/initialize-record-model.service");
    const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");
    const { createMockUser } = await import("@/tests/helpers/mock-user");
    for (const [companyId, userId, roleId] of [
      [companies.own, members.own, roles.own],
      [companies.invited, members.invitedAdmin, roles.invited],
    ]) {
      const owner = createMockUser({ id: userId, companyId, roleId });
      await runWithTenant(owner, () => new InitializeRecordModelService(createTestRecordRepo()).initialize());
    }

    const inviteToken = randomUUID().replaceAll("-", "");
    const inviteExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await client.query(
      'INSERT INTO "InviteToken" ("id","token","companyId","createdById","expiresAt","updatedAt") VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)',
      [randomUUID(), inviteToken, companies.invited, members.invitedAdmin, inviteExpiresAt],
    );
    const { getOnboardingIntentService } = await import("@/core/di");
    intent = getOnboardingIntentService().issueInvitation(inviteToken, inviteExpiresAt) ?? "";
  }, 120_000);

  afterAll(async () => {
    vi.unstubAllGlobals();
    await client.query('DELETE FROM "AuthUser" WHERE "email"=ANY($1)', [[existing.email, newEmail]]);
    await client.query('DELETE FROM "InviteToken" WHERE "companyId"=$1', [companies.invited]);
    await client.query('DELETE FROM "Company" WHERE "id"=ANY($1)', [Object.values(companies)]);
    await client.end();
  });

  it("links Google to the existing login, returns to the invitation and joins the invited workspace as pending", async () => {
    const sub = String(randomInt(100_000_000, 999_999_999));
    const signedIn = await socialSignIn({ sub, email: existing.email, name: "Ben Joiner" });

    expect(signedIn).toMatchObject({
      status: 302,
      location: `/auth/invitation?intent=${encodeURIComponent(intent)}`,
      cookie: expect.stringMatching(/^app\.session_token=/),
    });
    const accounts = await client.query<{ userId: string; accountId: string }>(
      'SELECT "userId","accountId" FROM "AuthAccount" WHERE "providerId"=\'google\' AND "accountId"=$1',
      [sub],
    );
    expect(accounts.rows).toEqual([{ userId: existing.authUserId, accountId: sub }]);
    const logins = await client.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM "AuthUser" WHERE email=$1',
      [existing.email],
    );
    expect(logins.rows[0].count).toBe(1);
    expect(await invitationCardFor(signedIn.cookie as string)).toEqual({ email: existing.email, card: "join" });

    const { getJoinWorkspaceInteractor } = await import("@/core/di");
    requestContext.headers = new Headers({ cookie: signedIn.cookie as string });
    expect(await getJoinWorkspaceInteractor().invoke({ intent, agreeToTerms: true })).toEqual({
      ok: true,
      data: { companyId: companies.invited, status: "pendingAuthorization", alreadyMember: false },
    });
    expect(await membershipsIn(companies.invited, existing.email)).toEqual([{ status: "pendingAuthorization" }]);
    expect(await membershipsIn(companies.own, existing.email)).toEqual([{ status: "active" }]);
  });

  it("creates a new login from Google that keeps the invitation flow and registers as pending in that workspace only", async () => {
    const signedIn = await socialSignIn({ sub: newSub, email: newEmail, name: "Lea Brandt" });

    expect(signedIn).toMatchObject({
      status: 302,
      location: `/auth/invitation?intent=${encodeURIComponent(intent)}`,
    });
    const created = await client.query<{ emailVerified: boolean; companyId: string | null }>(
      'SELECT "emailVerified","companyId" FROM "AuthUser" WHERE email=$1',
      [newEmail],
    );
    expect(created.rows).toEqual([{ emailVerified: true, companyId: null }]);
    expect(await invitationCardFor(signedIn.cookie as string)).toEqual({ email: newEmail, card: "invitation" });

    const { getRegisterOnboardingProfileInteractor } = await import("@/core/di");
    requestContext.headers = new Headers({ cookie: signedIn.cookie as string });
    const registered = await getRegisterOnboardingProfileInteractor().invoke({
      email: newEmail,
      firstName: "Lea",
      lastName: "Brandt",
      country: "de",
      avatarUrl: null,
      agreeToTerms: true,
      onboardingIntent: intent,
    });

    expect(registered).toMatchObject({ ok: true, data: { redirectTo: "/auth/pending" } });
    expect(await membershipsIn(companies.invited, newEmail)).toEqual([{ status: "pendingAuthorization" }]);
    const everywhere = await client.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM "User" WHERE email=$1',
      [newEmail],
    );
    expect(everywhere.rows[0].count).toBe(1);
  });

  it("brings a repeat Google sign-in of the new login back to its pending invitation without another account", async () => {
    const signedIn = await socialSignIn({ sub: newSub, email: newEmail, name: "Lea Brandt" });

    expect(signedIn.status).toBe(302);
    expect(await invitationCardFor(signedIn.cookie as string)).toEqual({ email: newEmail, card: "join" });
    expect(await membershipsIn(companies.invited, newEmail)).toEqual([{ status: "pendingAuthorization" }]);
    expect(await membershipsIn(companies.invited, existing.email)).toEqual([{ status: "pendingAuthorization" }]);
    const accounts = await client.query<{ accountId: string }>(
      'SELECT a."accountId" FROM "AuthAccount" a JOIN "AuthUser" u ON u.id=a."userId" WHERE u.email=$1 AND a."providerId"=\'google\'',
      [newEmail],
    );
    expect(accounts.rows).toEqual([{ accountId: newSub }]);
  });
});
