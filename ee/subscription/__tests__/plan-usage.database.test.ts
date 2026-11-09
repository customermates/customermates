import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    DATABASE_URL: process.env.DATABASE_URL,
    BASE_URL: "http://localhost:4000",
    NODE_ENV: "test",
  },
}));
vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve("en") }));

const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { PrismaPlanUsageRepo } = await import("../prisma-plan-usage.repository");
const { PlanLimitsService } = await import("../plan-limits.service");
const { apiDayWindowStart } = await import("../api-rate-limit.service");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const DAY_MS = 86_400_000;
const companies: string[] = [];
const applications: string[] = [];

async function company(subscription: { status: "trial" | "active"; trialEndDate: Date | null }) {
  const created = await prisma.company.create({ data: {} });
  companies.push(created.id);
  await prisma.subscription.create({
    data: { companyId: created.id, plan: "pro", agentCreditAnchorAt: new Date(), ...subscription },
  });
  return created.id;
}

async function member(companyId: string, status: "active" | "inactive" | "pendingAuthorization" = "active") {
  return prisma.user.create({
    data: {
      companyId,
      firstName: "Member",
      lastName: "Example",
      email: `${randomUUID()}@example.test`,
      status,
    },
    select: { id: true },
  });
}

async function account(
  companyId: string,
  userId: string,
  overrides: { shared?: boolean; status?: "ok" | "deleted" } = {},
) {
  return prisma.connectedAccount.create({
    data: {
      companyId,
      userId,
      unipileAccountId: randomUUID(),
      provider: "linkedin",
      status: overrides.status ?? "ok",
      hasMessaging: true,
      shared: overrides.shared ?? false,
    },
    select: { id: true },
  });
}

async function message(
  companyId: string,
  connectedAccountId: string,
  overrides: { isDraft: boolean; isDeleted?: boolean },
) {
  const thread = await prisma.messagingThread.create({
    data: { companyId, connectedAccountId, unipileThreadId: randomUUID(), provider: "linkedin" },
    select: { id: true },
  });
  await prisma.messagingMessage.create({
    data: {
      companyId,
      messagingThreadId: thread.id,
      connectedAccountId,
      unipileMessageId: randomUUID(),
      provider: "linkedin",
      direction: "outbound",
      origin: "unipile",
      sender: {},
      sentAt: new Date(),
      isDraft: overrides.isDraft,
      isDeleted: overrides.isDeleted ?? false,
    },
  });
}

describeDatabase("plan usage reads", () => {
  afterAll(async () => {
    await runWithoutTenant(async () => {
      await prisma.oauthApplication.deleteMany({ where: { id: { in: applications } } });
      await prisma.company.deleteMany({ where: { id: { in: companies } } });
    });
  });

  it("reads today's API calls from this workspace's day window and from no other row", async () => {
    await runWithoutTenant(async () => {
      const repo = new PrismaPlanUsageRepo();
      const mine = await company({ status: "trial", trialEndDate: new Date(Date.now() - DAY_MS) });
      const other = await company({ status: "trial", trialEndDate: new Date(Date.now() - DAY_MS) });
      const today = apiDayWindowStart(new Date());
      const yesterday = new Date(today.getTime() - DAY_MS);
      await prisma.apiRateLimitWindow.createMany({
        data: [
          { companyId: mine, window: "day", windowStart: today, count: 41 },
          { companyId: mine, window: "day", windowStart: yesterday, count: 190 },
          { companyId: mine, window: "minute", windowStart: today, count: 9 },
          { companyId: other, window: "day", windowStart: today, count: 7 },
        ],
      });

      expect(await repo.countApiRequestsOnDayUnscoped(mine, today)).toBe(41);
      expect(await repo.countApiRequestsOnDayUnscoped(other, today)).toBe(7);
      expect(await repo.countApiRequestsOnDayUnscoped(mine, yesterday)).toBe(190);
      expect(
        await repo.countApiRequestsOnDayUnscoped(await company({ status: "trial", trialEndDate: null }), today),
      ).toBe(0);
    });
  });

  it("puts today's API calls into the Free snapshot and caps them at the day's limit", async () => {
    await runWithoutTenant(async () => {
      const free = await company({ status: "trial", trialEndDate: new Date(Date.now() - DAY_MS) });
      const service = new PlanLimitsService(new PrismaPlanUsageRepo(), "cloud", () => free);
      const today = apiDayWindowStart(new Date());
      await prisma.apiRateLimitWindow.create({
        data: { companyId: free, window: "day", windowStart: today, count: 12 },
      });

      expect((await service.snapshot(free)).usage.apiRequestsToday).toBe(12);

      await prisma.apiRateLimitWindow.update({
        where: { companyId_window_windowStart: { companyId: free, window: "day", windowStart: today } },
        data: { count: 260 },
      });

      expect((await service.snapshot(free)).usage.apiRequestsToday).toBe(200);
    });
  });

  it("reads what a workspace uses and leaves out what the plan would not count", async () => {
    await runWithoutTenant(async () => {
      const repo = new PrismaPlanUsageRepo();
      const id = await company({ status: "trial", trialEndDate: new Date(Date.now() + 3 * DAY_MS) });
      const other = await company({ status: "trial", trialEndDate: new Date(Date.now() + 3 * DAY_MS) });
      const owner = await member(id);
      const teammate = await member(id);
      await member(id, "inactive");
      await member(id, "pendingAuthorization");

      const linkedin = await account(id, owner.id, { shared: true });
      await account(id, owner.id);
      await account(id, teammate.id);
      const removed = await account(id, teammate.id, { status: "deleted" });
      await message(id, linkedin.id, { isDraft: true });
      await message(id, linkedin.id, { isDraft: true, isDeleted: true });
      await message(id, linkedin.id, { isDraft: false });
      await message(id, removed.id, { isDraft: true });

      await prisma.routine.createMany({
        data: [
          { companyId: id, ownerUserId: owner.id, name: "A", prompt: "p", triggerKind: "schedule", enabled: true },
          { companyId: id, ownerUserId: owner.id, name: "B", prompt: "p", triggerKind: "event", enabled: true },
          { companyId: id, ownerUserId: owner.id, name: "C", prompt: "p", triggerKind: "event", enabled: false },
          { companyId: id, ownerUserId: teammate.id, name: "D", prompt: "p", triggerKind: "event", enabled: true },
          {
            companyId: id,
            ownerUserId: teammate.id,
            name: "E",
            prompt: "p",
            triggerKind: "event",
            deletedAt: new Date(),
          },
        ],
      });
      await prisma.webhook.createMany({
        data: [
          { companyId: id, url: "https://example.test/a", events: ["record.created"], enabled: true },
          { companyId: id, url: "https://example.test/b", events: ["record.created"], enabled: false },
        ],
      });
      const period = { periodStart: new Date(Date.now() - DAY_MS), periodEnd: new Date(Date.now() + DAY_MS) };
      const usageEvent = {
        companyId: id,
        userId: owner.id,
        planSnapshot: "pro" as const,
        subscriptionStatusSnapshot: "trial" as const,
        allowanceMicrocentsSnapshot: 0n,
        settledAt: new Date(),
        ...period,
      };
      await prisma.agentUsageEvent.createMany({
        data: [
          { ...usageEvent, purpose: "turn", state: "settled" },
          {
            ...usageEvent,
            purpose: "turn",
            state: "released",
            periodStart: new Date(period.periodStart.getTime() - 1),
          },
          { ...usageEvent, purpose: "wikiRetrieval", state: "settled" },
        ],
      });
      await prisma.apikey.create({
        data: {
          id: randomUUID(),
          key: randomUUID(),
          referenceId: owner.id,
          companyId: id,
          enabled: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      const application = await prisma.oauthApplication.create({
        data: {
          id: randomUUID(),
          name: "Client",
          clientId: randomUUID(),
          redirectUrls: "http://localhost",
          type: "web",
        },
      });
      applications.push(application.id);
      for (const index of [1, 2]) {
        await prisma.oauthAccessToken.create({
          data: {
            id: randomUUID(),
            accessToken: `${randomUUID()}-${index}`,
            refreshToken: `${randomUUID()}-${index}`,
            accessTokenExpiresAt: new Date(Date.now() + DAY_MS),
            refreshTokenExpiresAt: new Date(Date.now() + DAY_MS),
            clientId: application.clientId,
            companyId: id,
            scopes: "mcp",
          },
        });
      }
      const otherOwner = await member(other);
      await account(other, otherOwner.id);
      await prisma.webhook.create({
        data: { companyId: other, url: "https://example.test/c", events: ["record.created"] },
      });

      expect(await repo.readFeatureUsageUnscoped(id)).toEqual({
        members: 2,
        connectedAccounts: 3,
        maxAccountsPerUser: 2,
        sharedAccounts: 1,
        openDrafts: 1,
        activeRoutines: 3,
        maxRoutinesPerOwner: 2,
        webhooks: 1,
        mateRequests: 1,
        apiClients: 2,
      });
      expect(await repo.readFeatureUsageUnscoped(other)).toMatchObject({
        members: 1,
        connectedAccounts: 1,
        openDrafts: 0,
        activeRoutines: 0,
        webhooks: 1,
        mateRequests: 0,
        apiClients: 0,
      });
    });
  });
});
