import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";
import { Action, Resource } from "@/generated/prisma";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
}));
vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    DATABASE_URL: process.env.DATABASE_URL,
    BASE_URL: "http://localhost:4000",
    NODE_ENV: "test",
  },
}));

let tenantUser: TenantUser = createMockUser();

vi.mock("@/features/user/user.service", () => ({
  UserService: class {
    getUserOrThrow() {
      return Promise.resolve(tenantUser);
    }

    getActiveUserOrThrow() {
      return Promise.resolve(tenantUser);
    }

    getActiveTenantUserOrThrow() {
      return Promise.resolve(tenantUser);
    }

    hasPermissionForUser() {
      return true;
    }

    hasPermission(resource: Resource, action: Action) {
      return Promise.resolve(
        (tenantUser.role?.permissions ?? []).some((p) => p.resource === resource && p.action === action),
      );
    }

    hasPermissionOrThrow() {
      return Promise.resolve();
    }
  },
}));

const {
  getBillingUsageRepo,
  getFreePlanPauseService,
  getPlanLimitsService,
  getSwapFreePlanSeatInteractor,
  getUpsertWebhookInteractor,
  getUserRepo,
} = await import("@/core/di");
const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const DAY_MS = 86_400_000;
const companies: string[] = [];
const logins: string[] = [];

const ADMIN_PERMISSIONS = [
  ...[Action.create, Action.update, Action.delete, Action.readAll, Action.readOwn].map((action) => ({
    resource: Resource.users,
    action,
  })),
  ...[Action.create, Action.update, Action.delete, Action.readAll, Action.readOwn].map((action) => ({
    resource: Resource.api,
    action,
  })),
].map((permission, index) => ({ id: `admin-${index}`, ...permission }));

type Member = { id: string; email: string };

async function workspace() {
  return runWithoutTenant(async () => {
    const ownerEmail = `owner-${randomUUID()}@example.test`;
    const login = await prisma.authUser.create({
      data: { id: randomUUID(), name: "Alex Morgan", email: ownerEmail },
    });
    logins.push(login.id);
    const company = await prisma.company.create({ data: { name: "Northwind Studio", createdByAuthUserId: login.id } });
    companies.push(company.id);
    await prisma.subscription.create({
      data: {
        companyId: company.id,
        plan: "pro",
        status: "trial",
        trialEndDate: new Date(Date.now() - DAY_MS),
        agentCreditAnchorAt: new Date(),
      },
    });
    const admin = await prisma.userRole.create({
      data: { companyId: company.id, name: "Administrator", isSystemRole: true },
    });
    const memberRole = await prisma.userRole.create({ data: { companyId: company.id, name: "Member" } });
    const create = (name: string, email: string, roleId: string | null, createdAt: Date, status = "active" as const) =>
      prisma.user.create({
        data: { companyId: company.id, roleId, firstName: name, lastName: "Example", email, status, createdAt },
        select: { id: true, email: true },
      });
    const earliestAdmin = await create(
      "Jordan",
      `jordan-${randomUUID()}@example.test`,
      admin.id,
      new Date(Date.now() - 9 * DAY_MS),
    );
    const owner = await create("Alex", ownerEmail, admin.id, new Date(Date.now() - 8 * DAY_MS));
    const member = await create(
      "Sam",
      `sam-${randomUUID()}@example.test`,
      memberRole.id,
      new Date(Date.now() - 7 * DAY_MS),
    );
    const deactivated = await prisma.user.create({
      data: {
        companyId: company.id,
        roleId: memberRole.id,
        firstName: "Riley",
        lastName: "Example",
        email: `riley-${randomUUID()}@example.test`,
        status: "inactive",
      },
      select: { id: true, email: true },
    });
    const pending = await prisma.user.create({
      data: {
        companyId: company.id,
        firstName: "Casey",
        lastName: "Example",
        email: `casey-${randomUUID()}@example.test`,
        status: "pendingAuthorization",
      },
      select: { id: true },
    });
    await prisma.inviteToken.create({
      data: {
        companyId: company.id,
        createdById: owner.id,
        token: randomUUID(),
        expiresAt: new Date(Date.now() + DAY_MS),
      },
    });
    const routine = await prisma.routine.create({
      data: {
        companyId: company.id,
        ownerUserId: member.id,
        name: "Weekly pipeline digest",
        prompt: "Summarise the open deals.",
        triggerKind: "schedule",
        cronExpression: "0 9 * * 1",
        timezone: "Europe/Berlin",
        nextRunAt: new Date(Date.now() + DAY_MS),
      },
      select: { id: true },
    });
    const asTenant = (user: Member, roleId: string, isSystemRole: boolean) =>
      createMockUser({
        id: user.id,
        email: user.email,
        companyId: company.id,
        roleId,
        role: {
          id: roleId,
          name: isSystemRole ? "Administrator" : "Member",
          description: null,
          isSystemRole,
          createdAt: new Date(0),
          updatedAt: new Date(0),
          permissions: ADMIN_PERMISSIONS,
        },
      });
    return {
      companyId: company.id,
      adminRoleId: admin.id,
      memberRoleId: memberRole.id,
      earliestAdmin,
      owner,
      member,
      deactivated,
      pending,
      routine,
      asTenant,
    };
  });
}

const users = (companyId: string) =>
  runWithoutTenant(() =>
    prisma.user.findMany({
      where: { companyId },
      select: { id: true, status: true, leftAt: true, pausedByPlanAt: true, planPauseNoticeSentAt: true },
    }),
  );

function failureCode(result: unknown) {
  const outcome = result as { ok: boolean; error?: { issues: Array<{ params?: Record<string, unknown> }> } };
  return outcome.ok ? null : outcome.error?.issues[0]?.params?.error;
}

describeDatabase("Free plan pauses", { timeout: 120_000 }, () => {
  afterAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.company.deleteMany({ where: { id: { in: companies } } });
      await prisma.authUser.deleteMany({ where: { id: { in: logins } } });
    });
  });

  it("keeps the owner, pauses the other members, ends join requests and invitations and pauses routines", async () => {
    const w = await workspace();
    const repo = getUserRepo();
    const now = new Date();

    expect(await runWithoutTenant(() => repo.findWorkspacesOverFreePlanUnscoped(now, 1))).toContain(w.companyId);

    expect(await runWithoutTenant(() => getFreePlanPauseService().syncUnscoped(w.companyId, now))).toEqual({
      paused: 2,
      resumed: 0,
      routinesPaused: 1,
      routinesResumed: 0,
    });

    const after = new Map((await users(w.companyId)).map((user) => [user.id, user]));
    expect(after.get(w.owner.id)).toMatchObject({ status: "active", pausedByPlanAt: null });
    for (const id of [w.earliestAdmin.id, w.member.id])
      expect(after.get(id)).toMatchObject({ status: "inactive", planPauseNoticeSentAt: null });
    expect(after.get(w.earliestAdmin.id)?.pausedByPlanAt).toBeInstanceOf(Date);
    expect(after.get(w.deactivated.id)).toMatchObject({ status: "inactive", pausedByPlanAt: null });
    expect(after.get(w.pending.id)?.leftAt).toBeInstanceOf(Date);

    const state = await runWithoutTenant(async () => ({
      tokens: await prisma.inviteToken.count({ where: { companyId: w.companyId } }),
      routine: await prisma.routine.findUniqueOrThrow({ where: { id: w.routine.id } }),
    }));
    expect(state.tokens).toBe(0);
    expect(state.routine).toMatchObject({ enabled: false, disabledReason: "planPaused", nextRunAt: null });
    expect(state.routine.pausedByPlanAt).toBeInstanceOf(Date);

    expect(await getPlanLimitsService().snapshot(w.companyId)).toMatchObject({
      plan: "free",
      usage: { members: 1, pausedMembers: 2 },
    });
    expect(await runWithoutTenant(() => repo.findWorkspacesOverFreePlanUnscoped(now, 1))).not.toContain(w.companyId);
    expect(await runWithoutTenant(() => getFreePlanPauseService().syncUnscoped(w.companyId, now))).toMatchObject({
      paused: 0,
      routinesPaused: 0,
    });

    const recipients = (await runWithoutTenant(() => repo.findPauseNoticeRecipientsUnscoped(500))).filter(
      (recipient) => recipient.companyId === w.companyId,
    );
    expect(recipients.map((recipient) => recipient.id).sort()).toEqual([w.earliestAdmin.id, w.member.id].sort());
    expect(recipients[0]?.workspaceName).toBe("Northwind Studio");
    expect(await runWithoutTenant(() => repo.claimPauseNoticeUnscoped(w.member.id, now))).toBe(true);
    expect(await runWithoutTenant(() => repo.claimPauseNoticeUnscoped(w.member.id, now))).toBe(false);
    expect(await runWithoutTenant(() => repo.findActiveKeeperNameUnscoped(w.companyId))).toBe("Alex Example");
  });

  it("gives an expired former customer's workspace, where nobody is active, its owner back on Free", async () => {
    const w = await workspace();
    const repo = getUserRepo();
    const now = new Date();
    await runWithoutTenant(async () => {
      await prisma.subscription.update({
        where: { companyId: w.companyId },
        data: { plan: "starter", status: "expired", trialEndDate: new Date(Date.now() - 90 * DAY_MS) },
      });
      await prisma.user.updateMany({
        where: { companyId: w.companyId, status: "active" },
        data: { status: "inactive" },
      });
    });

    expect(await runWithoutTenant(() => repo.findWorkspacesOverFreePlanUnscoped(now, 1))).toContain(w.companyId);
    expect(await runWithoutTenant(() => getFreePlanPauseService().syncUnscoped(w.companyId, now))).toMatchObject({
      paused: 0,
      resumed: 1,
    });

    const after = new Map((await users(w.companyId)).map((user) => [user.id, user]));
    expect(after.get(w.owner.id)).toMatchObject({ status: "active", pausedByPlanAt: null });
    for (const id of [w.earliestAdmin.id, w.member.id, w.deactivated.id])
      expect(after.get(id)).toMatchObject({ status: "inactive" });
    expect(await runWithoutTenant(() => repo.findWorkspacesWithPlanPausesUnscoped(now))).not.toContain(w.companyId);
  });

  it("does not bill or count plan-paused members as seats", async () => {
    const w = await workspace();
    await runWithoutTenant(() => getBillingUsageRepo().recordSeats(w.companyId, "sweep"));
    await runWithoutTenant(() => getFreePlanPauseService().syncUnscoped(w.companyId, new Date()));

    expect(await runWithoutTenant(() => getUserRepo().countActiveMembersUnscoped(w.companyId))).toBe(1);
    expect(await getPlanLimitsService().admitMembers(1, w.companyId)).toMatchObject({ limit: 1 });
    const openSeats = await runWithoutTenant(() =>
      prisma.billingUsageInterval.findMany({
        where: { companyId: w.companyId, kind: "seat", endedAt: null },
        select: { subjectId: true },
      }),
    );
    expect(openSeats.map((seat) => seat.subjectId)).toEqual([w.owner.id]);
  });

  it("lets an admin hand the active seat to a paused admin and refuses a target without the admin role", async () => {
    const w = await workspace();
    await runWithoutTenant(() => getFreePlanPauseService().syncUnscoped(w.companyId, new Date()));
    tenantUser = w.asTenant(w.owner, w.adminRoleId, true);

    expect(failureCode(await getSwapFreePlanSeatInteractor().invoke({ userId: w.member.id }))).toBe(
      "planSeatSwapTargetNotAdmin",
    );

    tenantUser = w.asTenant(w.member, w.memberRoleId, false);
    expect(failureCode(await getSwapFreePlanSeatInteractor().invoke({ userId: w.earliestAdmin.id }))).toBe(
      "planSeatSwapRequiresAdmin",
    );

    tenantUser = w.asTenant(w.owner, w.adminRoleId, true);
    const swapped = await getSwapFreePlanSeatInteractor().invoke({ userId: w.earliestAdmin.id });
    expect(swapped).toMatchObject({
      ok: true,
      data: { activeUserId: w.earliestAdmin.id, pausedUserIds: [w.owner.id] },
    });

    const after = new Map((await users(w.companyId)).map((user) => [user.id, user]));
    expect(after.get(w.earliestAdmin.id)).toMatchObject({ status: "active", pausedByPlanAt: null });
    expect(after.get(w.owner.id)).toMatchObject({ status: "inactive" });
    expect(after.get(w.owner.id)?.pausedByPlanAt).toBeInstanceOf(Date);
    expect(after.get(w.owner.id)?.planPauseNoticeSentAt).toBeInstanceOf(Date);
    expect(await runWithoutTenant(() => getUserRepo().countActiveMembersUnscoped(w.companyId))).toBe(1);
  });

  it("refuses to create a webhook on Free and stops delivery until a paid plan", async () => {
    const w = await workspace();
    tenantUser = w.asTenant(w.owner, w.adminRoleId, true);

    const refused = await getUpsertWebhookInteractor().invoke({
      url: "https://hooks.example.com/customermates",
      events: ["record.created"],
    });
    expect(failureCode(refused)).toBe("planWebhooksNotIncluded");
    expect(await getPlanLimitsService().deliversWebhooks(w.companyId)).toBe(false);

    await runWithoutTenant(() =>
      prisma.subscription.update({ where: { companyId: w.companyId }, data: { status: "active", plan: "starter" } }),
    );
    expect(await getPlanLimitsService().deliversWebhooks(w.companyId)).toBe(true);
  });

  it("brings plan-paused members and routines back on any paid plan and leaves admin deactivations alone", async () => {
    const w = await workspace();
    await runWithoutTenant(() => getFreePlanPauseService().syncUnscoped(w.companyId, new Date()));
    await runWithoutTenant(() =>
      prisma.subscription.update({ where: { companyId: w.companyId }, data: { status: "active", plan: "starter" } }),
    );

    expect(await runWithoutTenant(() => getUserRepo().findWorkspacesWithPlanPausesUnscoped(new Date()))).toContain(
      w.companyId,
    );
    expect(await runWithoutTenant(() => getFreePlanPauseService().syncUnscoped(w.companyId, new Date()))).toEqual({
      paused: 0,
      resumed: 2,
      routinesPaused: 0,
      routinesResumed: 1,
    });

    const after = new Map((await users(w.companyId)).map((user) => [user.id, user]));
    for (const id of [w.owner.id, w.earliestAdmin.id, w.member.id])
      expect(after.get(id)).toMatchObject({ status: "active", pausedByPlanAt: null, planPauseNoticeSentAt: null });
    expect(after.get(w.deactivated.id)).toMatchObject({ status: "inactive", pausedByPlanAt: null });
    const routine = await runWithoutTenant(() => prisma.routine.findUniqueOrThrow({ where: { id: w.routine.id } }));
    expect(routine).toMatchObject({ enabled: true, disabledReason: null, pausedByPlanAt: null });
    expect(routine.nextRunAt).toBeInstanceOf(Date);
    expect(await runWithoutTenant(() => getUserRepo().findWorkspacesWithPlanPausesUnscoped(new Date()))).not.toContain(
      w.companyId,
    );
  });
});
