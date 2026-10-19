import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import { runWithTenant, runWithoutTenant } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";
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
const { PrismaBillingUsageRepo } = await import("../prisma-billing-usage.repository");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];
const users = () => new PrismaUserRepo(new PermissionService(), new PrismaBillingUsageRepo());
const accounts = () =>
  new PrismaConnectedAccountRepo(new PermissionService(), new PrismaUnipileWebhookRepo(), new PrismaBillingUsageRepo());

async function workspace(
  options: {
    createdAt?: Date;
    status?: "active" | "pendingAuthorization";
  } = {},
) {
  const companyId = randomUUID();
  const userId = randomUUID();
  const roleId = randomUUID();
  companyIds.push(companyId);

  await runWithoutTenant(async () => {
    await prisma.company.create({
      data: {
        id: companyId,
        ...(options.createdAt ? { createdAt: options.createdAt } : {}),
      },
    });
    await prisma.userRole.create({
      data: { id: roleId, companyId, name: "Member" },
    });
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
    prisma.billingUsageInterval.findMany({
      where: { companyId },
      orderBy: [{ kind: "asc" }, { startedAt: "asc" }],
    }),
  );
}

function ledgerWorkspace(companyId: string) {
  return runWithoutTenant(() => prisma.billingUsageWorkspace.findFirst({ where: { companyId } }));
}

function recordSeats(companyId: string, changed: string[] = []) {
  return runWithoutTenant(() => new PrismaBillingUsageRepo().recordSeats(companyId, changed));
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
  it("records a workspace as covered since creation only when it is registered on creation", async () => {
    const fresh = await workspace();
    const unseen = await workspace();

    await runWithoutTenant(() => new PrismaBillingUsageRepo().recordWorkspaceCreated(fresh.companyId));
    await recordSeats(fresh.companyId);
    await recordSeats(unseen.companyId);

    expect(await ledgerWorkspace(fresh.companyId)).toMatchObject({
      seatsRecordedFrom: null,
      channelsRecordedFrom: null,
    });
    expect((await ledgerWorkspace(unseen.companyId))?.seatsRecordedFrom).toBeInstanceOf(Date);
  });

  it("marks only the subject a write changed as exact and every other repaired mismatch as estimated", async () => {
    const { companyId, userId, roleId } = await workspace();
    const otherId = randomUUID();
    await runWithoutTenant(() =>
      prisma.user.create({
        data: {
          id: otherId,
          companyId,
          roleId,
          email: `ledger-${randomUUID()}@ledger.example.invalid`,
          firstName: "Other",
          lastName: "Probe",
          status: "active",
        },
      }),
    );
    await recordSeats(companyId, [userId, otherId]);

    await runWithoutTenant(() =>
      prisma.user.update({
        where: { id: otherId, companyId },
        data: { status: "inactive" },
      }),
    );
    await runWithoutTenant(() => users().deactivateUserOrThrow(userId));

    const rows = await intervals(companyId);
    expect(rows.find((row) => row.subjectId === userId)).toMatchObject({
      endExact: true,
    });
    expect(rows.find((row) => row.subjectId === otherId)).toMatchObject({
      endExact: false,
    });
  });

  it("keeps a repaired interval estimated when a write touches a subject without changing whether it counts", async () => {
    const { companyId, userId } = await workspace();
    const accountId = randomUUID();
    await runWithoutTenant(() =>
      prisma.connectedAccount.create({
        data: {
          id: accountId,
          companyId,
          userId,
          unipileAccountId: `u-${accountId}`,
          provider: "google",
          status: "connecting",
          emailAddress: "drift@ledger.example.invalid",
        },
      }),
    );

    await runWithoutTenant(() => users().setOperatorStatusCompanyWide(companyId, userId, "active"));
    await runWithoutTenant(() =>
      accounts().updateAccountUnscoped({
        unipileAccountId: `u-${accountId}`,
        status: "ok",
      }),
    );

    const rows = await intervals(companyId);
    expect(rows.find((row) => row.subjectId === userId)).toMatchObject({
      startExact: false,
    });
    expect(rows.find((row) => row.subjectId === accountId)).toMatchObject({
      startExact: false,
    });
  });

  it("opens a seat for an active user, closes it when the user repository deactivates them and opens a new one on reactivation", async () => {
    const { companyId, userId } = await workspace();
    await recordSeats(companyId, [userId]);

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
    const { companyId, userId } = await workspace({
      status: "pendingAuthorization",
    });

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
      await prisma.userRole.create({
        data: { id: adminRoleId, companyId, name: "Admin" },
      });
      await prisma.user.update({
        where: { id: userId, companyId },
        data: { roleId: adminRoleId, firstName: "Renamed" },
      });
    });
    await recordSeats(companyId);

    const rows = await intervals(companyId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      roleName: "Admin",
      firstName: "Renamed",
      endedAt: null,
    });
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
    await runWithoutTenant(() =>
      repo.updateAccountUnscoped({
        unipileAccountId: soft,
        status: "credentials",
      }),
    );
    expect((await intervals(companyId)).filter((row) => row.kind === "channel" && row.endedAt === null)).toHaveLength(
      2,
    );

    await runWithoutTenant(() => repo.markAccountDeletedUnscoped(softRow.id));
    await runWithoutTenant(async () => {
      await prisma.connectedAccount.delete({
        where: { id: hardRow.id, companyId },
      });
      await new PrismaBillingUsageRepo().recordChannels(companyId, [hardRow.id]);
    });

    const channels = (await intervals(companyId)).filter((row) => row.kind === "channel");
    expect(channels).toHaveLength(2);
    expect(channels.find((row) => row.subjectId === softRow.id)).toMatchObject({
      provider: "google",
      identifier: "inbox@ledger.example.invalid",
      endExact: true,
    });
    expect(channels.find((row) => row.subjectId === hardRow.id)).toMatchObject({
      identifier: "+4917600000009",
    });
    expect(channels.every((row) => row.endedAt instanceof Date)).toBe(true);
  });

  it("records a user's disconnect exactly, keeps a late status webhook from reviving it and repairs an existing row as estimated", async () => {
    const { companyId, userId } = await workspace();
    const repo = accounts();
    const unipileAccountId = `u-${randomUUID()}`;
    const input = {
      companyId,
      userId,
      unipileAccountId,
      provider: "google" as const,
      status: "ok" as const,
      displayName: null,
      emailAddress: "owned@ledger.example.invalid",
      hasMessaging: true,
      hasCalendar: false,
    };
    const row = await runWithoutTenant(() => repo.createAccountUnscoped(input));

    await runWithoutTenant(() =>
      prisma.billingUsageInterval.deleteMany({
        where: { companyId, subjectId: row.id },
      }),
    );
    await runWithoutTenant(() => repo.createAccountUnscoped(input));
    expect((await intervals(companyId)).find((interval) => interval.subjectId === row.id)).toMatchObject({
      startExact: false,
    });

    await runWithTenant(createMockUser({ id: userId, companyId }), () => repo.deleteAccount(row.id));
    expect(await runWithoutTenant(() => prisma.connectedAccount.findFirst({ where: { id: row.id } }))).toBeNull();
    const closed = (await intervals(companyId)).find((interval) => interval.subjectId === row.id);
    expect(closed).toMatchObject({ endExact: true });
    expect(closed?.endedAt).toBeInstanceOf(Date);

    const softId = (
      await runWithoutTenant(() =>
        repo.createAccountUnscoped({
          ...input,
          unipileAccountId: `u-${randomUUID()}`,
        }),
      )
    ).id;
    await runWithoutTenant(() => repo.markAccountDeletedUnscoped(softId));
    const soft = await runWithoutTenant(() => prisma.connectedAccount.findFirstOrThrow({ where: { id: softId } }));
    await expect(
      runWithoutTenant(() =>
        repo.updateAccountUnscoped({
          unipileAccountId: soft.unipileAccountId,
          status: "ok",
        }),
      ),
    ).resolves.toBeNull();
    expect(
      (await runWithoutTenant(() => prisma.connectedAccount.findFirstOrThrow({ where: { id: softId } }))).status,
    ).toBe("deleted");
    expect(
      (await intervals(companyId)).filter((interval) => interval.subjectId === softId && interval.endedAt === null),
    ).toEqual([]);
  });

  it("records an admin's status change under the tenant guard", async () => {
    const { companyId, userId, roleId } = await workspace();
    await recordSeats(companyId, [userId]);

    await runWithTenant(createMockUser({ id: randomUUID(), companyId }), () =>
      users().adminUpdateDetailsOrThrow({
        userId,
        email: "admin-change@ledger.example.invalid",
        firstName: "Ledger",
        lastName: "Probe",
        status: "inactive",
        avatarUrl: null,
        roleId,
      }),
    );

    expect(await intervals(companyId)).toMatchObject([{ subjectId: userId, endExact: true }]);
  });

  it("counts one login once per workspace and closes only the seat of the workspace it leaves", async () => {
    const first = await workspace();
    const second = await workspace();
    const email = `multi-${randomUUID()}@ledger.example.invalid`;
    await runWithoutTenant(() =>
      prisma.user.updateMany({
        where: { id: { in: [first.userId, second.userId] } },
        data: { email },
      }),
    );
    await recordSeats(first.companyId, [first.userId]);
    await recordSeats(second.companyId, [second.userId]);

    await expect(
      runWithTenant(createMockUser({ id: first.userId, companyId: first.companyId, email }), () =>
        users().leaveCompanyWide(first.userId),
      ),
    ).resolves.toBe(true);

    const [left] = await intervals(first.companyId);
    expect(left).toMatchObject({
      subjectId: first.userId,
      email,
      endExact: true,
    });
    expect(left.endedAt).toBeInstanceOf(Date);
    expect(await intervals(second.companyId)).toMatchObject([{ subjectId: second.userId, email, endedAt: null }]);
  });

  it("keeps one open interval per subject", async () => {
    const { companyId, userId } = await workspace();
    await recordSeats(companyId, [userId]);

    await expect(
      runWithoutTenant(() =>
        prisma.billingUsageInterval.create({
          data: {
            companyId,
            kind: "seat",
            subjectId: userId,
            startedAt: new Date(),
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("closes a deleted workspace's seats and keeps them without identities", async () => {
    const { companyId, userId } = await workspace();
    await recordSeats(companyId);

    await runWithoutTenant(() => new PrismaCompanyRepo(new PrismaBillingUsageRepo()).deleteCompanyUnscoped(companyId));

    expect(await intervals(companyId)).toMatchObject([
      {
        subjectId: userId,
        endExact: true,
        firstName: null,
        lastName: null,
        email: null,
        roleName: "Member",
      },
    ]);
    expect((await intervals(companyId))[0].endedAt).toBeInstanceOf(Date);
    expect((await ledgerWorkspace(companyId))?.deletedAt).toBeInstanceOf(Date);
  });

  it("lets the daily sweep pick up changes no write path recorded and mark their times estimated", async () => {
    const kept = await workspace();
    const vanished = await workspace();
    await recordSeats(kept.companyId, [kept.userId]);
    await recordSeats(vanished.companyId, [vanished.userId]);

    await runWithoutTenant(async () => {
      await prisma.user.update({
        where: { id: kept.userId, companyId: kept.companyId },
        data: { status: "inactive" },
      });
      await prisma.company.delete({ where: { id: vanished.companyId } });
    });

    const repo = new PrismaBillingUsageRepo();
    const recorded = await repo.findWorkspacesToReconcileUnscoped(null, 10_000);
    expect(recorded).toEqual(expect.arrayContaining([kept.companyId, vanished.companyId]));
    expect(await repo.findWorkspacesToReconcileUnscoped(kept.companyId, 10_000)).not.toContain(kept.companyId);
    await repo.reconcileWorkspaceUnscoped(kept.companyId);
    await repo.reconcileWorkspaceUnscoped(vanished.companyId);

    expect(await intervals(kept.companyId)).toMatchObject([{ endExact: false }]);
    expect((await intervals(kept.companyId))[0].endedAt).toBeInstanceOf(Date);
    expect((await ledgerWorkspace(kept.companyId))?.deletedAt).toBeNull();
    expect(await intervals(vanished.companyId)).toMatchObject([{ endExact: false, email: null }]);
    expect((await ledgerWorkspace(vanished.companyId))?.deletedAt).toBeInstanceOf(Date);
    expect(await repo.findWorkspacesToReconcileUnscoped(null, 10_000)).not.toContain(vanished.companyId);
  });

  it("lets the daily sweep pick up a workspace that has no ledger row yet", async () => {
    const unrecorded = await workspace();
    expect(await ledgerWorkspace(unrecorded.companyId)).toBeNull();

    const repo = new PrismaBillingUsageRepo();
    expect(await repo.findWorkspacesToReconcileUnscoped(null, 10_000)).toContain(unrecorded.companyId);
    await repo.reconcileWorkspaceUnscoped(unrecorded.companyId);

    expect(await ledgerWorkspace(unrecorded.companyId)).toMatchObject({ deletedAt: null });
    expect(await intervals(unrecorded.companyId)).toMatchObject([{ subjectId: unrecorded.userId, startExact: false }]);
  });
});
