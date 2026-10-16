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
const { PrismaOperatorBillingUsageRepo } = await import("../prisma-operator-billing-usage.repository");
const { billingUsageMonthOf, billingUsageWindow, workspaceBillingUsage } = await import("../billing-usage");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];

async function workspaceWithMember(status: "active" | "inactive" | "pendingAuthorization" = "active") {
  const companyId = randomUUID();
  const userId = randomUUID();
  const roleId = randomUUID();
  companyIds.push(companyId);

  await runWithoutTenant(async () => {
    await prisma.company.create({ data: { id: companyId } });
    await prisma.userRole.create({ data: { id: roleId, companyId, name: "Member" } });
    await prisma.user.create({
      data: {
        id: userId,
        companyId,
        roleId,
        email: `ledger-${randomUUID()}@ledger.example.invalid`,
        firstName: "Ledger",
        lastName: "Probe",
        status,
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

function setStatus(userId: string, companyId: string, status: "active" | "inactive") {
  return runWithoutTenant(() => prisma.user.update({ where: { id: userId, companyId }, data: { status } }));
}

afterAll(async () => {
  await runWithoutTenant(async () => {
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.$executeRaw`DELETE FROM "BillingUsageInterval" WHERE "companyId" = ANY(${companyIds}::text[])`;
    await prisma.$executeRaw`DELETE FROM "BillingUsageWorkspace" WHERE "companyId" = ANY(${companyIds}::text[])`;
  });
  await prisma.$disconnect();
});

describeDatabase("billing usage ledger", { timeout: 120_000 }, () => {
  it("registers every new workspace as recorded since its creation", async () => {
    const { companyId } = await workspaceWithMember();

    const row = await runWithoutTenant(() => prisma.billingUsageWorkspace.findUnique({ where: { companyId } }));

    expect(row).toMatchObject({ companyId, deletedAt: null, seatsRecordedFrom: null, channelsRecordedFrom: null });
  });

  it("opens a seat when a user becomes active, closes it on deactivation and opens a new one on reactivation", async () => {
    const { companyId, userId } = await workspaceWithMember();

    await setStatus(userId, companyId, "inactive");
    await setStatus(userId, companyId, "active");

    const rows = await intervals(companyId);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "seat", subjectId: userId, roleName: "Member", startExact: true });
    expect(rows[0].endedAt).toBeInstanceOf(Date);
    expect(rows[1]).toMatchObject({ kind: "seat", subjectId: userId, endedAt: null });
  });

  it("never counts a pending invitation until the user is activated", async () => {
    const { companyId, userId } = await workspaceWithMember("pendingAuthorization");

    expect(await intervals(companyId)).toEqual([]);

    await setStatus(userId, companyId, "active");
    expect(await intervals(companyId)).toHaveLength(1);
  });

  it("keeps one interval when a user is deactivated and reactivated inside one transaction", async () => {
    const { companyId, userId } = await workspaceWithMember();

    await runWithoutTenant(() =>
      prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: userId, companyId }, data: { status: "inactive" } });
        await tx.user.update({ where: { id: userId, companyId }, data: { status: "active" } });
      }),
    );

    const rows = await intervals(companyId);
    expect(rows).toHaveLength(1);
    expect(rows[0].endedAt).toBeNull();
  });

  it("keeps the open seat's name, email and role current", async () => {
    const { companyId, userId } = await workspaceWithMember();
    const adminRoleId = randomUUID();

    await runWithoutTenant(async () => {
      await prisma.userRole.create({ data: { id: adminRoleId, companyId, name: "Admin" } });
      await prisma.user.update({
        where: { id: userId, companyId },
        data: { roleId: adminRoleId, firstName: "Renamed" },
      });
    });

    const rows = await intervals(companyId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ roleName: "Admin", firstName: "Renamed", endedAt: null });
  });

  it("counts a channel while it is not deleted, through outages, until a soft or hard removal", async () => {
    const { companyId, userId } = await workspaceWithMember();
    const softId = randomUUID();
    const hardId = randomUUID();

    await runWithoutTenant(async () => {
      await prisma.connectedAccount.create({
        data: {
          id: softId,
          companyId,
          userId,
          unipileAccountId: `u-${softId}`,
          provider: "google",
          status: "ok",
          emailAddress: "inbox@ledger.example.invalid",
        },
      });
      await prisma.connectedAccount.create({
        data: {
          id: hardId,
          companyId,
          userId,
          unipileAccountId: `u-${hardId}`,
          provider: "whatsapp",
          status: "connecting",
          displayName: "+4917600000009",
        },
      });
      await prisma.connectedAccount.update({ where: { id: softId, companyId }, data: { status: "credentials" } });
      await prisma.connectedAccount.update({ where: { id: softId, companyId }, data: { status: "deleted" } });
      await prisma.connectedAccount.delete({ where: { id: hardId, companyId } });
    });

    const channels = (await intervals(companyId)).filter((row) => row.kind === "channel");
    expect(channels).toHaveLength(2);
    expect(channels.find((row) => row.subjectId === softId)).toMatchObject({
      provider: "google",
      identifier: "inbox@ledger.example.invalid",
      endExact: true,
    });
    expect(channels.find((row) => row.subjectId === hardId)).toMatchObject({
      provider: "whatsapp",
      identifier: "+4917600000009",
    });
    expect(channels.every((row) => row.endedAt instanceof Date)).toBe(true);
  });

  it("keeps a deleted workspace's history, closes its seats and labels it from the deletion audit", async () => {
    const { companyId, userId } = await workspaceWithMember();
    const accountId = randomUUID();

    await runWithoutTenant(async () => {
      await prisma.connectedAccount.create({
        data: {
          id: accountId,
          companyId,
          userId,
          unipileAccountId: `u-${accountId}`,
          provider: "outlook",
          status: "ok",
          emailAddress: "gone@ledger.example.invalid",
        },
      });
      await prisma.connectedAccount.update({ where: { id: accountId, companyId }, data: { status: "deleted" } });
      await prisma.company.delete({ where: { id: companyId } });
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
      before: new Date(Date.now() + 60_000),
    });

    expect(ledger.workspaces).toHaveLength(1);
    expect(ledger.workspaces[0]).toMatchObject({ workspaceLabel: "ledger.example.invalid", activeSeats: 0 });
    expect(ledger.workspaces[0].deletedAt).toBeInstanceOf(Date);
    expect(ledger.intervals.every((interval) => interval.endedAt instanceof Date)).toBe(true);

    const usage = workspaceBillingUsage({
      workspace: ledger.workspaces[0],
      intervals: ledger.intervals,
      window: billingUsageWindow(billingUsageMonthOf(new Date())),
      includeDetails: true,
    });
    expect(usage.seats.count).toBe(1);
    expect(usage.seats.users?.[0]).toMatchObject({ userId, firstName: "Ledger", roleName: "Member" });
    expect(usage.channels.peak).toBe(1);
    expect(usage.current).toEqual({ activeSeats: 0, connectedChannels: 0 });

    await runWithoutTenant(() => prisma.operatorAuditEvent.deleteMany({ where: { targetCompanyId: companyId } }));
  });

  it("reads live workspaces with their current seats and channels", async () => {
    const { companyId, userId } = await workspaceWithMember();
    const accountId = randomUUID();
    await runWithoutTenant(() =>
      prisma.connectedAccount.create({
        data: {
          id: accountId,
          companyId,
          userId,
          unipileAccountId: `u-${accountId}`,
          provider: "linkedin",
          status: "ok",
          displayName: "Ledger Probe",
        },
      }),
    );

    const ledger = await new PrismaOperatorBillingUsageRepo().readBillingUsageLedgerUnscoped({
      companyId,
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
