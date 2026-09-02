import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import type { OperatorActor } from "@/core/decorators/operator-context";

import { runWithOperator } from "@/core/decorators/operator-context";
import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    DATABASE_URL: process.env.DATABASE_URL,
    HOSTED_AI_OPERATOR_CONTROLS_ENABLED: true,
    NODE_ENV: "test",
  },
}));

import type { OperatorRefusal } from "../operator.repo";
import { PrismaOperatorRepo } from "../prisma-operator.repository";

const OPERATOR_REFUSALS: OperatorRefusal[] = [
  "conflict",
  "notFound",
  "unavailable",
  "allowanceMissing",
  "connectedAccountsActive",
];

function assertAdmitted<T>(result: T | OperatorRefusal): asserts result is T {
  const refusal = OPERATOR_REFUSALS.find((candidate) => candidate === result);
  if (refusal) throw new Error(`Expected statistics but the repository refused with "${refusal}".`);
}

const { prisma } = await import("@/prisma/db");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companyIds: string[] = [];
const actorIds: string[] = [];

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

async function channelEvent(args: {
  companyId: string;
  userId: string;
  accountId: string;
  provider: string;
  identifier: string;
  event: "connected_account.created" | "connected_account.deleted";
  at: Date;
}) {
  await prisma.auditLog.create({
    data: {
      companyId: args.companyId,
      userId: args.userId,
      entityId: args.accountId,
      event: args.event,
      createdAt: args.at,
      eventData: {
        companyId: args.companyId,
        userId: args.userId,
        entityId: args.accountId,
        payload: { provider: args.provider, displayName: args.identifier, emailAddress: null },
      },
    },
  });
}

afterAll(async () => {
  await runWithoutTenant(async () => {
    await prisma.operatorAuditEvent.deleteMany({ where: { actorUserId: { in: actorIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });
  await prisma.$disconnect();
});

describeDatabase("operator workspace channel history", { timeout: 120_000 }, () => {
  it("reports the monthly peak of simultaneously connected channels with their identifiers", async () => {
    const repo = new PrismaOperatorRepo();
    const companyId = randomUUID();
    companyIds.push(companyId);
    const userId = randomUUID();

    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      await prisma.user.create({
        data: {
          id: userId,
          companyId,
          email: `channels-${randomUUID()}@example.invalid`,
          firstName: "Channel",
          lastName: "Probe",
          status: "active",
        },
      });

      const overlapA = randomUUID();
      const overlapB = randomUUID();
      const laterOnly = randomUUID();

      await channelEvent({
        companyId,
        userId,
        accountId: overlapA,
        provider: "whatsapp",
        identifier: "+4917600000001",
        event: "connected_account.created",
        at: new Date("2026-03-02T10:00:00.000Z"),
      });
      await channelEvent({
        companyId,
        userId,
        accountId: overlapB,
        provider: "linkedin",
        identifier: "Probe Person",
        event: "connected_account.created",
        at: new Date("2026-03-05T10:00:00.000Z"),
      });
      await channelEvent({
        companyId,
        userId,
        accountId: overlapA,
        provider: "whatsapp",
        identifier: "+4917600000001",
        event: "connected_account.deleted",
        at: new Date("2026-03-20T10:00:00.000Z"),
      });
      await channelEvent({
        companyId,
        userId,
        accountId: overlapB,
        provider: "linkedin",
        identifier: "Probe Person",
        event: "connected_account.deleted",
        at: new Date("2026-03-25T10:00:00.000Z"),
      });
      await channelEvent({
        companyId,
        userId,
        accountId: laterOnly,
        provider: "google",
        identifier: "probe@example.invalid",
        event: "connected_account.created",
        at: new Date("2026-04-04T10:00:00.000Z"),
      });
      await channelEvent({
        companyId,
        userId,
        accountId: laterOnly,
        provider: "google",
        identifier: "probe@example.invalid",
        event: "connected_account.deleted",
        at: new Date("2026-04-20T10:00:00.000Z"),
      });
    });

    const stats = await runWithOperator(operatorActor(), () => repo.getWorkspaceStatsUnscoped({ companyId }));
    assertAdmitted(stats);

    const march = stats.channelMonths.find((entry) => entry.month === "2026-03");
    const april = stats.channelMonths.find((entry) => entry.month === "2026-04");

    expect(march?.peakConcurrent).toBe(2);
    expect(march?.approximate).toBe(false);
    expect(march?.channels.map((channel) => channel.identifier).sort()).toEqual(["+4917600000001", "Probe Person"]);
    expect(march?.channels.map((channel) => channel.provider).sort()).toEqual(["linkedin", "whatsapp"]);

    expect(april?.peakConcurrent).toBe(1);
    expect(april?.channels).toEqual([{ provider: "google", identifier: "probe@example.invalid" }]);
  });

  it("marks a month approximate when a disconnect was never recorded", async () => {
    const repo = new PrismaOperatorRepo();
    const companyId = randomUUID();
    companyIds.push(companyId);
    const userId = randomUUID();

    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      await prisma.user.create({
        data: {
          id: userId,
          companyId,
          email: `open-${randomUUID()}@example.invalid`,
          firstName: "Open",
          lastName: "Probe",
          status: "active",
        },
      });
      await channelEvent({
        companyId,
        userId,
        accountId: randomUUID(),
        provider: "mail",
        identifier: "orphan@example.invalid",
        event: "connected_account.created",
        at: new Date("2026-05-06T10:00:00.000Z"),
      });
    });

    const stats = await runWithOperator(operatorActor(), () => repo.getWorkspaceStatsUnscoped({ companyId }));
    assertAdmitted(stats);

    const may = stats.channelMonths.find((entry) => entry.month === "2026-05");
    expect(may?.peakConcurrent).toBe(1);
    expect(may?.approximate).toBe(true);
  });

  it("returns no channel months for a workspace that never connected one", async () => {
    const repo = new PrismaOperatorRepo();
    const companyId = randomUUID();
    companyIds.push(companyId);

    await runWithoutTenant(() => prisma.company.create({ data: { id: companyId } }));

    const stats = await runWithOperator(operatorActor(), () => repo.getWorkspaceStatsUnscoped({ companyId }));
    assertAdmitted(stats);

    expect(stats.channelMonths).toEqual([]);
  });
});
