import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import type { Filter } from "@/core/base/base-get.schema";
import type { OperatorActor } from "@/core/decorators/operator-context";

import { runWithOperator } from "@/core/decorators/operator-context";
import { runWithoutTenant } from "@/core/decorators/tenant-context";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";

const operatorEnv = vi.hoisted(() => ({
  APP_MODE: "cloud",
  DATABASE_URL: process.env.DATABASE_URL,
  HOSTED_AI_OPERATOR_CONTROLS_ENABLED: true,
  NODE_ENV: "test",
}));

vi.mock("@/env", () => ({ env: operatorEnv }));

import type { OperatorRefusal } from "../operator.repo";
import { OPERATOR_AUDIT_ACTION } from "../operator.schema";
import { PrismaOperatorRepo } from "../prisma-operator.repository";
import { PrismaOperatorUsersRepo } from "../prisma-operator-users.repository";
import { PrismaOperatorWorkspacesRepo } from "../prisma-operator-workspaces.repository";

const { prisma } = await import("@/prisma/db");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

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
  if (refusal) throw new Error(`Expected a tag result but the repository refused with "${refusal}".`);
}

const inFilter = (field: string, value: string[]): Filter => ({ field, operator: FilterOperatorKey.in, value });
const notInFilter = (field: string, value: string[]): Filter => ({
  field,
  operator: FilterOperatorKey.notIn,
  value,
});

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

async function seedWorkspace(args: { domain: string; tags?: string[] }) {
  const companyId = randomUUID();
  companyIds.push(companyId);
  const userId = randomUUID();

  await runWithoutTenant(async () => {
    await prisma.company.create({ data: { id: companyId, tags: args.tags ?? [] } });
    await prisma.user.create({
      data: {
        id: userId,
        companyId,
        email: `member-${randomUUID()}@${args.domain}`,
        firstName: "Member",
        lastName: "One",
        status: "active",
      },
    });
  });

  return { companyId, userId };
}

afterAll(async () => {
  await runWithoutTenant(async () => {
    await prisma.operatorAuditEvent.deleteMany({ where: { actorUserId: { in: actorIds } } });
    for (const companyId of companyIds) {
      await prisma.user.deleteMany({ where: { companyId } });
      await prisma.subscription.deleteMany({ where: { companyId } });
      await prisma.company.deleteMany({ where: { id: companyId } });
    }
  });
  await prisma.$disconnect();
});

describeDatabase("operator workspace tags", { timeout: 120_000 }, () => {
  it("normalizes the tags it stores and records the previous and next values in the audit trail", async () => {
    const repo = new PrismaOperatorRepo();
    const { companyId } = await seedWorkspace({ domain: `tags-${randomUUID()}.invalid`, tags: ["Legacy"] });
    const actor = operatorActor();

    const result = await runWithOperator(actor, () =>
      repo.updateWorkspaceTagsUnscoped({
        companyId,
        tags: ["  ProspeIQ  ", "prospeiq", "Acme   Group", "Legacy"],
        reason: "reseller assignment",
      }),
    );
    assertAdmitted(result);

    expect(result.tags).toEqual(["Acme Group", "Legacy", "ProspeIQ"]);

    const stored = await runWithoutTenant(() =>
      prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { tags: true } }),
    );
    expect(stored.tags).toEqual(["Acme Group", "Legacy", "ProspeIQ"]);

    const audit = await runWithoutTenant(() =>
      prisma.operatorAuditEvent.findFirstOrThrow({
        where: { actorUserId: actor.userId, action: OPERATOR_AUDIT_ACTION.workspaceTagsUpdate },
      }),
    );
    expect(audit.targetCompanyId).toBe(companyId);
    expect(audit.reason).toBe("reseller assignment");
    expect(audit.metadata).toMatchObject({
      previous: ["Legacy"],
      next: ["Acme Group", "Legacy", "ProspeIQ"],
      added: ["Acme Group", "ProspeIQ"],
      removed: [],
    });
  });

  it("records the removed tags when tags are cleared", async () => {
    const repo = new PrismaOperatorRepo();
    const { companyId } = await seedWorkspace({ domain: `clear-${randomUUID()}.invalid`, tags: ["Acme", "Zeta"] });
    const actor = operatorActor();

    const result = await runWithOperator(actor, () => repo.updateWorkspaceTagsUnscoped({ companyId, tags: [] }));
    assertAdmitted(result);
    expect(result.tags).toEqual([]);

    const audit = await runWithoutTenant(() =>
      prisma.operatorAuditEvent.findFirstOrThrow({
        where: { actorUserId: actor.userId, action: OPERATOR_AUDIT_ACTION.workspaceTagsUpdate },
      }),
    );
    expect(audit.metadata).toMatchObject({
      previous: ["Acme", "Zeta"],
      next: [],
      added: [],
      removed: ["Acme", "Zeta"],
    });
  });

  it("refuses to tag a workspace that does not exist", async () => {
    const repo = new PrismaOperatorRepo();

    const result = await runWithOperator(operatorActor(), () =>
      repo.updateWorkspaceTagsUnscoped({ companyId: randomUUID(), tags: ["Acme"] }),
    );

    expect(result).toBe("notFound");
  });

  it("lists the distinct tags in use for the filter picker", async () => {
    const repo = new PrismaOperatorRepo();
    const marker = randomUUID().slice(0, 8);
    await seedWorkspace({ domain: `one-${marker}.invalid`, tags: [`Zeta ${marker}`, `Acme ${marker}`] });
    await seedWorkspace({ domain: `two-${marker}.invalid`, tags: [`Acme ${marker}`] });

    const tags = await runWithOperator(operatorActor(), () => repo.listWorkspaceTagsUnscoped());
    const mine = tags.filter((tag) => tag.endsWith(marker));

    expect(mine).toEqual([`Acme ${marker}`, `Zeta ${marker}`]);
  });

  it("orders tags case-insensitively so lowercase names are not pushed to the end", async () => {
    const repo = new PrismaOperatorRepo();
    const { companyId } = await seedWorkspace({ domain: `order-${randomUUID()}.invalid` });

    const result = await runWithOperator(operatorActor(), () =>
      repo.updateWorkspaceTagsUnscoped({ companyId, tags: ["ProspeIQ", "acme group", "Zeta"] }),
    );
    assertAdmitted(result);

    expect(result.tags).toEqual(["acme group", "ProspeIQ", "Zeta"]);
  });

  it("filters the workspace list by tag and negates it", async () => {
    const marker = randomUUID().slice(0, 8);
    const tagged = await seedWorkspace({ domain: `tagged-${marker}.invalid`, tags: [`Reseller ${marker}`] });
    const other = await seedWorkspace({ domain: `other-${marker}.invalid`, tags: [`Direct ${marker}`] });
    const untagged = await seedWorkspace({ domain: `plain-${marker}.invalid` });

    const repo = new PrismaOperatorWorkspacesRepo();
    const scoped = inFilter(FilterFieldKey.workspaceId, [tagged.companyId, other.companyId, untagged.companyId]);

    const matching = await runWithoutTenant(() =>
      repo.getItems({ filters: [scoped, inFilter(FilterFieldKey.workspaceTags, [`Reseller ${marker}`])] }),
    );
    expect(matching.map((row) => row.id)).toEqual([tagged.companyId]);
    expect(matching[0]?.tags).toEqual([`Reseller ${marker}`]);

    const count = await runWithoutTenant(() =>
      repo.getCount({ filters: [scoped, inFilter(FilterFieldKey.workspaceTags, [`Reseller ${marker}`])] }),
    );
    expect(count).toBe(1);

    const excluded = await runWithoutTenant(() =>
      repo.getItems({ filters: [scoped, notInFilter(FilterFieldKey.workspaceTags, [`Reseller ${marker}`])] }),
    );
    expect(excluded.map((row) => row.id).sort()).toEqual([other.companyId, untagged.companyId].sort());
  });

  it("carries the workspace tags onto the user list and filters users by them", async () => {
    const marker = randomUUID().slice(0, 8);
    const tagged = await seedWorkspace({ domain: `users-${marker}.invalid`, tags: [`Reseller ${marker}`] });
    const untagged = await seedWorkspace({ domain: `plainusers-${marker}.invalid` });

    const repo = new PrismaOperatorUsersRepo();
    const scoped = inFilter(FilterFieldKey.workspaceId, [tagged.companyId, untagged.companyId]);

    const all = await runWithoutTenant(() => repo.getItems({ filters: [scoped] }));
    expect(all.find((row) => row.companyId === tagged.companyId)?.workspaceTags).toEqual([`Reseller ${marker}`]);
    expect(all.find((row) => row.companyId === untagged.companyId)?.workspaceTags).toEqual([]);

    const filtered = await runWithoutTenant(() =>
      repo.getItems({ filters: [scoped, inFilter(FilterFieldKey.workspaceTags, [`Reseller ${marker}`])] }),
    );
    expect(filtered.map((row) => row.companyId)).toEqual([tagged.companyId]);

    const filteredCount = await runWithoutTenant(() =>
      repo.getCount({ filters: [scoped, inFilter(FilterFieldKey.workspaceTags, [`Reseller ${marker}`])] }),
    );
    expect(filteredCount).toBe(1);
  });

  it("keeps listing users when one workspace carries a credit anchor in the future", async () => {
    const marker = randomUUID().slice(0, 8);
    const sane = await seedWorkspace({ domain: `sane-${marker}.invalid` });
    const skewed = await seedWorkspace({ domain: `skewed-${marker}.invalid` });

    await runWithoutTenant(async () => {
      await prisma.subscription.create({
        data: { companyId: sane.companyId, plan: "starter", status: "active" },
      });
      await prisma.subscription.create({
        data: {
          companyId: skewed.companyId,
          plan: "starter",
          status: "active",
          agentCreditAnchorAt: new Date(Date.now() + 86_400_000),
        },
      });
    });

    const repo = new PrismaOperatorUsersRepo();
    const scoped = inFilter(FilterFieldKey.workspaceId, [sane.companyId, skewed.companyId]);

    const rows = await runWithoutTenant(() => repo.getItems({ filters: [scoped] }));

    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.companyId === skewed.companyId)?.creditsLimit).toBeNull();
    expect(rows.find((row) => row.companyId === sane.companyId)?.creditsLimit).not.toBeNull();
  });

  it("combines a tag filter with a plan filter instead of dropping one of them", async () => {
    const marker = randomUUID().slice(0, 8);
    const tagged = await seedWorkspace({ domain: `combo-${marker}.invalid`, tags: [`Reseller ${marker}`] });
    const other = await seedWorkspace({ domain: `combofree-${marker}.invalid`, tags: [`Reseller ${marker}`] });

    await runWithoutTenant(async () => {
      await prisma.subscription.create({
        data: { companyId: tagged.companyId, plan: "enterprise", status: "active" },
      });
      await prisma.subscription.create({ data: { companyId: other.companyId, plan: "starter", status: "active" } });
    });

    const repo = new PrismaOperatorUsersRepo();
    const scoped = inFilter(FilterFieldKey.workspaceId, [tagged.companyId, other.companyId]);

    const rows = await runWithoutTenant(() =>
      repo.getItems({
        filters: [
          scoped,
          inFilter(FilterFieldKey.workspaceTags, [`Reseller ${marker}`]),
          inFilter(FilterFieldKey.plan, ["enterprise"]),
        ],
      }),
    );

    expect(rows.map((row) => row.companyId)).toEqual([tagged.companyId]);
  });
});
