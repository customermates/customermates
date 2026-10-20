import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));

const { prisma } = await import("@/prisma/db");
const { PermissionService } = await import("@/core/base/permission.service");
const { PrismaCompanyRepo } = await import("@/features/company/prisma-company.repository");
const { PrismaConnectedAccountRepo } = await import("@/ee/messaging/persistence/prisma-connected-account.repository");
const { PrismaUnipileWebhookRepo } = await import("@/ee/messaging/persistence/prisma-unipile-webhook.repository");
const { PrismaBillingUsageRepo } = await import("@/features/billing-usage/prisma-billing-usage.repository");
const { PrismaOperatorBillingUsageRepo } = await import("../prisma-operator-billing-usage.repository");
const { billingUsageMonthOf, billingUsageWindow, workspaceBillingUsage } = await import("../billing-usage");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];

async function workspace() {
  const companyId = randomUUID();
  const userId = randomUUID();
  const roleId = randomUUID();
  const email = `ledger-${randomUUID()}@ledger.example.invalid`;
  companyIds.push(companyId);

  await runWithoutTenant(async () => {
    await prisma.company.create({ data: { id: companyId } });
    await prisma.userRole.create({ data: { id: roleId, companyId, name: "Member" } });
    await prisma.user.create({
      data: {
        id: userId,
        companyId,
        roleId,
        email,
        firstName: "Ledger",
        lastName: "Probe",
        status: "active",
      },
    });
  });

  return { companyId, userId, email };
}

function readLedger(companyId: string) {
  return new PrismaOperatorBillingUsageRepo().readBillingUsageLedgerUnscoped({
    companyId,
    from: new Date(Date.now() - 60 * 60_000),
    before: new Date(Date.now() + 60_000),
  });
}

afterAll(async () => {
  await runWithoutTenant(async () => {
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.$executeRaw`DELETE FROM "BillingUsageInterval" WHERE "companyId" = ANY(${companyIds}::text[])`;
    await prisma.$executeRaw`DELETE FROM "BillingUsageWorkspace" WHERE "companyId" = ANY(${companyIds}::text[])`;
    await prisma.operatorAuditEvent.deleteMany({ where: { targetCompanyId: { in: companyIds } } });
  });
  await prisma.$disconnect();
});

describeDatabase("operator billing usage read model", { timeout: 120_000 }, () => {
  it("counts a deleted workspace's seats without identities and labels it from the deletion audit", async () => {
    const { companyId, userId } = await workspace();
    await runWithoutTenant(() => new PrismaBillingUsageRepo().recordSeats(companyId, []));

    await runWithoutTenant(async () => {
      await new PrismaCompanyRepo(new PrismaBillingUsageRepo()).deleteCompanyUnscoped(companyId);
      await prisma.operatorAuditEvent.create({
        data: {
          actorUserId: randomUUID(),
          action: "operator.workspace.delete",
          targetCompanyId: companyId,
          metadata: { workspaceLabel: "ledger.example.invalid" },
        },
      });
    });

    const ledger = await readLedger(companyId);

    expect(ledger.workspaces).toHaveLength(1);
    expect(ledger.workspaces[0]).toMatchObject({ workspaceLabel: "ledger.example.invalid", activeSeats: 0 });
    expect(ledger.workspaces[0].deletedAt).toBeInstanceOf(Date);

    const usage = workspaceBillingUsage({
      workspace: ledger.workspaces[0],
      intervals: ledger.intervals,
      window: billingUsageWindow(billingUsageMonthOf(new Date())),
      includeDetails: true,
    });
    expect(usage.seats.count).toBe(1);
    expect(usage.seats.users?.[0]).toMatchObject({
      userId,
      firstName: null,
      lastName: null,
      email: null,
      roleName: "Member",
    });
    expect(usage.current).toEqual({ activeSeats: 0, connectedChannels: 0 });
    expect(usage.subscription).toBeNull();
  });

  it("reads live workspaces with their current seats, channels and subscription", async () => {
    const { companyId, userId, email } = await workspace();
    await runWithoutTenant(() =>
      prisma.subscription.create({
        data: {
          companyId,
          status: "active",
          plan: "business",
          lemonSqueezyId: `ls-${randomUUID()}`,
          quantity: 4,
          currentPeriodEnd: new Date("2026-11-01T00:00:00.000Z"),
        },
      }),
    );
    await runWithoutTenant(() =>
      new PrismaConnectedAccountRepo(
        new PermissionService(),
        new PrismaUnipileWebhookRepo(),
        new PrismaBillingUsageRepo(),
      ).createAccountUnscoped({
        companyId,
        userId,
        unipileAccountId: `u-${randomUUID()}`,
        provider: "linkedin",
        status: "ok",
        displayName: "Ledger Probe",
        emailAddress: null,
        hasMessaging: true,
        hasCalendar: false,
      }),
    );

    expect((await readLedger(companyId)).workspaces[0]).toMatchObject({
      workspaceLabel: `${email} · ${companyId.slice(0, 8)}`,
      ownerEmail: email,
      deletedAt: null,
      activeSeats: 1,
      connectedChannels: 1,
      subscription: {
        plan: "business",
        status: "active",
        billing: "lemonSqueezy",
        quantity: 4,
        trialEndDate: null,
        currentPeriodEnd: new Date("2026-11-01T00:00:00.000Z"),
        enterpriseAgentCreditsPerUser: null,
      },
    });
  });
});
