import { randomUUID } from "node:crypto";

import { defaultKeyHasher } from "@better-auth/api-key";
import { serializeSignedCookie } from "better-call";
import { NextRequest } from "next/server";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const requestContext = vi.hoisted(() => ({ headers: new Headers() }));
const seats = vi.hoisted(() => ({ updates: [] as Array<[string, number]> }));
const mails = vi.hoisted(() => ({
  sent: [] as Array<{ to: string; subject: string }>,
}));

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
vi.mock("@/features/email/email.service", () => ({
  EmailService: vi.fn(function () {
    return {
      send: (args: { to: string; subject: string }) => {
        mails.sent.push({ to: args.to, subject: args.subject });
        return Promise.resolve(true);
      },
    };
  }),
}));
vi.mock("@/ee/subscription/subscription.service", () => ({
  SubscriptionService: class {
    updateSubscriptionQuantityOrThrow(subscriptionId: string, quantity: number) {
      seats.updates.push([subscriptionId, quantity]);
      return Promise.resolve();
    }
  },
}));

import { GET as me } from "@/app/api/v1/users/me/route";
import { POST as removeMember } from "@/app/api/v1/members/remove/route";
import { PrismaBillingUsageRepo } from "@/features/billing-usage/prisma-billing-usage.repository";

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const SERVER_ACTION = {
  "next-action": "7f00c0ffee",
  "sec-fetch-mode": "cors",
  "sec-fetch-dest": "empty",
};
const PAGE_LOAD = {
  "sec-fetch-mode": "navigate",
  "sec-fetch-dest": "document",
};

type Person = "ada" | "ben" | "cleo" | "dana" | "max";

describeDatabase("removing a member from a workspace", { timeout: 180_000 }, () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companies = {
    team: randomUUID(),
    bensOwn: randomUUID(),
    cleosOwn: randomUUID(),
  };
  const roles = {
    teamAdmin: randomUUID(),
    teamMember: randomUUID(),
    teamManager: randomUUID(),
    bensOwnAdmin: randomUUID(),
    cleosOwnAdmin: randomUUID(),
  };
  const people: Record<Person, { email: string; loginId: string; teamMemberId: string }> = {
    ada: { email: "", loginId: randomUUID(), teamMemberId: randomUUID() },
    ben: { email: "", loginId: randomUUID(), teamMemberId: randomUUID() },
    cleo: { email: "", loginId: randomUUID(), teamMemberId: randomUUID() },
    dana: { email: "", loginId: randomUUID(), teamMemberId: randomUUID() },
    max: { email: "", loginId: randomUUID(), teamMemberId: randomUUID() },
  };
  const ownMemberships = { ben: randomUUID(), cleo: randomUUID() };
  const keys = {
    adaTeam: {
      id: randomUUID(),
      value: randomUUID().replaceAll("-", "").repeat(2),
    },
    benTeam: {
      id: randomUUID(),
      value: randomUUID().replaceAll("-", "").repeat(2),
    },
    benOwn: {
      id: randomUUID(),
      value: randomUUID().replaceAll("-", "").repeat(2),
    },
  };
  const benSessions = {
    stale: { id: randomUUID(), cookie: "" },
    other: { id: randomUUID(), cookie: "" },
  };
  const cleoSession = { id: randomUUID(), cookie: "" };
  const lemonSqueezyId = `ls-${randomUUID()}`;
  const clientId = `client-${randomUUID()}`;
  let intent = "";

  function as(session: { cookie: string }, kind: Record<string, string> = {}) {
    requestContext.headers = new Headers({ cookie: session.cookie, ...kind });
  }

  async function teamMembership(person: Person) {
    const result = await client.query<{
      status: string;
      left: boolean;
      roleId: string | null;
    }>(
      'SELECT status::text, "leftAt" IS NOT NULL AS left, "roleId" FROM "User" WHERE "companyId" = $1 AND email = $2',
      [companies.team, people[person].email],
    );
    return result.rows[0] ?? null;
  }

  async function lastUsed(person: Person) {
    const result = await client.query<{ companyId: string | null }>(
      'SELECT "companyId" FROM "AuthUser" WHERE id = $1',
      [people[person].loginId],
    );
    return result.rows[0]?.companyId ?? null;
  }

  async function activeCompanyId(sessionId: string) {
    const result = await client.query<{ activeCompanyId: string | null }>(
      'SELECT "activeCompanyId" FROM "AuthSession" WHERE id = $1',
      [sessionId],
    );
    return result.rows[0]?.activeCompanyId ?? null;
  }

  async function approvalTasks(person: Person) {
    const result = await client.query<{ count: number }>(
      'SELECT COUNT(*)::integer AS count FROM "CrmRecord" WHERE "companyId" = $1 AND "protectedKind" = \'membershipAuthorization\' AND "systemData"->>\'relatedUserId\' = $2 AND "deletedAt" IS NULL',
      [companies.team, people[person].teamMemberId],
    );
    return result.rows[0].count;
  }

  async function membershipOf(person: Person) {
    const { PermissionService } = await import("@/core/base/permission.service");
    const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
    const membership = await new PrismaUserRepo(
      new PermissionService(),
      new PrismaBillingUsageRepo(),
    ).findMembershipUnscoped(people[person].email, companies.team);
    if (!membership) throw new Error(`The team membership of ${person} is missing.`);
    return membership;
  }

  async function removeAs(actor: Person, reference: { userId?: string; email?: string }) {
    const { runWithTenant } = await import("@/core/decorators/tenant-context");
    const { getRemoveWorkspaceMemberInteractor } = await import("@/core/di");
    const membership = await membershipOf(actor);
    return runWithTenant(membership, () => getRemoveWorkspaceMemberInteractor().invoke(reference));
  }

  async function removalAs(actor: Person, userId: string) {
    const { runWithTenant } = await import("@/core/decorators/tenant-context");
    const { getGetMemberRemovalInteractor } = await import("@/core/di");
    const membership = await membershipOf(actor);
    return runWithTenant(membership, () => getGetMemberRemovalInteractor().invoke({ userId }));
  }

  async function failureCodes(result: { ok: boolean; error?: unknown }) {
    const { interactorFailureCodes } = await import("@/core/validation/validation.utils");
    expect(result.ok).toBe(false);
    return result.ok ? [] : interactorFailureCodes(result.error as never);
  }

  async function withApiKey(key: string, handler: (request: NextRequest) => Promise<Response>, body?: unknown) {
    const headers = new Headers({
      "content-type": "application/json",
      "x-api-key": key,
    });
    requestContext.headers = headers;
    const response = await handler(
      new NextRequest("http://localhost:4000/api/v1/members/remove", {
        method: body === undefined ? "GET" : "POST",
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
    return {
      status: response.status,
      body: (await response.json()) as Record<string, unknown>,
    };
  }

  async function session(loginId: string, activeCompany: string | null) {
    const { auth } = await import("@/core/auth/better-auth");
    const secret = (await auth.$context).secret;
    const id = randomUUID();
    const token = randomUUID().replaceAll("-", "");
    await client.query(
      'INSERT INTO "AuthSession" ("id", "token", "userId", "expiresAt", "activeCompanyId", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [id, token, loginId, new Date(Date.now() + 60 * 60 * 1000), activeCompany],
    );
    return {
      id,
      cookie: (await serializeSignedCookie("app.session_token", token, secret)).split(";")[0],
    };
  }

  beforeAll(async () => {
    await client.connect();
    for (const [person, { teamMemberId }] of Object.entries(people))
      people[person as Person].email = `remove-${person}-${teamMemberId}@example.invalid`;

    for (const [companyId, name] of [
      [companies.team, "Hoffmann Consulting"],
      [companies.bensOwn, "Ben Studio"],
      [companies.cleosOwn, "Cleo Labs"],
    ]) {
      await client.query('INSERT INTO "Company" ("id", "name", "updatedAt") VALUES ($1, $2, CURRENT_TIMESTAMP)', [
        companyId,
        name,
      ]);
    }
    await client.query(
      'INSERT INTO "Subscription" ("id", "companyId", "status", "plan", "lemonSqueezyId", "updatedAt") VALUES ($1, $2, \'active\', \'pro\', $3, CURRENT_TIMESTAMP), ($4, $5, \'active\', \'pro\', NULL, CURRENT_TIMESTAMP), ($6, $7, \'active\', \'pro\', NULL, CURRENT_TIMESTAMP)',
      [randomUUID(), companies.team, lemonSqueezyId, randomUUID(), companies.bensOwn, randomUUID(), companies.cleosOwn],
    );
    for (const [roleId, companyId, name, isSystemRole] of [
      [roles.teamAdmin, companies.team, "Admin", true],
      [roles.teamMember, companies.team, "Member", false],
      [roles.teamManager, companies.team, "Team lead", false],
      [roles.bensOwnAdmin, companies.bensOwn, "Admin", true],
      [roles.cleosOwnAdmin, companies.cleosOwn, "Admin", true],
    ] as const) {
      await client.query(
        'INSERT INTO "UserRole" ("id", "name", "isSystemRole", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
        [roleId, name, isSystemRole, companyId],
      );
    }
    for (const action of ["readAll", "update"]) {
      await client.query(
        'INSERT INTO "RolePermission" ("id", "roleId", "companyId", "resource", "action") VALUES ($1, $2, $3, \'users\', $4)',
        [randomUUID(), roles.teamManager, companies.team, action],
      );
    }

    const memberships: Array<[string, string, string, string | null, string]> = [
      [people.ada.teamMemberId, people.ada.email, companies.team, roles.teamAdmin, "active"],
      [people.ben.teamMemberId, people.ben.email, companies.team, roles.teamMember, "active"],
      [people.cleo.teamMemberId, people.cleo.email, companies.team, null, "pendingAuthorization"],
      [people.dana.teamMemberId, people.dana.email, companies.team, roles.teamMember, "inactive"],
      [people.max.teamMemberId, people.max.email, companies.team, roles.teamManager, "active"],
      [ownMemberships.ben, people.ben.email, companies.bensOwn, roles.bensOwnAdmin, "active"],
      [ownMemberships.cleo, people.cleo.email, companies.cleosOwn, roles.cleosOwnAdmin, "active"],
    ];
    for (const [userId, email, companyId, roleId, status] of memberships) {
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "roleId", "status", "lastActiveAt", "onboardingWizardCompletedAt", "updatedAt") VALUES ($1, $2, \'Team\', \'Person\', $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [userId, email, companyId, roleId, status],
      );
    }
    await client.query('UPDATE "User" SET "displayLanguage" = \'de\' WHERE id = $1', [people.ben.teamMemberId]);
    for (const person of Object.keys(people) as Person[]) {
      await client.query(
        'INSERT INTO "AuthUser" ("id", "name", "email", "emailVerified", "companyId", "updatedAt") VALUES ($1, $2, $3, TRUE, $4, CURRENT_TIMESTAMP)',
        [people[person].loginId, person, people[person].email, companies.team],
      );
    }

    const { runWithTenant } = await import("@/core/decorators/tenant-context");
    const { InitializeRecordModelService } = await import("@/features/records/initialize-record-model.service");
    const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");
    const { createMockUser } = await import("@/tests/helpers/mock-user");
    for (const [companyId, userId, roleId] of [
      [companies.team, people.ada.teamMemberId, roles.teamAdmin],
      [companies.bensOwn, ownMemberships.ben, roles.bensOwnAdmin],
      [companies.cleosOwn, ownMemberships.cleo, roles.cleosOwnAdmin],
    ]) {
      const owner = createMockUser({ id: userId, companyId, roleId });
      await runWithTenant(owner, () => new InitializeRecordModelService(createTestRecordRepo()).initialize());
    }

    for (const [key, owner, companyId] of [
      [keys.adaTeam, people.ada.loginId, companies.team],
      [keys.benTeam, people.ben.loginId, companies.team],
      [keys.benOwn, people.ben.loginId, companies.bensOwn],
    ] as const) {
      await client.query(
        'INSERT INTO "Apikey" ("id", "name", "key", "referenceId", "companyId", "configId", "enabled", "rateLimitEnabled", "requestCount", "createdAt", "updatedAt") VALUES ($1, \'Removal\', $2, $3, $4, \'default\', TRUE, FALSE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [key.id, await defaultKeyHasher(key.value), owner, companyId],
      );
    }
    await client.query(
      'INSERT INTO "OauthApplication" ("id", "name", "clientId", "redirectUrls", "type", "createdAt", "updatedAt") VALUES ($1, \'Removal\', $2, \'https://client.example.test/callback\', \'public\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [randomUUID(), clientId],
    );
    for (const companyId of [companies.team, companies.bensOwn]) {
      await client.query(
        'INSERT INTO "OauthAccessToken" ("id", "accessToken", "refreshToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", "clientId", "userId", "scopes", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, $4, $5, $6, \'openid\', $7, CURRENT_TIMESTAMP)',
        [
          randomUUID(),
          randomUUID(),
          randomUUID(),
          new Date(Date.now() + 60 * 60 * 1000),
          clientId,
          people.ben.loginId,
          companyId,
        ],
      );
    }

    Object.assign(benSessions.stale, await session(people.ben.loginId, companies.team));
    Object.assign(benSessions.other, await session(people.ben.loginId, companies.team));
    Object.assign(cleoSession, await session(people.cleo.loginId, companies.team));

    const { getMembershipTaskService } = await import("@/core/di");
    await runWithTenant(await membershipOf("cleo"), () =>
      getMembershipTaskService().registered(people.cleo.teamMemberId),
    );

    const inviteToken = randomUUID().replaceAll("-", "");
    const inviteExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await client.query(
      'INSERT INTO "InviteToken" ("id", "token", "companyId", "createdById", "expiresAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [randomUUID(), inviteToken, companies.team, people.ada.teamMemberId, inviteExpiresAt],
    );
    const { getOnboardingIntentService } = await import("@/core/di");
    intent = getOnboardingIntentService().issueInvitation(inviteToken, inviteExpiresAt) ?? "";
    if (!intent) throw new Error("The invitation intent could not be issued.");
  });

  afterAll(async () => {
    await client.query('DELETE FROM "AuthUser" WHERE id = ANY($1)', [Object.values(people).map((p) => p.loginId)]);
    await client.query('DELETE FROM "OauthApplication" WHERE "clientId" = $1', [clientId]);
    await client.query('DELETE FROM "InviteToken" WHERE "companyId" = $1', [companies.team]);
    await client.query('DELETE FROM "Company" WHERE id = ANY($1)', [Object.values(companies)]);
    await client.end();
  });

  it("shows which members the admin can remove and why the others cannot be removed", async () => {
    expect(await removalAs("ada", people.ben.teamMemberId)).toEqual({
      ok: true,
      data: { userId: people.ben.teamMemberId, refusal: null },
    });
    expect(await removalAs("ada", people.ada.teamMemberId)).toMatchObject({
      ok: true,
      data: { refusal: "self" },
    });
    expect(await removalAs("max", people.ada.teamMemberId)).toMatchObject({
      ok: true,
      data: { refusal: "lastAdmin" },
    });
  });

  it("removes an active member, revokes the login's credentials for this workspace only and frees the seat", async () => {
    expect(await removeAs("ada", { userId: people.ben.teamMemberId })).toEqual({
      ok: true,
      data: {
        userId: people.ben.teamMemberId,
        email: people.ben.email,
        previousStatus: "active",
      },
    });

    expect(await teamMembership("ben")).toEqual({
      status: "inactive",
      left: true,
      roleId: roles.teamMember,
    });
    const remainingKeys = await client.query<{ id: string }>(
      'SELECT id FROM "Apikey" WHERE "referenceId" = $1 ORDER BY id',
      [people.ben.loginId],
    );
    expect(remainingKeys.rows).toEqual([{ id: keys.benOwn.id }]);
    const remainingTokens = await client.query<{ companyId: string }>(
      'SELECT "companyId" FROM "OauthAccessToken" WHERE "userId" = $1',
      [people.ben.loginId],
    );
    expect(remainingTokens.rows).toEqual([{ companyId: companies.bensOwn }]);
    expect(await lastUsed("ben")).toBe(companies.bensOwn);
    expect(seats.updates).toEqual([[lemonSqueezyId, 2]]);
    expect(mails.sent).toEqual([
      {
        to: people.ben.email,
        subject: "Du wurdest aus „Hoffmann Consulting“ entfernt",
      },
    ]);
  });

  it("refuses the removed login's open pages and opens its own workspace on the next page load", async () => {
    const { getGetUserDetailsInteractor, getRouteGuardService } = await import("@/core/di");
    const { WorkspaceChangedError } = await import("@/core/errors/workspace-changed-error");

    as(benSessions.stale, SERVER_ACTION);
    await expect(getGetUserDetailsInteractor().invoke()).rejects.toBeInstanceOf(WorkspaceChangedError);
    expect(await activeCompanyId(benSessions.stale.id)).toBe(companies.team);

    as(benSessions.stale, PAGE_LOAD);
    expect((await getRouteGuardService().resolveAccountState()).user?.id).toBe(ownMemberships.ben);
    expect(await activeCompanyId(benSessions.stale.id)).toBe(companies.bensOwn);

    as(benSessions.other, SERVER_ACTION);
    await expect(getGetUserDetailsInteractor().invoke()).rejects.toBeInstanceOf(WorkspaceChangedError);
  });

  it("answers the removed member's API key for this workspace with 401 and keeps the other one working", async () => {
    expect((await withApiKey(keys.benTeam.value, me)).status).toBe(401);

    const own = await withApiKey(keys.benOwn.value, me);
    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ id: ownMemberships.ben });
  });

  it("declines a pending request and removes its approval task without touching the seats", async () => {
    expect(await approvalTasks("cleo")).toBe(1);

    expect(await removeAs("ada", { email: people.cleo.email })).toMatchObject({
      ok: true,
      data: { previousStatus: "pendingAuthorization" },
    });

    expect(await teamMembership("cleo")).toEqual({
      status: "inactive",
      left: true,
      roleId: null,
    });
    expect(await approvalTasks("cleo")).toBe(0);
    expect(await lastUsed("cleo")).toBe(companies.cleosOwn);
    expect(seats.updates).toHaveLength(1);
    expect(mails.sent).toHaveLength(1);
  });

  it("refuses a platform operator, then removes an inactive member over REST", async () => {
    const { CustomErrorCode } = await import("@/core/validation/validation.types");
    await client.query('UPDATE "User" SET "isPlatformOperator" = TRUE WHERE id = $1', [people.dana.teamMemberId]);
    expect(await failureCodes(await removeAs("ada", { userId: people.dana.teamMemberId }))).toEqual([
      CustomErrorCode.workspaceMemberPlatformOperator,
    ]);
    expect(await teamMembership("dana")).toMatchObject({
      status: "inactive",
      left: false,
    });
    await client.query('UPDATE "User" SET "isPlatformOperator" = FALSE WHERE id = $1', [people.dana.teamMemberId]);

    const removed = await withApiKey(keys.adaTeam.value, removeMember, {
      email: people.dana.email,
    });

    expect(removed).toEqual({
      status: 200,
      body: {
        userId: people.dana.teamMemberId,
        email: people.dana.email,
        previousStatus: "inactive",
      },
    });
    expect(await teamMembership("dana")).toMatchObject({
      status: "inactive",
      left: true,
    });
    expect(seats.updates).toHaveLength(1);
    expect(mails.sent.slice(1)).toEqual([
      {
        to: people.dana.email,
        subject: "You were removed from “Hoffmann Consulting”",
      },
    ]);
  });

  it("never removes the actor, the last active admin or a member who already left", async () => {
    const { CustomErrorCode } = await import("@/core/validation/validation.types");

    expect(await failureCodes(await removeAs("ada", { userId: people.ada.teamMemberId }))).toEqual([
      CustomErrorCode.workspaceMemberRemoveSelf,
    ]);
    expect(await failureCodes(await removeAs("max", { userId: people.ada.teamMemberId }))).toEqual([
      CustomErrorCode.workspaceMemberLastAdmin,
    ]);
    expect(await failureCodes(await removeAs("ada", { userId: people.ben.teamMemberId }))).toEqual([
      CustomErrorCode.workspaceMemberLeft,
    ]);
    const self = await withApiKey(keys.adaTeam.value, removeMember, {
      userId: people.ada.teamMemberId,
    });
    expect(self.status).toBe(403);

    const admin = await client.query<{ status: string; left: boolean }>(
      'SELECT status::text, "leftAt" IS NOT NULL AS left FROM "User" WHERE id = $1',
      [people.ada.teamMemberId],
    );
    expect(admin.rows).toEqual([{ status: "active", left: false }]);
    expect(mails.sent).toHaveLength(2);
  });

  it("revives the removed member as pending with a new invitation, and removing again declines it", async () => {
    const { getJoinWorkspaceInteractor } = await import("@/core/di");
    as(benSessions.stale);

    expect(
      await getJoinWorkspaceInteractor().invoke({
        intent,
        agreeToTerms: true,
      }),
    ).toEqual({
      ok: true,
      data: {
        companyId: companies.team,
        status: "pendingAuthorization",
        alreadyMember: false,
      },
    });
    expect(await teamMembership("ben")).toEqual({
      status: "pendingAuthorization",
      left: false,
      roleId: null,
    });
    expect(await approvalTasks("ben")).toBe(1);

    expect(await removeAs("ada", { userId: people.ben.teamMemberId })).toMatchObject({
      ok: true,
      data: { previousStatus: "pendingAuthorization" },
    });
    expect(await teamMembership("ben")).toMatchObject({
      status: "inactive",
      left: true,
    });
    expect(await approvalTasks("ben")).toBe(0);
    expect(await lastUsed("ben")).toBe(companies.bensOwn);
    expect(mails.sent).toHaveLength(2);
  });

  it("removes the approval task when the person withdraws the request", async () => {
    const { getJoinWorkspaceInteractor, getWithdrawWorkspaceRequestInteractor } = await import("@/core/di");
    as(cleoSession);
    expect(
      await getJoinWorkspaceInteractor().invoke({
        intent,
        agreeToTerms: true,
      }),
    ).toMatchObject({
      ok: true,
      data: { status: "pendingAuthorization" },
    });
    expect(await approvalTasks("cleo")).toBe(1);

    as(cleoSession, SERVER_ACTION);
    expect(
      await getWithdrawWorkspaceRequestInteractor().invoke({
        companyId: companies.team,
      }),
    ).toEqual({
      ok: true,
      data: { companyId: companies.team },
    });

    expect(await teamMembership("cleo")).toMatchObject({
      status: "inactive",
      left: true,
    });
    expect(await approvalTasks("cleo")).toBe(0);
    expect(await lastUsed("cleo")).toBe(companies.cleosOwn);
    expect(mails.sent).toHaveLength(2);
  });
  it("keeps declined and withdrawn requests out of Members while a removed member stays listed as a former member", async () => {
    const { runWithTenant } = await import("@/core/decorators/tenant-context");
    const { getGetUsersInteractor } = await import("@/core/di");
    const membership = await membershipOf("ada");

    const listed = await runWithTenant(membership, () => getGetUsersInteractor().invoke({}));

    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const emails = listed.data.items.map((member) => member.email);
    expect(emails).toEqual(expect.arrayContaining([people.ada.email, people.max.email, people.dana.email]));
    expect(emails).not.toContain(people.ben.email);
    expect(emails).not.toContain(people.cleo.email);
    expect(listed.data.items.find((member) => member.email === people.dana.email)?.leftAt).toBeInstanceOf(Date);
    expect(listed.data.pagination?.total).toBe(listed.data.items.length);
  });
});
