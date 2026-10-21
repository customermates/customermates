import { prismaAgentChatRepoDependencies } from "@/tests/helpers/prisma-agent-chat-repo";
import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import type { Filter } from "@/core/base/base-get.schema";
import type { OperatorActor } from "@/core/decorators/operator-context";
import type { InteractiveSession } from "@/features/auth/auth.service";
import type { OperatorUserSummaryDto } from "../operator.schema";
import type { OperatorRefusal } from "../operator.repo";
import type { AppPrismaClient } from "@/prisma/db";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { runWithOperator } from "@/core/decorators/operator-context";
import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { transactionStorage } from "@/core/decorators/transaction-context";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    DATABASE_URL: process.env.DATABASE_URL,
    BASE_URL: "http://localhost:4000",
    HOSTED_AI_OPERATOR_CONTROLS_ENABLED: true,
    NODE_ENV: "test",
  },
}));

import { PrismaAgentChatRepo } from "@/ee/agent-chat/prisma-agent-chat.repository";
import { PrismaOperatorAccessRepo } from "../prisma-operator-access.repository";
import { PrismaOperatorRiskSummaryRepo } from "../prisma-operator-risk-summary.repository";
import { PrismaOperatorUsersRepo } from "../prisma-operator-users.repository";
import { PrismaOperatorWorkspacesRepo } from "../prisma-operator-workspaces.repository";
import { resolveWorkspaceLabels } from "../operator-list-filters";

const { prisma } = await import("@/prisma/db");
const { createTestOperatorRepo } = await import("@/tests/helpers/prisma-operator-repo");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];
const authUserIds: string[] = [];
const clientIds: string[] = [];
const actorIds: string[] = [];
const DAY = 24 * 60 * 60 * 1000;

class RollbackSnapshotTest extends Error {}

type Plan = "starter" | "pro" | "business" | "enterprise";
type SubscriptionStatus = "trial" | "active" | "cancelled" | "expired" | "pastDue" | "unPaid";
type MemberStatus = "active" | "inactive" | "pendingAuthorization";

const inFilter = (field: string, value: string[]): Filter => ({ field, operator: FilterOperatorKey.in, value });

function operatorActor(): OperatorActor {
  const userId = `operator-${randomUUID()}`;
  actorIds.push(userId);
  return {
    authUserId: `auth-${randomUUID()}`,
    userId,
    companyId: `company-${randomUUID()}`,
    email: `${randomUUID()}@example.invalid`,
  };
}

function assertAdmitted<T>(result: T | OperatorRefusal): asserts result is T {
  if (typeof result === "string") throw new Error(`Expected an admitted operator write, got "${result}".`);
}

async function createWorkspace(
  client: AppPrismaClient,
  args: { name?: string | null; subscription?: { plan: Plan; status: SubscriptionStatus } | null } = {},
) {
  const companyId = randomUUID();
  companyIds.push(companyId);
  await client.company.create({ data: { id: companyId, name: args.name ?? null } });
  const terms =
    args.subscription === undefined ? { plan: "pro" as const, status: "active" as const } : args.subscription;
  if (terms) await client.subscription.create({ data: { companyId, ...terms, quantity: 1 } });
  return companyId;
}

async function createLogin(
  client: AppPrismaClient,
  email: string,
  args: { lastUsedCompanyId?: string | null; emailVerified?: boolean; isPlatformOperator?: boolean } = {},
) {
  const authUserId = randomUUID();
  authUserIds.push(authUserId);
  await client.authUser.create({
    data: {
      id: authUserId,
      companyId: args.lastUsedCompanyId ?? null,
      email,
      name: "Shared Login",
      emailVerified: args.emailVerified ?? true,
      isPlatformOperator: args.isPlatformOperator ?? false,
    },
  });
  return authUserId;
}

async function createMembership(
  client: AppPrismaClient,
  companyId: string,
  email: string,
  args: { status?: MemberStatus; lastActiveAt?: Date; leftAt?: Date } = {},
) {
  const user = await client.user.create({
    data: {
      companyId,
      email,
      firstName: "Shared",
      lastName: "Login",
      status: args.status ?? "active",
      lastActiveAt: args.lastActiveAt ?? null,
      leftAt: args.leftAt ?? null,
    },
  });
  return user.id;
}

async function createSession(authUserId: string, activeCompanyId: string | null = null) {
  const sessionId = randomUUID();
  await runWithoutTenant(() =>
    prisma.authSession.create({
      data: {
        id: sessionId,
        token: `token-${randomUUID()}`,
        userId: authUserId,
        activeCompanyId,
        expiresAt: new Date(Date.now() + DAY),
      },
    }),
  );
  return sessionId;
}

async function createApiKey(authUserId: string, companyId: string) {
  const id = randomUUID();
  await runWithoutTenant(() =>
    prisma.apikey.create({
      data: {
        id,
        key: `hashed-${randomUUID()}`,
        referenceId: authUserId,
        companyId,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    }),
  );
  return id;
}

async function createOauthToken(clientId: string, authUserId: string, companyId: string) {
  const id = randomUUID();
  await runWithoutTenant(() =>
    prisma.oauthAccessToken.create({
      data: {
        id,
        accessToken: `access-${randomUUID()}`,
        refreshToken: `refresh-${randomUUID()}`,
        accessTokenExpiresAt: new Date(Date.now() + DAY),
        refreshTokenExpiresAt: new Date(Date.now() + 30 * DAY),
        clientId,
        userId: authUserId,
        companyId,
        scopes: "openid",
      },
    }),
  );
  return id;
}

async function inRolledBackSnapshot(work: (client: AppPrismaClient) => Promise<void>) {
  try {
    await runWithOperator(operatorActor(), () =>
      runWithoutTenant(() =>
        prisma.$transaction(
          (tx) => {
            const client = tx as unknown as AppPrismaClient;
            return transactionStorage.run({ client, afterCommit: [], eventWakeups: new Set() }, async () => {
              await work(client);
              throw new RollbackSnapshotTest();
            });
          },
          { isolationLevel: "RepeatableRead", timeout: 60_000 },
        ),
      ),
    );
  } catch (error) {
    if (!(error instanceof RollbackSnapshotTest)) throw error;
  }
}

function summaryDelta(before: OperatorUserSummaryDto, after: OperatorUserSummaryDto) {
  const difference = (a: Record<string, number>, b: Record<string, number>) =>
    Object.fromEntries(Object.keys(b).map((key) => [key, b[key] - (a[key] ?? 0)]));

  return {
    totalUsers: after.totalUsers - before.totalUsers,
    totalCompanies: after.totalCompanies - before.totalCompanies,
    platformOperators: after.platformOperators - before.platformOperators,
    verifiedAuthUsers: after.verifiedAuthUsers - before.verifiedAuthUsers,
    byStatus: difference(before.byStatus, after.byStatus),
    byPlan: difference(before.byPlan, after.byPlan),
    bySubscriptionStatus: difference(before.bySubscriptionStatus, after.bySubscriptionStatus),
  };
}

afterAll(async () => {
  await runWithoutTenant(async () => {
    await prisma.operatorAuditEvent.deleteMany({ where: { actorUserId: { in: actorIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.authUser.deleteMany({ where: { id: { in: authUserIds } } });
    await prisma.oauthApplication.deleteMany({ where: { clientId: { in: clientIds } } });
  });
  await prisma.$disconnect();
});

describeDatabase("operator console with logins in several workspaces", { timeout: 120_000 }, () => {
  it("authorizes an operator login from its most recently used active membership in any workspace", async () => {
    const email = `multi-operator-${randomUUID()}@example.invalid`;
    const { operatorWorkspace, ordinaryWorkspace, authUserId, olderMembership, recentMembership } =
      await runWithoutTenant(async () => {
        const operatorWorkspace = await createWorkspace(prisma, { name: "Customermates Staff" });
        const ordinaryWorkspace = await createWorkspace(prisma, { name: "Bergmann Steuern" });
        const authUserId = await createLogin(prisma, email, {
          lastUsedCompanyId: ordinaryWorkspace,
          isPlatformOperator: true,
        });
        const olderMembership = await createMembership(prisma, operatorWorkspace, email, {
          lastActiveAt: new Date(Date.now() - 3 * DAY),
        });
        const recentMembership = await createMembership(prisma, ordinaryWorkspace, email, {
          lastActiveAt: new Date(),
        });
        return { operatorWorkspace, ordinaryWorkspace, authUserId, olderMembership, recentMembership };
      });
    const sessionId = await createSession(authUserId, ordinaryWorkspace);
    const session = { session: { id: sessionId }, user: { id: authUserId, email } } as InteractiveSession;
    const repo = new PrismaOperatorAccessRepo();

    await expect(repo.findAuthorizedActorUnscoped(session)).resolves.toEqual({
      authUserId,
      userId: recentMembership,
      companyId: ordinaryWorkspace,
      email,
    });

    await runWithoutTenant(() =>
      prisma.user.update({ where: { id: recentMembership }, data: { status: "inactive", leftAt: new Date() } }),
    );
    await expect(repo.findAuthorizedActorUnscoped(session)).resolves.toMatchObject({
      userId: olderMembership,
      companyId: operatorWorkspace,
    });

    await runWithoutTenant(() =>
      prisma.authUser.update({ where: { id: authUserId }, data: { isPlatformOperator: false } }),
    );
    await expect(repo.findAuthorizedActorUnscoped(session)).resolves.toBeNull();

    await runWithoutTenant(async () => {
      await prisma.authUser.update({ where: { id: authUserId }, data: { isPlatformOperator: true } });
      await prisma.user.update({ where: { id: olderMembership }, data: { status: "inactive" } });
    });
    await expect(repo.findAuthorizedActorUnscoped(session)).resolves.toBeNull();
  });

  it("deletes a workspace but keeps a shared login with its other memberships and the credentials bound to them", async () => {
    const marker = randomUUID().slice(0, 8);
    const label = `Doomed Workspace ${marker}`;
    const sharedEmail = `shared-${marker}@doomed-${marker}.invalid`;
    const soleEmail = `sole-${marker}@doomed-${marker}.invalid`;
    const clientId = `client-${randomUUID()}`;
    clientIds.push(clientId);

    const fixture = await runWithoutTenant(async () => {
      const doomed = await createWorkspace(prisma, { name: label });
      const kept = await createWorkspace(prisma, { name: `Kept Workspace ${marker}` });
      const shared = await createLogin(prisma, sharedEmail, { lastUsedCompanyId: doomed });
      const sole = await createLogin(prisma, soleEmail, { lastUsedCompanyId: doomed });
      await createMembership(prisma, doomed, sharedEmail);
      await createMembership(prisma, doomed, soleEmail);
      const keptMembership = await createMembership(prisma, kept, sharedEmail);
      await prisma.oauthApplication.create({
        data: { id: randomUUID(), name: "Shared login client", clientId, redirectUrls: "", type: "public" },
      });
      await prisma.oauthConsent.create({
        data: { id: randomUUID(), clientId, userId: shared, scopes: "openid", consentGiven: true },
      });
      for (const identifier of [sharedEmail, soleEmail]) {
        await prisma.authVerification.create({
          data: {
            id: randomUUID(),
            identifier,
            value: `pending-${randomUUID()}`,
            expiresAt: new Date(Date.now() + DAY),
          },
        });
      }
      return { doomed, kept, shared, sole, keptMembership };
    });
    const credentials = {
      sharedDoomedKey: await createApiKey(fixture.shared, fixture.doomed),
      sharedKeptKey: await createApiKey(fixture.shared, fixture.kept),
      soleKey: await createApiKey(fixture.sole, fixture.doomed),
      sharedDoomedToken: await createOauthToken(clientId, fixture.shared, fixture.doomed),
      sharedKeptToken: await createOauthToken(clientId, fixture.shared, fixture.kept),
      doomedSession: await createSession(fixture.shared, fixture.doomed),
      keptSession: await createSession(fixture.shared, fixture.kept),
    };
    const repo = createTestOperatorRepo();

    await expect(
      runWithOperator(operatorActor(), () =>
        repo.deleteWorkspaceUnscoped({
          companyId: fixture.doomed,
          confirmWorkspaceLabel: `doomed-${marker}.invalid`,
          reason: "Domain label",
        }),
      ),
    ).resolves.toBe("conflict");

    const result = await runWithOperator(operatorActor(), () =>
      repo.deleteWorkspaceUnscoped({ companyId: fixture.doomed, confirmWorkspaceLabel: label, reason: "Shared login" }),
    );
    assertAdmitted(result);
    expect(result).toMatchObject({ workspaceLabel: label, deletedMemberCount: 2, deletedAuthIdentityCount: 1 });

    await runWithoutTenant(async () => {
      expect(await prisma.company.count({ where: { id: fixture.doomed } })).toBe(0);
      expect(await prisma.authUser.findUnique({ where: { id: fixture.shared }, select: { companyId: true } })).toEqual({
        companyId: null,
      });
      expect(await prisma.authUser.count({ where: { id: fixture.sole } })).toBe(0);
      expect(
        await prisma.user.findUnique({
          where: { id: fixture.keptMembership },
          select: { companyId: true, status: true },
        }),
      ).toEqual({ companyId: fixture.kept, status: "active" });

      const keys = await prisma.apikey.findMany({
        where: { id: { in: [credentials.sharedDoomedKey, credentials.sharedKeptKey, credentials.soleKey] } },
        select: { id: true },
      });
      expect(keys.map((key) => key.id)).toEqual([credentials.sharedKeptKey]);

      const tokens = await prisma.oauthAccessToken.findMany({
        where: { id: { in: [credentials.sharedDoomedToken, credentials.sharedKeptToken] } },
        select: { id: true, companyId: true },
      });
      expect(tokens).toEqual([{ id: credentials.sharedKeptToken, companyId: fixture.kept }]);

      const sessions = await prisma.authSession.findMany({
        where: { id: { in: [credentials.doomedSession, credentials.keptSession] } },
        select: { id: true, activeCompanyId: true },
      });
      expect(sessions).toEqual(
        expect.arrayContaining([
          { id: credentials.doomedSession, activeCompanyId: fixture.doomed },
          { id: credentials.keptSession, activeCompanyId: fixture.kept },
        ]),
      );
      expect(sessions).toHaveLength(2);

      expect(await prisma.oauthConsent.count({ where: { userId: fixture.shared, clientId } })).toBe(1);
      expect(await prisma.authVerification.count({ where: { identifier: sharedEmail } })).toBe(1);
      expect(await prisma.authVerification.count({ where: { identifier: soleEmail } })).toBe(0);
    });
  });

  it("counts each login once in the platform user summary however many workspaces it belongs to", async () => {
    const marker = randomUUID().slice(0, 8);
    const emails = [1, 2, 3, 4].map((index) => `summary-${index}-${marker}@example.invalid`);
    const repo = createTestOperatorRepo();
    let delta: ReturnType<typeof summaryDelta> | null = null;

    await inRolledBackSnapshot(async (client) => {
      const before = await repo.getUserSummaryUnscoped();

      const pro = await createWorkspace(client, { subscription: { plan: "pro", status: "active" } });
      const business = await createWorkspace(client, { subscription: { plan: "business", status: "trial" } });
      const unsubscribed = await createWorkspace(client, { subscription: null });
      await createLogin(client, emails[0], { lastUsedCompanyId: pro });
      await createLogin(client, emails[1], { lastUsedCompanyId: business });
      await createLogin(client, emails[2], { emailVerified: false });
      await createLogin(client, emails[3], { isPlatformOperator: true });
      await createMembership(client, pro, emails[0]);
      await createMembership(client, pro, emails[1]);
      await createMembership(client, pro, emails[2], { status: "pendingAuthorization" });
      await createMembership(client, business, emails[0]);
      await createMembership(client, business, emails[1].toUpperCase(), { status: "inactive", leftAt: new Date() });
      await createMembership(client, business, emails[3]);
      await createMembership(client, unsubscribed, emails[0]);

      delta = summaryDelta(before, await repo.getUserSummaryUnscoped());
    });

    expect(delta).toEqual({
      totalUsers: 4,
      totalCompanies: 3,
      platformOperators: 1,
      verifiedAuthUsers: 3,
      byStatus: { active: 3, inactive: 1, pendingAuthorization: 1 },
      byPlan: { starter: 0, pro: 3, business: 3, max: 0, enterprise: 0, missing: 1 },
      bySubscriptionStatus: {
        trial: 3,
        active: 3,
        cancelled: 0,
        expired: 0,
        pastDue: 0,
        unPaid: 0,
        missing: 1,
      },
    });
  });

  it("counts a login once among active and new users of the risk summary", async () => {
    const marker = randomUUID().slice(0, 8);
    const [returning, joined, idle] = ["returning", "joined", "idle"].map(
      (kind) => `risk-${kind}-${marker}@example.invalid`,
    );
    const longAgo = new Date(Date.now() - 60 * DAY);
    const risk = new PrismaOperatorRiskSummaryRepo();
    let delta: Record<string, number> | null = null;

    await inRolledBackSnapshot(async (client) => {
      const before = await risk.getRiskSummaryUnscoped();

      const first = await createWorkspace(client);
      const second = await createWorkspace(client);
      const third = await createWorkspace(client);
      await createMembership(client, first, joined, { lastActiveAt: new Date() });
      await createMembership(client, second, joined, { lastActiveAt: new Date() });
      const original = await createMembership(client, first, returning, { lastActiveAt: new Date() });
      await client.user.update({ where: { id: original }, data: { createdAt: longAgo } });
      await createMembership(client, third, returning, { lastActiveAt: new Date() });
      const dormant = await createMembership(client, first, idle, { lastActiveAt: new Date(Date.now() - 10 * DAY) });
      await client.user.update({ where: { id: dormant }, data: { createdAt: longAgo } });

      const after = await risk.getRiskSummaryUnscoped();
      delta = {
        activeUsersLastSevenDays: after.activeUsersLastSevenDays - before.activeUsersLastSevenDays,
        newUsersLastThirtyDays: after.newUsersLastThirtyDays - before.newUsersLastThirtyDays,
        newWorkspacesLastThirtyDays: after.newWorkspacesLastThirtyDays - before.newWorkspacesLastThirtyDays,
      };
    });

    expect(delta).toEqual({ activeUsersLastSevenDays: 2, newUsersLastThirtyDays: 1, newWorkspacesLastThirtyDays: 3 });
  });

  it("labels a workspace by its name, otherwise its owner email and short id, the same in every list", async () => {
    const marker = randomUUID().slice(0, 8);
    const nameMarker = randomUUID().slice(0, 8);
    const publicDomain = `public-${marker}.invalid`;
    const shared = `owner-${randomUUID()}@${publicDomain}`;
    const other = `owner-${randomUUID()}@${publicDomain}`;
    const ids = await runWithoutTenant(async () => {
      const named = await createWorkspace(prisma, { name: `Steuerkanzlei ${nameMarker}` });
      const first = await createWorkspace(prisma, { name: null });
      const second = await createWorkspace(prisma, { name: null });
      const neighbour = await createWorkspace(prisma, { name: null });
      const empty = await createWorkspace(prisma, { name: null });
      await createMembership(prisma, named, `owner-${randomUUID()}@named-${marker}.invalid`);
      await createMembership(prisma, first, `former-${randomUUID()}@${publicDomain}`, { status: "inactive" });
      await createMembership(prisma, first, shared);
      await createMembership(prisma, second, shared);
      await createMembership(prisma, neighbour, other);
      return { named, first, second, neighbour, empty };
    });
    const expected = {
      [ids.named]: `Steuerkanzlei ${nameMarker}`,
      [ids.first]: `${shared} · ${ids.first.slice(0, 8)}`,
      [ids.second]: `${shared} · ${ids.second.slice(0, 8)}`,
      [ids.neighbour]: `${other} · ${ids.neighbour.slice(0, 8)}`,
      [ids.empty]: ids.empty.slice(0, 8),
    };
    const scoped = inFilter(FilterFieldKey.workspaceId, Object.values(ids));

    const labels = await runWithoutTenant(() => resolveWorkspaceLabels(prisma, Object.values(ids)));
    expect(Object.fromEntries(labels)).toEqual(expected);
    expect(new Set(labels.values()).size).toBe(5);

    const workspaces = new PrismaOperatorWorkspacesRepo();
    const rows = await runWithoutTenant(() => workspaces.getItems({ filters: [scoped] }));
    expect(Object.fromEntries(rows.map((row) => [row.id, row.workspaceLabel]))).toEqual(expected);
    expect(rows.find((row) => row.id === ids.first)?.ownerEmail).toBe(shared);

    const searched = await runWithoutTenant(() => workspaces.getItems({ filters: [scoped], searchTerm: nameMarker }));
    expect(searched.map((row) => row.id)).toEqual([ids.named]);

    const users = new PrismaOperatorUsersRepo(new PrismaAgentChatRepo(...prismaAgentChatRepoDependencies()));
    const members = await runWithoutTenant(() => users.getItems({ filters: [scoped] }));
    expect(members).toHaveLength(5);
    for (const member of members) expect(member.workspaceLabel).toBe(expected[member.companyId]);
  });
});
