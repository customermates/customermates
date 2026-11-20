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
const { workspaceActivation } = await import("../workspace-measurement");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];
const DAY_MS = 24 * 60 * 60 * 1000;

async function workspace(createdAt: Date) {
  const companyId = randomUUID();
  const roleId = randomUUID();
  const userId = randomUUID();
  companyIds.push(companyId);
  await runWithoutTenant(async () => {
    await prisma.company.create({ data: { id: companyId, createdAt } });
    await prisma.userRole.create({ data: { id: roleId, companyId, name: "Admin", isSystemRole: true } });
    await prisma.user.create({
      data: {
        id: userId,
        companyId,
        roleId,
        email: `measure-${randomUUID()}@measure.example.invalid`,
        firstName: "Measure",
        lastName: "Probe",
        status: "active",
      },
    });
  });
  return { companyId, userId };
}

async function record(companyId: string, userId: string | null, kind: string, createdAt: Date) {
  await runWithoutTenant(() =>
    prisma.eventLog.create({
      data: {
        companyId,
        subjectKind: "record",
        subjectTypeId: "type-1",
        subjectId: randomUUID(),
        actorId: userId,
        kind,
        payload: {},
        createdAt,
      },
    }),
  );
}

function read(companyId: string, createdAt: Date) {
  return runWithoutTenant(() =>
    new PrismaOperatorBillingUsageRepo().readWorkspaceMeasurementsUnscoped([{ companyId, createdAt }]),
  );
}

afterAll(async () => {
  await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companyIds } } }));
  await prisma.$disconnect();
});

describeDatabase("operator workspace measurement read", { timeout: 120_000 }, () => {
  it("reads the signup source, the answer and every first-value event of one workspace", async () => {
    const createdAt = new Date(Date.now() - 20 * DAY_MS);
    const { companyId, userId } = await workspace(createdAt);
    const at = (days: number) => new Date(createdAt.getTime() + days * DAY_MS);
    await runWithoutTenant(async () => {
      await prisma.company.update({
        where: { id: companyId },
        data: {
          signupTemplate: "law-firm-intake",
          signupLastPage: "/en/for/law-firms",
          discoveryChoice: "other",
          discoveryDetail: "a podcast",
          discoveryUserId: userId,
          discoveryAnsweredAt: at(0),
          agentFirstCallAt: at(1),
        },
      });
      await prisma.companyFunnelEvent.createMany({
        data: [
          { companyId, type: "setupCompleted", occurredAt: at(0.5) },
          { companyId, type: "channelConnected", occurredAt: at(2) },
        ],
      });
      await prisma.user.update({ where: { id: userId }, data: { onboardingWizardCompletedAt: at(0.4) } });
      await prisma.recordSchemaRevision.create({
        data: { companyId, revision: 1, actorId: userId, snapshot: {}, createdAt: at(0.6) },
      });
    });
    await record(companyId, userId, "record.created", at(3));
    await record(companyId, userId, "record.updated", at(9));

    const row = (await read(companyId, createdAt)).get(companyId);
    if (!row) throw new Error("expected the workspace measurement");

    expect(row).toMatchObject({
      signupTemplate: "law-firm-intake",
      signupLastPage: "/en/for/law-firms",
      discoveryChoice: "other",
      discoveryDetail: "a podcast",
      agentFirstCallAt: at(1),
      funnelSetupCompletedAt: at(0.5),
      funnelChannelConnectedAt: at(2),
      wizardCompletedAt: at(0.4),
      firstModelChangeAt: at(0.6),
      firstRecordCreatedAt: at(3),
      changeInSecondWeekAt: at(9),
    });
    expect(workspaceActivation({ row, createdAt, now: new Date() })).toMatchObject({
      active: true,
      activeSince: at(9),
      notActiveBecause: null,
    });
  });

  it("counts only changes by a member or agent inside days 8 to 14", async () => {
    const createdAt = new Date(Date.now() - 30 * DAY_MS);
    const { companyId, userId } = await workspace(createdAt);
    const at = (days: number) => new Date(createdAt.getTime() + days * DAY_MS);
    await record(companyId, userId, "record.updated", at(6.9));
    await record(companyId, null, "record.updated", at(10));
    await record(companyId, userId, "record.updated", at(14.1));

    const row = (await read(companyId, createdAt)).get(companyId);

    expect(row?.changeInSecondWeekAt).toBeNull();
    expect(row?.firstRecordCreatedAt).toBeNull();
  });

  it("does not look for a second-week change before the second week has begun", async () => {
    const createdAt = new Date(Date.now() - 2 * DAY_MS);
    const { companyId, userId } = await workspace(createdAt);
    await record(companyId, userId, "record.updated", new Date());

    const row = (await read(companyId, createdAt)).get(companyId);

    expect(row?.changeInSecondWeekAt).toBeNull();
  });

  it("returns nothing for an empty list", async () => {
    const rows = await runWithoutTenant(() =>
      new PrismaOperatorBillingUsageRepo().readWorkspaceMeasurementsUnscoped([]),
    );

    expect(rows.size).toBe(0);
  });
});
