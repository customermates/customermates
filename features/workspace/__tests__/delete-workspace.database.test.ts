import { randomUUID } from "node:crypto";

import { serializeSignedCookie } from "better-call";
import { Client } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

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

const databaseUrl = getLocalDatabaseTestUrl();
const describeDatabase = databaseUrl ? describe : describe.skip;

const SERVER_ACTION = { "next-action": "7f00c0ffee", "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" };
const PAGE_LOAD = { "sec-fetch-mode": "navigate", "sec-fetch-dest": "document" };

type Login = { id: string; email: string; sessionId: string; cookie: string };
type Subscription = { status: string; lemonSqueezyId?: string | null; plan?: string; currentPeriodEnd?: Date | null };

describeDatabase("deleting a workspace on PostgreSQL", { timeout: 240_000 }, () => {
  const client = new Client({ connectionString: databaseUrl ?? undefined });
  const companies: string[] = [];
  const logins: string[] = [];
  let previousAppMode: string;
  let secret = "";

  beforeAll(async () => {
    await client.connect();
    const { env } = await import("@/env");
    previousAppMode = env.APP_MODE;
    (env as { APP_MODE: string }).APP_MODE = "cloud";
    const { auth } = await import("@/core/auth/better-auth");
    secret = (await auth.$context).secret;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    const { env } = await import("@/env");
    (env as { APP_MODE: string }).APP_MODE = previousAppMode;
    await client.query('DELETE FROM "AuthUser" WHERE "id" = ANY($1)', [logins]);
    await client.query('DELETE FROM "Company" WHERE "id" = ANY($1)', [companies]);
    await client.end();
  });

  async function createLogin(name: string): Promise<Login> {
    const id = randomUUID();
    const email = `${name}-${randomUUID()}@example.invalid`;
    logins.push(id);
    await client.query(
      'INSERT INTO "AuthUser" ("id", "name", "email", "emailVerified", "updatedAt") VALUES ($1, $2, $3, TRUE, CURRENT_TIMESTAMP)',
      [id, name, email],
    );
    const sessionId = randomUUID();
    const token = randomUUID().replaceAll("-", "");
    await client.query(
      'INSERT INTO "AuthSession" ("id", "token", "userId", "expiresAt", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
      [sessionId, token, id, new Date(Date.now() + 60 * 60 * 1000)],
    );
    const cookie = (await serializeSignedCookie("app.session_token", token, secret)).split(";")[0];
    return { id, email, sessionId, cookie };
  }

  async function createWorkspace(args: {
    name: string;
    createdBy: Login | null;
    admins: Login[];
    members?: Login[];
    subscription?: Subscription | null;
  }) {
    const companyId = randomUUID();
    companies.push(companyId);
    await client.query(
      'INSERT INTO "Company" ("id", "name", "createdByAuthUserId", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)',
      [companyId, args.name, args.createdBy?.id ?? null],
    );
    const subscription = args.subscription === undefined ? { status: "expired" } : args.subscription;
    if (subscription) {
      await client.query(
        'INSERT INTO "Subscription" ("id", "companyId", "status", "plan", "lemonSqueezyId", "currentPeriodEnd", "updatedAt") VALUES ($1, $2, $3::"SubscriptionStatus", $4::"SubscriptionPlan", $5, $6, CURRENT_TIMESTAMP)',
        [
          randomUUID(),
          companyId,
          subscription.status,
          subscription.plan ?? "pro",
          subscription.lemonSqueezyId ?? null,
          subscription.currentPeriodEnd ?? null,
        ],
      );
    }
    const roles = { admin: randomUUID(), member: randomUUID() };
    for (const [roleId, isSystemRole] of [
      [roles.admin, true],
      [roles.member, false],
    ] as const) {
      await client.query(
        'INSERT INTO "UserRole" ("id", "name", "isSystemRole", "companyId", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)',
        [roleId, isSystemRole ? "Admin" : "Member", isSystemRole, companyId],
      );
    }
    const users = new Map<string, string>();
    let offset = 0;
    for (const [login, roleId] of [
      ...args.admins.map((login) => [login, roles.admin] as const),
      ...(args.members ?? []).map((login) => [login, roles.member] as const),
    ]) {
      const userId = randomUUID();
      users.set(login.id, userId);
      await client.query(
        'INSERT INTO "User" ("id", "email", "firstName", "lastName", "companyId", "roleId", "status", "agreeToTerms", "lastActiveAt", "onboardingWizardCompletedAt", "createdAt", "updatedAt") VALUES ($1, $2, \'Synthetic\', \'Member\', $3, $4, \'active\', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, $5, CURRENT_TIMESTAMP)',
        [userId, login.email, companyId, roleId, new Date(Date.UTC(2026, 0, 1, 0, offset++))],
      );
    }

    const { runWithTenant } = await import("@/core/decorators/tenant-context");
    const { InitializeRecordModelService } = await import("@/features/records/initialize-record-model.service");
    const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");
    const { createMockUser } = await import("@/tests/helpers/mock-user");
    const owner = args.admins[0];
    if (owner) {
      const user = createMockUser({ id: users.get(owner.id), companyId, roleId: roles.admin });
      await runWithTenant(user, () => new InitializeRecordModelService(createTestRecordRepo()).initialize());
    }

    return { companyId, users, roles };
  }

  async function open(login: Login, companyId: string | null) {
    await client.query('UPDATE "AuthSession" SET "activeCompanyId" = $1 WHERE "id" = $2', [companyId, login.sessionId]);
    await client.query('UPDATE "AuthUser" SET "companyId" = $1 WHERE "id" = $2', [companyId, login.id]);
  }

  function as(login: Login, kind: Record<string, string> = SERVER_ACTION) {
    requestContext.headers = new Headers({ cookie: login.cookie, ...kind });
  }

  async function remove(login: Login, companyId: string) {
    const { getDeleteWorkspaceInteractor } = await import("@/core/di");
    as(login);
    return getDeleteWorkspaceInteractor().invoke({ companyId });
  }

  async function refusal(login: Login) {
    const { getGetWorkspaceDeletionInteractor } = await import("@/core/di");
    as(login);
    const result = await getGetWorkspaceDeletionInteractor().invoke();
    if (!result.ok) throw new Error("The deletion state could not be read");
    return result.data.refusal;
  }

  async function codes(result: { ok: boolean; error?: unknown }) {
    const { interactorFailureCodes } = await import("@/core/validation/validation.utils");
    return result.ok ? [] : interactorFailureCodes(result.error as never);
  }

  async function exists(companyId: string) {
    const result = await client.query('SELECT 1 FROM "Company" WHERE "id" = $1', [companyId]);
    return result.rowCount === 1;
  }

  async function login(id: string) {
    const result = await client.query<{ companyId: string | null; trialConsumedAt: Date | null }>(
      'SELECT "companyId", "trialConsumedAt" FROM "AuthUser" WHERE "id" = $1',
      [id],
    );
    return result.rows[0];
  }

  async function activeCompany(sessionId: string) {
    const result = await client.query<{ activeCompanyId: string | null }>(
      'SELECT "activeCompanyId" FROM "AuthSession" WHERE "id" = $1',
      [sessionId],
    );
    return result.rows[0]?.activeCompanyId ?? null;
  }

  async function companyScopedCounts(companyId: string) {
    const { Prisma } = await import("@/generated/prisma");
    const counts: Record<string, number> = {};
    for (const model of Prisma.dmmf.datamodel.models) {
      const field = model.fields.find((candidate) => candidate.name === "companyId");
      if (!field) continue;
      const result = await client.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM "${model.dbName ?? model.name}" WHERE "${field.dbName ?? field.name}" = $1`,
        [companyId],
      );
      counts[model.name] = result.rows[0].count;
    }
    return counts;
  }

  async function populate(companyId: string, owner: Login, ownerUserId: string) {
    await client.query(
      'INSERT INTO "Apikey" ("id", "key", "referenceId", "companyId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [randomUUID(), `key-${randomUUID()}`, owner.id, companyId],
    );
    const clientId = `client-${randomUUID()}`;
    await client.query(
      'INSERT INTO "OauthApplication" ("id", "name", "clientId", "redirectUrls", "type", "createdAt", "updatedAt") VALUES ($1, \'Synthetic MCP\', $2, \'http://127.0.0.1:1/callback\', \'public\', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [randomUUID(), clientId],
    );
    await client.query(
      'INSERT INTO "OauthAccessToken" ("id", "accessToken", "refreshToken", "accessTokenExpiresAt", "refreshTokenExpiresAt", "clientId", "userId", "scopes", "companyId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, $4, $5, $6, \'openid\', $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [
        randomUUID(),
        `access-${randomUUID()}`,
        `refresh-${randomUUID()}`,
        new Date(Date.now() + 3_600_000),
        clientId,
        owner.id,
        companyId,
      ],
    );
    await client.query(
      'INSERT INTO "InviteToken" ("id", "token", "companyId", "createdById", "expiresAt", "updatedAt") VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)',
      [randomUUID(), `invite-${randomUUID()}`, companyId, ownerUserId, new Date(Date.now() + 3_600_000)],
    );
    const webhookId = randomUUID();
    await client.query(
      'INSERT INTO "Webhook" ("id", "url", "companyId", "updatedAt") VALUES ($1, \'https://hooks.example.invalid/deleted\', $2, CURRENT_TIMESTAMP)',
      [webhookId, companyId],
    );
    await client.query(
      'INSERT INTO "WebhookDelivery" ("id", "url", "companyId", "event", "requestBody", "webhookId") VALUES ($1, \'https://hooks.example.invalid/deleted\', $2, \'contact.created\', \'{}\'::jsonb, $3)',
      [randomUUID(), companyId, webhookId],
    );
    await client.query(
      'INSERT INTO "WikiPage" ("id", "companyId", "title", "markdown", "updatedAt") VALUES ($1, $2, \'Synthetic page\', \'Synthetic text\', CURRENT_TIMESTAMP)',
      [randomUUID(), companyId],
    );
    await client.query(
      'INSERT INTO "MessagingInboundEvent" ("id", "companyId", "source", "payload") VALUES ($1, $2, \'webhook\', \'{}\'::jsonb)',
      [randomUUID(), companyId],
    );
    const accountId = randomUUID();
    const unipileAccountId = `unipile-${randomUUID()}`;
    await client.query(
      'INSERT INTO "ConnectedAccount" ("id", "companyId", "userId", "unipileAccountId", "provider", "status", "updatedAt") VALUES ($1, $2, $3, $4, \'google\', \'ok\', CURRENT_TIMESTAMP)',
      [accountId, companyId, ownerUserId, unipileAccountId],
    );
    const [workflow] = (
      await client.query<{ installed: boolean }>(
        "SELECT to_regclass('workflow.workflow_runs') IS NOT NULL AS installed",
      )
    ).rows;
    const workflowRunId = `wrun_${randomUUID()}`;
    if (workflow?.installed) {
      await client.query(
        'INSERT INTO "workflow"."workflow_runs" ("id", "deployment_id", "status", "name", "input") VALUES ($1, \'synthetic\', \'completed\', \'synthetic\', $2::jsonb)',
        [workflowRunId, JSON.stringify({ companyId })],
      );
    }
    return { accountId, unipileAccountId, workflowRunId: workflow?.installed ? workflowRunId : null };
  }

  async function stubChannelProvider() {
    const { MessagingService } = await import("@/ee/messaging/messaging.service");
    return vi.spyOn(MessagingService.prototype, "deleteAccount").mockResolvedValue(undefined);
  }

  it("deletes everything the workspace owns and moves every member to another workspace", async () => {
    const creator = await createLogin("creator");
    const colleague = await createLogin("colleague");
    const home = await createWorkspace({ name: "Home", createdBy: null, admins: [creator, colleague] });
    const doomed = await createWorkspace({
      name: "Doomed",
      createdBy: creator,
      admins: [creator],
      members: [colleague],
    });
    await open(creator, doomed.companyId);
    await open(colleague, doomed.companyId);
    await client.query(
      'INSERT INTO "Apikey" ("id", "key", "referenceId", "companyId", "createdAt", "updatedAt") VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      [randomUUID(), `key-${randomUUID()}`, creator.id, home.companyId],
    );
    const owned = await populate(doomed.companyId, creator, doomed.users.get(creator.id) ?? "");
    const providerDelete = await stubChannelProvider();
    const before = await companyScopedCounts(doomed.companyId);
    expect(before.RecordTypeDefinition).toBeGreaterThan(0);
    expect(before.ConnectedAccount).toBe(1);
    expect(before.AuthUser).toBe(2);

    const result = await remove(creator, doomed.companyId);

    expect(result).toEqual({ ok: true, data: { companyId: doomed.companyId, nextCompanyId: home.companyId } });
    expect(providerDelete).toHaveBeenCalledWith({ accountId: owned.unipileAccountId });
    expect(await exists(doomed.companyId)).toBe(false);
    const after = await companyScopedCounts(doomed.companyId);
    expect(Object.entries(after).filter(([, count]) => count > 0)).toEqual([]);
    expect(Object.keys(after).length).toBeGreaterThan(50);
    if (owned.workflowRunId) {
      const runs = await client.query('SELECT 1 FROM "workflow"."workflow_runs" WHERE "id" = $1', [
        owned.workflowRunId,
      ]);
      expect(runs.rowCount).toBe(0);
    }
    const homeKeys = await client.query('SELECT 1 FROM "Apikey" WHERE "companyId" = $1', [home.companyId]);
    expect(homeKeys.rowCount).toBe(1);

    expect(await login(creator.id)).toMatchObject({ companyId: home.companyId, trialConsumedAt: expect.any(Date) });
    expect((await login(colleague.id)).companyId).toBe(home.companyId);
    expect(await activeCompany(creator.sessionId)).toBe(home.companyId);
    expect(await activeCompany(colleague.sessionId)).toBe(doomed.companyId);
  });

  it("shows a member's open tab the workspace-changed notice and opens their other workspace on reload", async () => {
    const creator = await createLogin("creator");
    const colleague = await createLogin("colleague");
    const home = await createWorkspace({ name: "Colleague home", createdBy: colleague, admins: [colleague] });
    const doomed = await createWorkspace({
      name: "Shared",
      createdBy: creator,
      admins: [creator],
      members: [colleague],
    });
    await open(creator, doomed.companyId);
    await open(colleague, doomed.companyId);

    expect((await remove(creator, doomed.companyId)).ok).toBe(true);

    const { getGetUserDetailsInteractor, getRouteGuardService } = await import("@/core/di");
    const { WorkspaceChangedError } = await import("@/core/errors/workspace-changed-error");
    as(colleague);
    await expect(getGetUserDetailsInteractor().invoke()).rejects.toBeInstanceOf(WorkspaceChangedError);

    as(colleague, PAGE_LOAD);
    const resolution = await getRouteGuardService().resolveAccountState();
    expect(resolution.user?.companyId).toBe(home.companyId);
    expect(await activeCompany(colleague.sessionId)).toBe(home.companyId);
  });

  it("sends a deleter without any other workspace to create one", async () => {
    const creator = await createLogin("solo");
    const doomed = await createWorkspace({ name: "Only", createdBy: creator, admins: [creator] });
    await open(creator, doomed.companyId);

    const result = await remove(creator, doomed.companyId);

    expect(result).toEqual({ ok: true, data: { companyId: doomed.companyId, nextCompanyId: null } });
    expect(await login(creator.id)).toMatchObject({ companyId: null });
    expect(await activeCompany(creator.sessionId)).toBeNull();

    const { getRouteGuardService } = await import("@/core/di");
    as(creator, PAGE_LOAD);
    expect((await getRouteGuardService().resolveAccountState()).state).toBe("unregistered");
  });

  it("never grants a second trial after the trial workspace was deleted", async () => {
    const creator = await createLogin("trial");
    const inviter = await createLogin("inviter");
    const home = await createWorkspace({
      name: "Invited",
      createdBy: inviter,
      admins: [inviter],
      members: [creator],
      subscription: { status: "active" },
    });
    await open(creator, home.companyId);
    const { getCreateWorkspaceInteractor } = await import("@/core/di");

    as(creator);
    const first = await getCreateWorkspaceInteractor().invoke({ name: "First", agreeToTerms: true });
    expect(first).toMatchObject({ ok: true, data: { trial: true } });
    if (!first.ok) return;
    companies.push(first.data.companyId);
    expect((await login(creator.id)).trialConsumedAt).toBeInstanceOf(Date);
    expect(await refusal(creator)).toBeNull();

    expect((await remove(creator, first.data.companyId)).ok).toBe(true);

    as(creator);
    const second = await getCreateWorkspaceInteractor().invoke({ name: "Second", agreeToTerms: true });
    expect(second).toMatchObject({ ok: true, data: { trial: false } });
    if (!second.ok) return;
    companies.push(second.data.companyId);
    const subscription = await client.query<{ status: string; trialEndDate: Date | null }>(
      'SELECT "status", "trialEndDate" FROM "Subscription" WHERE "companyId" = $1',
      [second.data.companyId],
    );
    expect(subscription.rows[0]).toEqual({ status: "expired", trialEndDate: null });
  });

  it("records the trial on a legacy creator who never had it recorded", async () => {
    const creator = await createLogin("legacy");
    const doomed = await createWorkspace({
      name: "Legacy",
      createdBy: null,
      admins: [creator],
      subscription: { status: "trial" },
    });
    await open(creator, doomed.companyId);
    expect((await login(creator.id)).trialConsumedAt).toBeNull();

    expect((await remove(creator, doomed.companyId)).ok).toBe(true);

    expect((await login(creator.id)).trialConsumedAt).toBeInstanceOf(Date);
  });

  it.each([
    ["active", { status: "active", lemonSqueezyId: "ls-active" }, "billingActive"],
    ["past due", { status: "pastDue", lemonSqueezyId: "ls-past-due" }, "billingActive"],
    ["paused or unpaid", { status: "unPaid", lemonSqueezyId: "ls-paused" }, "billingActive"],
    [
      "cancelled within its period",
      { status: "cancelled", lemonSqueezyId: "ls-cancelled", currentPeriodEnd: new Date(Date.now() + 86_400_000) },
      "billingActive",
    ],
    ["enterprise", { status: "active", plan: "enterprise" }, "invoiced"],
  ] as const)("keeps a workspace whose subscription is %s", async (_label, subscription, expected) => {
    const creator = await createLogin("payer");
    const doomed = await createWorkspace({
      name: "Paid",
      createdBy: creator,
      admins: [creator],
      subscription: {
        ...subscription,
        lemonSqueezyId: "lemonSqueezyId" in subscription ? `${subscription.lemonSqueezyId}-${randomUUID()}` : null,
      },
    });
    await open(creator, doomed.companyId);
    const { WORKSPACE_DELETE_REFUSAL_CODES } = await import("../workspace-deletion-refusal");

    expect(await refusal(creator)).toBe(expected);
    const result = await remove(creator, doomed.companyId);

    expect(await codes(result)).toEqual([WORKSPACE_DELETE_REFUSAL_CODES[expected]]);
    expect(await exists(doomed.companyId)).toBe(true);
  });

  it.each([
    ["no subscription row", null],
    [
      "a cancelled subscription whose period ended",
      { status: "cancelled", lemonSqueezyId: "ls-ended", currentPeriodEnd: new Date(Date.now() - 86_400_000) },
    ],
    ["an expired paid subscription", { status: "expired", lemonSqueezyId: "ls-expired" }],
  ] as const)("deletes a workspace with %s", async (_label, subscription) => {
    const creator = await createLogin("lapsed");
    const doomed = await createWorkspace({
      name: "Lapsed",
      createdBy: creator,
      admins: [creator],
      subscription: subscription
        ? { ...subscription, lemonSqueezyId: `${subscription.lemonSqueezyId}-${randomUUID()}` }
        : null,
    });
    await open(creator, doomed.companyId);

    expect(await refusal(creator)).toBeNull();
    expect((await remove(creator, doomed.companyId)).ok).toBe(true);
    expect(await exists(doomed.companyId)).toBe(false);
  });

  it("refuses another admin and a member who did not create the workspace", async () => {
    const creator = await createLogin("creator");
    const admin = await createLogin("admin");
    const member = await createLogin("member");
    const doomed = await createWorkspace({
      name: "Guarded",
      createdBy: creator,
      admins: [creator, admin],
      members: [member],
    });
    await open(admin, doomed.companyId);
    await open(member, doomed.companyId);
    const { CustomErrorCode } = await import("@/core/validation/validation.types");

    expect(await refusal(admin)).toBe("notCreator");
    expect(await codes(await remove(admin, doomed.companyId))).toEqual([CustomErrorCode.workspaceDeleteNotCreator]);
    expect(await refusal(member)).toBe("notAdmin");
    expect(await codes(await remove(member, doomed.companyId))).toEqual([CustomErrorCode.workspaceDeleteAdminRequired]);
    expect(await exists(doomed.companyId)).toBe(true);
  });

  it("refuses the creator once they are no longer an admin", async () => {
    const creator = await createLogin("demoted");
    const admin = await createLogin("successor");
    const doomed = await createWorkspace({
      name: "Handed over",
      createdBy: creator,
      admins: [admin],
      members: [creator],
    });
    await open(creator, doomed.companyId);

    expect(await refusal(creator)).toBe("notAdmin");
    expect((await remove(creator, doomed.companyId)).ok).toBe(false);
    expect(await exists(doomed.companyId)).toBe(true);
  });

  it("refuses when the subscription activates while the delete waits for the workspace lock", async () => {
    const creator = await createLogin("racer");
    const doomed = await createWorkspace({ name: "Racing", createdBy: creator, admins: [creator] });
    await open(creator, doomed.companyId);
    const webhook = new Client({ connectionString: databaseUrl ?? undefined });
    await webhook.connect();
    const { CustomErrorCode } = await import("@/core/validation/validation.types");

    try {
      await webhook.query("BEGIN");
      await webhook.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [doomed.companyId]);
      const pending = remove(creator, doomed.companyId);
      await new Promise((resolve) => setTimeout(resolve, 750));
      await webhook.query(
        'UPDATE "Subscription" SET "status" = \'active\', "lemonSqueezyId" = $2, "currentPeriodEnd" = $3 WHERE "companyId" = $1',
        [doomed.companyId, `ls-race-${randomUUID()}`, new Date(Date.now() + 30 * 86_400_000)],
      );
      await webhook.query("COMMIT");

      expect(await codes(await pending)).toEqual([CustomErrorCode.workspaceDeleteBillingActive]);
      expect(await exists(doomed.companyId)).toBe(true);
    } finally {
      await webhook.end();
    }
  });

  async function deletingAt(companyId: string) {
    const result = await client.query<{ deletingAt: Date | null }>(
      'SELECT "deletingAt" FROM "Company" WHERE "id" = $1',
      [companyId],
    );
    return result.rows[0]?.deletingAt ?? null;
  }

  async function activeAccounts(companyId: string) {
    const result = await client.query('SELECT 1 FROM "ConnectedAccount" WHERE "companyId" = $1', [companyId]);
    return result.rowCount;
  }

  it("keeps the connected accounts when billing activates while the delete waits for the workspace lock", async () => {
    const creator = await createLogin("channel-racer");
    const doomed = await createWorkspace({ name: "Channel race", createdBy: creator, admins: [creator] });
    await open(creator, doomed.companyId);
    await populate(doomed.companyId, creator, doomed.users.get(creator.id) ?? "");
    const { MessagingService } = await import("@/ee/messaging/messaging.service");
    const disconnected = vi.spyOn(MessagingService.prototype, "deleteAccount").mockResolvedValue(undefined as never);
    const webhook = new Client({ connectionString: databaseUrl ?? undefined });
    await webhook.connect();
    const { CustomErrorCode } = await import("@/core/validation/validation.types");

    try {
      await webhook.query("BEGIN");
      await webhook.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [doomed.companyId]);
      const pending = remove(creator, doomed.companyId);
      await new Promise((resolve) => setTimeout(resolve, 750));
      await webhook.query(
        'UPDATE "Subscription" SET "status" = \'active\', "lemonSqueezyId" = $2, "currentPeriodEnd" = $3 WHERE "companyId" = $1',
        [doomed.companyId, `ls-channel-race-${randomUUID()}`, new Date(Date.now() + 30 * 86_400_000)],
      );
      await webhook.query("COMMIT");

      expect(await codes(await pending)).toEqual([CustomErrorCode.workspaceDeleteBillingActive]);
      expect(disconnected).not.toHaveBeenCalled();
      expect(await activeAccounts(doomed.companyId)).toBe(1);
      expect(await exists(doomed.companyId)).toBe(true);
      expect(await deletingAt(doomed.companyId)).toBeNull();
    } finally {
      await webhook.end();
    }
  });

  it("holds billing writes and new checkouts while the workspace is being deleted", async () => {
    const creator = await createLogin("marked");
    const doomed = await createWorkspace({ name: "Marked", createdBy: creator, admins: [creator] });
    await client.query('UPDATE "Company" SET "deletingAt" = NOW() WHERE "id" = $1', [doomed.companyId]);
    const { PrismaCompanyRepo } = await import("@/features/company/prisma-company.repository");
    const { runWithTenant } = await import("@/core/decorators/tenant-context");
    const { createMockUser } = await import("@/tests/helpers/mock-user");
    const repo = new PrismaCompanyRepo();
    const lemonSqueezyId = `ls-marked-${randomUUID()}`;
    const write = (whileDeleting?: true) =>
      repo.writeSubscriptionUnscoped({
        companyId: doomed.companyId,
        expectedLemonSqueezyId: null,
        lemonSqueezyId,
        status: "active",
        plan: "pro",
        ...(whileDeleting ? { whileDeleting } : {}),
      });
    const user = createMockUser({
      id: doomed.users.get(creator.id),
      companyId: doomed.companyId,
      roleId: doomed.roles.admin,
    });
    const claim = () =>
      runWithTenant(user, () =>
        repo.claimCheckoutStart({ startedAt: new Date(), pendingSince: new Date(0), lemonSqueezyId: null }),
      );

    expect(await write()).toBe(false);
    expect(await claim()).toBe("deleting");
    expect(await write(true)).toBe(true);

    await client.query('UPDATE "Company" SET "deletingAt" = NOW() - interval \'1 hour\' WHERE "id" = $1', [
      doomed.companyId,
    ]);
    expect(await claim()).toBe("pending");
  });

  it("lets a webhook that arrives after the delete find no subscription to update", async () => {
    const creator = await createLogin("late");
    const lemonSqueezyId = `ls-late-${randomUUID()}`;
    const doomed = await createWorkspace({
      name: "Late",
      createdBy: creator,
      admins: [creator],
      subscription: { status: "expired", lemonSqueezyId },
    });
    await open(creator, doomed.companyId);
    expect((await remove(creator, doomed.companyId)).ok).toBe(true);

    const { PrismaCompanyRepo } = await import("@/features/company/prisma-company.repository");
    const repo = new PrismaCompanyRepo();
    expect(
      await repo.writeSubscriptionUnscoped({
        companyId: doomed.companyId,
        expectedLemonSqueezyId: lemonSqueezyId,
        lemonSqueezyId,
        status: "active",
      } as never),
    ).toBe(false);
    expect(await repo.findWorkspaceBillingBySubscriptionIdUnscoped(lemonSqueezyId)).toBeNull();
  });

  async function startCheckout(companyId: string, minutesAgo: number) {
    await client.query(
      'UPDATE "Subscription" SET "checkoutStartedAt" = NOW() - make_interval(mins => $2) WHERE "companyId" = $1',
      [companyId, minutesAgo],
    );
  }

  async function billing(companyId: string) {
    const result = await client.query<{
      status: string;
      lemonSqueezyId: string | null;
    }>('SELECT "status"::text AS "status", "lemonSqueezyId" FROM "Subscription" WHERE "companyId" = $1', [companyId]);
    return result.rows[0];
  }

  it("records a paid subscription whose webhook never arrived and keeps the workspace", async () => {
    const creator = await createLogin("unrecorded");
    const doomed = await createWorkspace({
      name: "Unrecorded",
      createdBy: creator,
      admins: [creator],
    });
    await open(creator, doomed.companyId);
    await startCheckout(doomed.companyId, 45);
    const providerId = String(900_000_000 + Math.floor(Math.random() * 1_000_000));
    const { SubscriptionService } = await import("@/ee/subscription/subscription.service");
    const listed = vi
      .spyOn(SubscriptionService.prototype, "listStoreSubscriptionsByEmailOrThrowUnscoped")
      .mockResolvedValue([
        {
          data: {
            id: providerId,
            attributes: {
              status: "active",
              created_at: new Date(Date.now() - 40 * 60_000).toISOString(),
              renews_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
              user_email: creator.email,
            },
          },
        },
      ]);
    const { CustomErrorCode } = await import("@/core/validation/validation.types");

    expect(await codes(await remove(creator, doomed.companyId))).toEqual([
      CustomErrorCode.workspaceDeleteBillingActive,
    ]);
    expect(listed).toHaveBeenCalledWith(creator.email.toLowerCase());
    expect(await exists(doomed.companyId)).toBe(true);
    expect(await billing(doomed.companyId)).toEqual({
      status: "active",
      lemonSqueezyId: providerId,
    });
    expect(await refusal(creator)).toBe("billingActive");
  });

  it("deletes nothing when Lemon Squeezy cannot confirm that a started checkout went unpaid", async () => {
    const creator = await createLogin("unverified");
    const doomed = await createWorkspace({
      name: "Unverified",
      createdBy: creator,
      admins: [creator],
    });
    await open(creator, doomed.companyId);
    await startCheckout(doomed.companyId, 45);
    const { SubscriptionService } = await import("@/ee/subscription/subscription.service");
    vi.spyOn(SubscriptionService.prototype, "listStoreSubscriptionsByEmailOrThrowUnscoped").mockRejectedValue(
      new Error("provider unavailable"),
    );
    const { CustomErrorCode } = await import("@/core/validation/validation.types");

    expect(await codes(await remove(creator, doomed.companyId))).toEqual([
      CustomErrorCode.workspaceDeleteBillingUnverified,
    ]);
    expect(await exists(doomed.companyId)).toBe(true);
    expect(await billing(doomed.companyId)).toEqual({
      status: "expired",
      lemonSqueezyId: null,
    });
  });

  it("deletes a workspace whose started checkout left no subscription at Lemon Squeezy", async () => {
    const creator = await createLogin("abandoned");
    const doomed = await createWorkspace({
      name: "Abandoned",
      createdBy: creator,
      admins: [creator],
    });
    await open(creator, doomed.companyId);
    await startCheckout(doomed.companyId, 45);
    const { SubscriptionService } = await import("@/ee/subscription/subscription.service");
    vi.spyOn(SubscriptionService.prototype, "listStoreSubscriptionsByEmailOrThrowUnscoped").mockResolvedValue([]);

    expect((await remove(creator, doomed.companyId)).ok).toBe(true);
    expect(await exists(doomed.companyId)).toBe(false);
  });

  it("deletes once when two tabs confirm at the same time", async () => {
    const creator = await createLogin("tabs");
    const home = await createWorkspace({ name: "Tabs home", createdBy: null, admins: [creator] });
    const doomed = await createWorkspace({ name: "Tabs", createdBy: creator, admins: [creator] });
    await open(creator, doomed.companyId);
    const { getDeleteWorkspaceInteractor } = await import("@/core/di");
    const { CustomErrorCode } = await import("@/core/validation/validation.types");
    as(creator);

    const results = await Promise.all([
      getDeleteWorkspaceInteractor().invoke({ companyId: doomed.companyId }),
      getDeleteWorkspaceInteractor().invoke({ companyId: doomed.companyId }),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    const refused = results.find((result) => !result.ok);
    expect(refused ? await codes(refused) : []).toEqual([CustomErrorCode.workspaceChanged]);
    expect(await exists(doomed.companyId)).toBe(false);
    expect(await activeCompany(creator.sessionId)).toBe(home.companyId);

    await expect(remove(creator, doomed.companyId)).resolves.toMatchObject({ ok: false });
  });

  it("deletes nothing when a connected account cannot be disconnected", async () => {
    const creator = await createLogin("channels");
    const doomed = await createWorkspace({ name: "Channels", createdBy: creator, admins: [creator] });
    await open(creator, doomed.companyId);
    await populate(doomed.companyId, creator, doomed.users.get(creator.id) ?? "");
    const { MessagingService } = await import("@/ee/messaging/messaging.service");
    vi.spyOn(MessagingService.prototype, "deleteAccount").mockRejectedValue(new Error("provider unavailable"));
    const { CustomErrorCode } = await import("@/core/validation/validation.types");

    expect(await codes(await remove(creator, doomed.companyId))).toEqual([
      CustomErrorCode.workspaceDeleteChannelsFailed,
    ]);
    expect(await exists(doomed.companyId)).toBe(true);
    expect(await deletingAt(doomed.companyId)).toBeNull();
  });

  it("lets any self-hosted admin delete, without billing checks", async () => {
    const { env } = await import("@/env");
    (env as { APP_MODE: string }).APP_MODE = "self-hosted";
    try {
      const creator = await createLogin("installer");
      const admin = await createLogin("admin");
      const member = await createLogin("member");
      const doomed = await createWorkspace({
        name: "Self-hosted",
        createdBy: creator,
        admins: [creator, admin],
        members: [member],
        subscription: { status: "active" },
      });
      await open(admin, doomed.companyId);
      await open(member, doomed.companyId);
      await startCheckout(doomed.companyId, 45);
      const { SubscriptionService } = await import("@/ee/subscription/subscription.service");
      const listed = vi.spyOn(SubscriptionService.prototype, "listStoreSubscriptionsByEmailOrThrowUnscoped");

      expect(await refusal(member)).toBe("notAdmin");
      expect((await remove(member, doomed.companyId)).ok).toBe(false);
      expect(await refusal(admin)).toBeNull();
      expect((await remove(admin, doomed.companyId)).ok).toBe(true);
      expect(await exists(doomed.companyId)).toBe(false);
      expect(listed).not.toHaveBeenCalled();
    } finally {
      (env as { APP_MODE: string }).APP_MODE = "cloud";
    }
  });
});
