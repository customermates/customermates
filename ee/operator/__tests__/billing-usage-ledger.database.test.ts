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
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { PrismaCompanyRepo } = await import("@/features/company/prisma-company.repository");
const { PrismaConnectedAccountRepo } = await import("@/ee/messaging/persistence/prisma-connected-account.repository");
const { PrismaUnipileWebhookRepo } = await import("@/ee/messaging/persistence/prisma-unipile-webhook.repository");
const { BillingUsageLedger } = await import("@/features/billing-usage/billing-usage-ledger");
const { ReconcileBillingUsageInteractor } = await import("@/features/billing-usage/reconcile-billing-usage.interactor");
const { PrismaReconcileBillingUsageRepo } = await import(
  "@/features/billing-usage/prisma-reconcile-billing-usage.repository"
);
const { PrismaOperatorBillingUsageRepo } = await import("../prisma-operator-billing-usage.repository");
const { billingUsageMonthOf, billingUsageWindow, workspaceBillingUsage } = await import("../billing-usage");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];
const users = () => new PrismaUserRepo(new PermissionService());
const accounts = () => new PrismaConnectedAccountRepo(new PermissionService(), new PrismaUnipileWebhookRepo());

async function workspace(options: { createdAt?: Date; status?: "active" | "pendingAuthorization" } = {}) {
  const companyId = randomUUID();
  const userId = randomUUID();
  const roleId = randomUUID();
  companyIds.push(companyId);

  await runWithoutTenant(async () => {
    await prisma.company.create({
      data: { id: companyId, ...(options.createdAt ? { createdAt: options.createdAt } : {}) },
    });
    await prisma.userRole.create({ data: { id: roleId, companyId, name: "Member" } });
    await prisma.user.create({
      data: {
        id: userId,
        companyId,
        roleId,
        email: `ledger-${randomUUID()}@ledger.example.invalid`,
        firstName: "Ledger",
        lastName: "Probe",
        status: options.status ?? "active",
      },
    });
  });

  return { companyId, userId, roleId };
}

function intervals(companyId: string) {
  return runWithoutTenant(() =>
    prisma.billingUsageInterval.findMany({ where: { companyId }, orderBy: [{ kind: "asc" }, { startedAt: "asc" }] }),
  );
}

function ledgerWorkspace(companyId: string) {
  return runWithoutTenant(() => prisma.billingUsageWorkspace.findFirst({ where: { companyId } }));
}

function recordSeats(companyId: string) {
  return runWithoutTenant(() => new BillingUsageLedger().recordSeats(companyId));
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

describeDatabase("billing usage ledger", { timeout: 120_000 }, () => {
  it("records a new workspace as covered since creation and an older one from the first observation", async () => {
    const fresh = await workspace();
    const old = await workspace({ createdAt: new Date("2026-01-05T00:00:00.000Z") });

    await recordSeats(fresh.companyId);
    await recordSeats(old.companyId);

    expect(await ledgerWorkspace(fresh.companyId)).toMatchObject({
      seatsRecordedFrom: null,
      channelsRecordedFrom: null,
    });
    expect((await ledgerWorkspace(old.companyId))?.seatsRecordedFrom).toBeInstanceOf(Date);
  });

  it("opens a seat for an active user, closes it when the user repository deactivates them and opens a new one on reactivation", async () => {
    const { companyId, userId } = await workspace();
    await recordSeats(companyId);

    await runWithoutTenant(() => users().deactivateUserOrThrow(userId));
    await runWithoutTenant(() => users().setOperatorStatusCompanyWide(companyId, userId, "active"));

    const rows = await intervals(companyId);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      kind: "seat",
      subjectId: userId,
      roleName: "Member",
      startExact: true,
      endExact: true,
    });
    expect(rows[0].endedAt).toBeInstanceOf(Date);
    expect(rows[1]).toMatchObject({ subjectId: userId, endedAt: null });
  });

  it("never counts a pending invitation until the user is activated", async () => {
    const { companyId, userId } = await workspace({ status: "pendingAuthorization" });

    await recordSeats(companyId);
    expect(await intervals(companyId)).toEqual([]);

    await runWithoutTenant(() => users().setOperatorStatusCompanyWide(companyId, userId, "active"));
    expect(await intervals(companyId)).toHaveLength(1);
  });

  it("is idempotent and keeps the open seat's name and role current", async () => {
    const { companyId, userId } = await workspace();
    const adminRoleId = randomUUID();
    await recordSeats(companyId);
    await recordSeats(companyId);

    await runWithoutTenant(async () => {
      await prisma.userRole.create({ data: { id: adminRoleId, companyId, name: "Admin" } });
      await prisma.user.update({
        where: { id: userId, companyId },
        data: { roleId: adminRoleId, firstName: "Renamed" },
      });
    });
    await recordSeats(companyId);

    const rows = await intervals(companyId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ roleName: "Admin", firstName: "Renamed", endedAt: null });
  });

  it("counts a channel while it is not deleted, through outages, until a soft or hard removal", async () => {
    const { companyId, userId } = await workspace();
    const soft = `u-${randomUUID()}`;
    const hard = `u-${randomUUID()}`;
    const repo = accounts();

    const softRow = await runWithoutTenant(() =>
      repo.createAccountUnscoped({
        companyId,
        userId,
        unipileAccountId: soft,
        provider: "google",
        status: "ok",
        displayName: null,
        emailAddress: "inbox@ledger.example.invalid",
        hasMessaging: true,
        hasCalendar: false,
      }),
    );
    const hardRow = await runWithoutTenant(() =>
      repo.createAccountUnscoped({
        companyId,
        userId,
        unipileAccountId: hard,
        provider: "whatsapp",
        status: "connecting",
        displayName: "+4917600000009",
        emailAddress: null,
        hasMessaging: true,
        hasCalendar: false,
      }),
    );
    await runWithoutTenant(() => repo.updateAccountUnscoped({ unipileAccountId: soft, status: "credentials" }));
    expect((await intervals(companyId)).filter((row) => row.kind === "channel" && row.endedAt === null)).toHaveLength(
      2,
    );

    await runWithoutTenant(() => repo.markAccountDeletedUnscoped(softRow.id));
    await runWithoutTenant(async () => {
      await prisma.connectedAccount.delete({ where: { id: hardRow.id, companyId } });
      await new BillingUsageLedger().recordChannels(companyId);
    });

    const channels = (await intervals(companyId)).filter((row) => row.kind === "channel");
    expect(channels).toHaveLength(2);
    expect(channels.find((row) => row.subjectId === softRow.id)).toMatchObject({
      provider: "google",
      identifier: "inbox@ledger.example.invalid",
      endExact: true,
    });
    expect(channels.find((row) => row.subjectId === hardRow.id)).toMatchObject({ identifier: "+4917600000009" });
    expect(channels.every((row) => row.endedAt instanceof Date)).toBe(true);
  });

  it("keeps a deleted workspace's history, closes its seats and labels it from the deletion audit", async () => {
    const { companyId, userId } = await workspace();
    await recordSeats(companyId);

    await runWithoutTenant(async () => {
      await new PrismaCompanyRepo().deleteCompanyUnscoped(companyId);
      await prisma.operatorAuditEvent.create({
        data: {
          actorUserId: randomUUID(),
          action: "operator.workspace.delete",
          targetCompanyId: companyId,
          metadata: { workspaceLabel: "ledger.example.invalid" },
        },
      });
    });

    const ledger = await new PrismaOperatorBillingUsageRepo().readBillingUsageLedgerUnscoped({
      companyId,
      from: new Date(Date.now() - 60 * 60_000),
      before: new Date(Date.now() + 60_000),
    });

    expect(ledger.workspaces).toHaveLength(1);
    expect(ledger.workspaces[0]).toMatchObject({ workspaceLabel: "ledger.example.invalid", activeSeats: 0 });
    expect(ledger.workspaces[0].deletedAt).toBeInstanceOf(Date);
    expect(ledger.intervals).toHaveLength(1);
    expect(ledger.intervals[0]).toMatchObject({ endExact: true });
    expect(ledger.intervals[0].endedAt).toBeInstanceOf(Date);

    const usage = workspaceBillingUsage({
      workspace: ledger.workspaces[0],
      intervals: ledger.intervals,
      window: billingUsageWindow(billingUsageMonthOf(new Date())),
      includeDetails: true,
    });
    expect(usage.seats.count).toBe(1);
    expect(usage.seats.users?.[0]).toMatchObject({ userId, firstName: "Ledger", roleName: "Member" });
    expect(usage.current).toEqual({ activeSeats: 0, connectedChannels: 0 });
  });

  it("lets the daily sweep pick up changes no write path recorded and mark their times inexact", async () => {
    const kept = await workspace();
    const vanished = await workspace();
    await recordSeats(kept.companyId);
    await recordSeats(vanished.companyId);

    await runWithoutTenant(async () => {
      await prisma.user.update({ where: { id: kept.userId, companyId: kept.companyId }, data: { status: "inactive" } });
      await prisma.company.delete({ where: { id: vanished.companyId } });
    });

    await new ReconcileBillingUsageInteractor(new PrismaReconcileBillingUsageRepo()).invoke();

    expect(await intervals(kept.companyId)).toMatchObject([{ endExact: false }]);
    expect((await intervals(kept.companyId))[0].endedAt).toBeInstanceOf(Date);
    expect(await intervals(vanished.companyId)).toMatchObject([{ endExact: false }]);
    expect((await ledgerWorkspace(vanished.companyId))?.deletedAt).toBeInstanceOf(Date);
  });

  it("reads live workspaces with their current seats and channels", async () => {
    const { companyId, userId } = await workspace();
    await runWithoutTenant(() =>
      accounts().createAccountUnscoped({
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

    const ledger = await new PrismaOperatorBillingUsageRepo().readBillingUsageLedgerUnscoped({
      companyId,
      from: new Date(Date.now() - 60 * 60_000),
      before: new Date(Date.now() + 60_000),
    });

    expect(ledger.workspaces[0]).toMatchObject({
      workspaceLabel: "ledger.example.invalid",
      deletedAt: null,
      activeSeats: 1,
      connectedChannels: 1,
    });
  });
});
