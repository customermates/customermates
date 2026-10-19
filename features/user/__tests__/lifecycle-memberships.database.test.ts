import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { PrismaBillingUsageRepo } from "@/features/billing-usage/prisma-billing-usage.repository";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

const { prisma } = await import("@/prisma/db");
const { runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { PermissionService } = await import("@/core/base/permission.service");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];
const DAY = 24 * 60 * 60 * 1000;

afterAll(async () => {
  await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companyIds } } }));
});

async function workspace(args: {
  name: string | null;
  subscription: {
    status: "trial" | "active" | "expired" | "unPaid";
    plan?: "starter" | "pro" | "business" | "enterprise";
    trialEndDate?: Date | null;
    lemonSqueezyId?: string | null;
    updatedAt?: Date;
  };
  members: Array<{ email: string; welcomeEmailSentAt?: Date | null }>;
}) {
  const companyId = randomUUID();
  companyIds.push(companyId);
  const memberIds = await runWithoutTenant(async () => {
    await prisma.company.create({ data: { id: companyId, name: args.name } });
    const { updatedAt, ...subscription } = args.subscription;
    await prisma.subscription.create({ data: { companyId, ...subscription } });
    if (updatedAt)
      await prisma.$executeRaw`UPDATE "Subscription" SET "updatedAt" = ${updatedAt} WHERE "companyId" = ${companyId}`;
    const ids: string[] = [];
    for (const member of args.members) {
      const user = await prisma.user.create({
        data: {
          companyId,
          email: member.email,
          firstName: "Lifecycle",
          lastName: "Member",
          status: "active",
          welcomeEmailSentAt: member.welcomeEmailSentAt ?? null,
        },
      });
      ids.push(user.id);
    }
    return ids;
  });
  return { companyId, memberIds };
}

function repo() {
  return new PrismaUserRepo(new PermissionService(), new PrismaBillingUsageRepo());
}

describeDatabase("lifecycle email queries with several memberships per login on PostgreSQL", () => {
  it("welcomes a login once, claiming all of its new memberships together", async () => {
    const email = `welcome-${randomUUID()}@example.invalid`;
    const first = await workspace({
      name: "First",
      subscription: { status: "trial" },
      members: [{ email }],
    });
    const second = await workspace({
      name: "Second",
      subscription: { status: "trial" },
      members: [{ email }],
    });
    const userIds = [...first.memberIds, ...second.memberIds];

    const sentAt = new Date();
    await expect(
      runWithoutTenant(() => repo().claimWelcomeEmailForLoginUnscoped({ email, userIds, sentAt })),
    ).resolves.toBe(true);
    await expect(
      runWithoutTenant(() =>
        repo().claimWelcomeEmailForLoginUnscoped({
          email,
          userIds,
          sentAt: new Date(),
        }),
      ),
    ).resolves.toBe(false);

    const rows = await runWithoutTenant(() =>
      prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { welcomeEmailSentAt: true },
      }),
    );
    expect(rows.map((row) => row.welcomeEmailSentAt?.getTime())).toEqual([sentAt.getTime(), sentAt.getTime()]);
  });

  it("marks a later membership of an already welcomed login without asking for another email", async () => {
    const email = `returning-${randomUUID()}@example.invalid`;
    await workspace({
      name: "Original",
      subscription: { status: "active" },
      members: [{ email, welcomeEmailSentAt: new Date(Date.now() - 30 * DAY) }],
    });
    const joined = await workspace({
      name: "Joined",
      subscription: { status: "trial" },
      members: [{ email: email.toUpperCase() }],
    });

    await expect(
      runWithoutTenant(() =>
        repo().claimWelcomeEmailForLoginUnscoped({
          email: email.toUpperCase(),
          userIds: joined.memberIds,
          sentAt: new Date(),
        }),
      ),
    ).resolves.toBe(false);

    const row = await runWithoutTenant(() =>
      prisma.user.findUniqueOrThrow({
        where: { id: joined.memberIds[0] },
        select: { welcomeEmailSentAt: true },
      }),
    );
    expect(row.welcomeEmailSentAt).not.toBeNull();
  });

  it("returns the workspace name with every trial and subscription recipient", async () => {
    const email = `trial-${randomUUID()}@example.invalid`;
    const named = await workspace({
      name: "Bergmann Steuern",
      subscription: {
        status: "trial",
        trialEndDate: new Date(Date.now() - 12 * 60 * 60 * 1000),
      },
      members: [{ email }],
    });
    const unnamed = await workspace({
      name: null,
      subscription: {
        status: "trial",
        trialEndDate: new Date(Date.now() - 6.5 * DAY),
      },
      members: [{ email }],
    });

    const ended = await runWithoutTenant(() => repo().findUsersWithTrialEndedLast24Hours());
    expect(ended.find((user) => user.id === named.memberIds[0])?.company).toEqual({ name: "Bergmann Steuern" });
    expect(ended.some((user) => user.id === unnamed.memberIds[0])).toBe(false);

    const deactivating = await runWithoutTenant(() => repo().findUsersWithTrialEndedBetween6And7Days());
    expect(deactivating.find((user) => user.id === unnamed.memberIds[0])?.company).toEqual({ name: null });
  });

  it("deactivates lapsed subscriptions after the grace period but never a workspace still waiting for its first plan", async () => {
    const email = `grace-${randomUUID()}@example.invalid`;
    const fiveDaysAgo = new Date(Date.now() - 5 * DAY);
    const awaitingPlan = await workspace({
      name: "Second workspace",
      subscription: {
        status: "expired",
        plan: "pro",
        trialEndDate: null,
        updatedAt: fiveDaysAgo,
      },
      members: [{ email }],
    });
    const lapsed = await workspace({
      name: "Lapsed",
      subscription: {
        status: "expired",
        plan: "pro",
        lemonSqueezyId: `ls-${randomUUID()}`,
        updatedAt: fiveDaysAgo,
      },
      members: [{ email }],
    });
    const unpaid = await workspace({
      name: null,
      subscription: { status: "unPaid", plan: "pro", updatedAt: fiveDaysAgo },
      members: [{ email }],
    });
    const enterprise = await workspace({
      name: "Enterprise",
      subscription: {
        status: "expired",
        plan: "enterprise",
        updatedAt: fiveDaysAgo,
      },
      members: [{ email }],
    });

    const recipients = await runWithoutTenant(() => repo().findUsersPastSubscriptionGracePeriod());
    const ids = new Set(recipients.map((user) => user.id));
    expect(ids.has(awaitingPlan.memberIds[0])).toBe(false);
    expect(ids.has(lapsed.memberIds[0])).toBe(true);
    expect(ids.has(unpaid.memberIds[0])).toBe(true);
    expect(ids.has(enterprise.memberIds[0])).toBe(true);
    expect(recipients.find((user) => user.id === lapsed.memberIds[0])?.company).toEqual({ name: "Lapsed" });
  });

  it("names each membership's workspace for legal notices", async () => {
    const email = `legal-${randomUUID()}@example.invalid`;
    const named = await workspace({
      name: "Acme",
      subscription: { status: "active" },
      members: [{ email }],
    });
    const unnamed = await workspace({
      name: null,
      subscription: { status: "active" },
      members: [{ email }],
    });

    const recipients = await runWithoutTenant(() => repo().findActiveLegalNoticeRecipientsUnscoped());
    const byId = new Map(recipients.map((recipient) => [recipient.id, recipient]));
    expect(byId.get(named.memberIds[0])).toMatchObject({
      email,
      companyId: named.companyId,
      companyName: "Acme",
    });
    expect(byId.get(unnamed.memberIds[0])).toMatchObject({
      email,
      companyId: unnamed.companyId,
      companyName: null,
    });
  });
});
