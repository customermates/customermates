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

const OPERATOR_REFUSALS: OperatorRefusal[] = [
  "conflict",
  "notFound",
  "unavailable",
  "allowanceMissing",
  "connectedAccountsActive",
  "trialEndRequired",
];

function assertAdmitted<T>(result: T | OperatorRefusal): asserts result is T {
  const refusal = OPERATOR_REFUSALS.find((candidate) => candidate === result);
  if (refusal) throw new Error(`Expected statistics but the repository refused with "${refusal}".`);
}

const { prisma } = await import("@/prisma/db");
const { createTestOperatorRepo } = await import("@/tests/helpers/prisma-operator-repo");

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

afterAll(async () => {
  await runWithoutTenant(async () => {
    await prisma.operatorAuditEvent.deleteMany({ where: { actorUserId: { in: actorIds } } });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
  });
  await prisma.$disconnect();
});

describeDatabase("operator workspace statistics", { timeout: 120_000 }, () => {
  it("counts live lists and the ordinary records in them whatever the workspace calls them", async () => {
    const repo = createTestOperatorRepo();
    const companyId = randomUUID();
    companyIds.push(companyId);
    const [projects, positions, retired] = [randomUUID(), randomUUID(), randomUUID()];

    await runWithoutTenant(async () => {
      await prisma.company.create({ data: { id: companyId } });
      await prisma.recordTypeDefinition.createMany({
        data: [
          { companyId, id: projects, label: "Project", pluralLabel: "Projects", definition: {} },
          { companyId, id: positions, label: "Position", pluralLabel: "Positions", embedded: true, definition: {} },
          { companyId, id: retired, label: "Retired", pluralLabel: "Retired", archived: true, definition: {} },
        ],
      });
      await prisma.crmRecord.createMany({
        data: [
          { companyId, typeId: projects },
          { companyId, typeId: projects },
          { companyId, typeId: positions },
          { companyId, typeId: projects, deletedAt: new Date() },
          { companyId, typeId: retired },
        ],
      });
    });

    const stats = await runWithOperator(operatorActor(), () => repo.getWorkspaceStatsUnscoped({ companyId }));
    assertAdmitted(stats);

    expect(stats).toMatchObject({ lists: 1, records: 2 });
  });
});
