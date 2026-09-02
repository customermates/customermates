import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it, vi } from "vitest";

import type { Filter } from "@/core/base/base-get.schema";

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

import { PrismaOperatorAuditRepo } from "../prisma-operator-audit.repository";
import { PrismaOperatorUsersRepo } from "../prisma-operator-users.repository";
import { PrismaOperatorWorkspacesRepo } from "../prisma-operator-workspaces.repository";

const { prisma } = await import("@/prisma/db");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;

const inFilter = (field: string, value: string[]): Filter => ({ field, operator: FilterOperatorKey.in, value });
const companyIds: string[] = [];

async function seedWorkspace(args: {
  domain: string;
  plan: "starter" | "pro" | "business" | "enterprise";
  status: "trial" | "active" | "cancelled" | "expired" | "pastDue" | "unPaid";
  members: Array<{
    status?: "active" | "inactive";
    isPlatformOperator?: boolean;
    adProvider?: string;
    adIdentifierKind?: string;
    adIdentifierValue?: string;
  }>;
}) {
  const companyId = randomUUID();
  companyIds.push(companyId);
  const userIds: string[] = [];

  await runWithoutTenant(async () => {
    await prisma.company.create({ data: { id: companyId } });
    await prisma.subscription.create({
      data: {
        companyId,
        plan: args.plan,
        status: args.status,
        agentCreditAnchorAt: new Date("2026-08-01T08:00:00.000Z"),
      },
    });
    for (const [index, member] of args.members.entries()) {
      const userId = randomUUID();
      userIds.push(userId);
      await prisma.user.create({
        data: {
          id: userId,
          companyId,
          email: `member-${index}-${randomUUID()}@${args.domain}`,
          firstName: "Member",
          lastName: `${index}`,
          status: member.status ?? "active",
          isPlatformOperator: member.isPlatformOperator ?? false,
        },
      });

      if (!member.adProvider || !member.adIdentifierKind || !member.adIdentifierValue) continue;

      const clickedAt = new Date("2026-08-31T10:00:00.000Z");
      await prisma.adAttribution.create({
        data: {
          companyId,
          userId,
          provider: member.adProvider,
          identifierKind: member.adIdentifierKind,
          identifierValue: member.adIdentifierValue,
          clickedAt,
          capturedAt: clickedAt,
          consentedAt: clickedAt,
          consentNoticeVersion: "2026-09-02",
          expiresAt: new Date("2026-11-28T10:00:00.000Z"),
        },
      });
    }
  });

  return { companyId, userIds };
}

afterAll(async () => {
  await runWithoutTenant(async () => {
    for (const companyId of companyIds) {
      await prisma.user.deleteMany({ where: { companyId } });
      await prisma.subscription.deleteMany({ where: { companyId } });
      await prisma.company.deleteMany({ where: { id: companyId } });
    }
  });
  await prisma.$disconnect();
});

describeDatabase("operator user list against a real database", { timeout: 120_000 }, () => {
  it("lists across workspaces, applies subscription and boolean filters, and derives a workspace label", async () => {
    const marker = randomUUID().slice(0, 8);
    const alpha = await seedWorkspace({
      domain: `alpha-${marker}.invalid`,
      plan: "enterprise",
      status: "active",
      members: [{}, {}, { isPlatformOperator: true }],
    });
    const beta = await seedWorkspace({
      domain: `beta-${marker}.invalid`,
      plan: "starter",
      status: "pastDue",
      members: [{ status: "inactive" }],
    });

    const repo = new PrismaOperatorUsersRepo();
    const scoped = inFilter(FilterFieldKey.workspaceId, [alpha.companyId, beta.companyId]);

    const all = await runWithoutTenant(() => repo.getItems({ filters: [scoped] }));
    expect(new Set(all.map((row) => row.companyId))).toEqual(new Set([alpha.companyId, beta.companyId]));
    expect(all).toHaveLength(4);
    await expect(runWithoutTenant(() => repo.getCount({ filters: [scoped] }))).resolves.toBe(4);

    expect(all.find((row) => row.companyId === alpha.companyId)?.workspaceLabel).toBe(`alpha-${marker}.invalid`);
    expect(all.find((row) => row.companyId === beta.companyId)?.plan).toBe("starter");
    expect(all.find((row) => row.companyId === beta.companyId)?.subscriptionStatus).toBe("pastDue");

    const enterprise = await runWithoutTenant(() =>
      repo.getItems({
        filters: [scoped, inFilter(FilterFieldKey.plan, ["enterprise"])],
      }),
    );
    expect(enterprise).toHaveLength(3);
    expect(enterprise.every((row) => row.companyId === alpha.companyId)).toBe(true);

    const pastDue = await runWithoutTenant(() =>
      repo.getItems({
        filters: [scoped, inFilter(FilterFieldKey.subscriptionStatus, ["pastDue"])],
      }),
    );
    expect(pastDue).toHaveLength(1);
    expect(pastDue[0]?.companyId).toBe(beta.companyId);

    const operators = await runWithoutTenant(() =>
      repo.getItems({
        filters: [scoped, inFilter(FilterFieldKey.isPlatformOperator, ["true"])],
      }),
    );
    expect(operators).toHaveLength(1);
    expect(operators[0]?.isPlatformOperator).toBe(true);

    const nonOperators = await runWithoutTenant(() =>
      repo.getItems({
        filters: [scoped, inFilter(FilterFieldKey.isPlatformOperator, ["false"])],
      }),
    );
    expect(nonOperators).toHaveLength(3);
    expect(nonOperators.every((row) => !row.isPlatformOperator)).toBe(true);

    const inactive = await runWithoutTenant(() =>
      repo.getItems({
        filters: [scoped, inFilter(FilterFieldKey.status, ["inactive"])],
      }),
    );
    expect(inactive).toHaveLength(1);
    expect(inactive[0]?.companyId).toBe(beta.companyId);

    const searched = await runWithoutTenant(() =>
      repo.getItems({ filters: [scoped], searchTerm: `beta-${marker}.invalid` }),
    );
    expect(searched).toHaveLength(1);
    expect(searched[0]?.companyId).toBe(beta.companyId);
  });

  it("separates users by advertising provider and surfaces the provider without the raw identifier", async () => {
    const marker = randomUUID().slice(0, 8);
    const clicks = [
      { adProvider: "google_ads", adIdentifierKind: "gclid", adIdentifierValue: `gclid-${marker}` },
      { adProvider: "openai_ads", adIdentifierKind: "oppref", adIdentifierValue: `oppref-${marker}` },
    ];
    const workspace = await seedWorkspace({
      domain: `attribution-${marker}.invalid`,
      plan: "pro",
      status: "active",
      members: [...clicks, {}, {}],
    });

    const repo = new PrismaOperatorUsersRepo();
    const scoped = inFilter(FilterFieldKey.workspaceId, [workspace.companyId]);

    const google = await runWithoutTenant(() =>
      repo.getItems({ filters: [scoped, inFilter(FilterFieldKey.adProvider, ["google_ads"])] }),
    );
    expect(google).toHaveLength(1);
    expect(google[0]?.adProvider).toBe("google_ads");
    expect(google[0]?.adIdentifierKind).toBe("gclid");

    const openAi = await runWithoutTenant(() =>
      repo.getItems({ filters: [scoped, inFilter(FilterFieldKey.adProvider, ["openai_ads"])] }),
    );
    expect(openAi.map((row) => row.adIdentifierKind)).toEqual(["oppref"]);

    const either = await runWithoutTenant(() =>
      repo.getItems({ filters: [scoped, inFilter(FilterFieldKey.adProvider, ["google_ads", "openai_ads"])] }),
    );
    expect(either).toHaveLength(2);

    const unattributed = await runWithoutTenant(() =>
      repo.getItems({
        filters: [
          scoped,
          { field: FilterFieldKey.adProvider, operator: FilterOperatorKey.notIn, value: ["google_ads", "openai_ads"] },
        ],
      }),
    );
    expect(unattributed).toHaveLength(2);
    expect(unattributed.every((row) => row.adProvider === null)).toBe(true);

    await expect(
      runWithoutTenant(() =>
        repo.getCount({ filters: [scoped, inFilter(FilterFieldKey.adProvider, ["google_ads", "openai_ads"])] }),
      ),
    ).resolves.toBe(2);

    expect(JSON.stringify(either)).not.toContain(`gclid-${marker}`);
    expect(JSON.stringify(either)).not.toContain(`oppref-${marker}`);
  });
});

describeDatabase("operator workspace list against a real database", { timeout: 120_000 }, () => {
  it("aggregates members, derives label and owner, and filters by plan", async () => {
    const marker = randomUUID().slice(0, 8);
    const alpha = await seedWorkspace({
      domain: `ws-alpha-${marker}.invalid`,
      plan: "business",
      status: "active",
      members: [{}, {}, { status: "inactive" }],
    });
    const beta = await seedWorkspace({
      domain: `ws-beta-${marker}.invalid`,
      plan: "starter",
      status: "trial",
      members: [{}],
    });

    const repo = new PrismaOperatorWorkspacesRepo();
    const scoped = inFilter(FilterFieldKey.workspaceId, [alpha.companyId, beta.companyId]);

    const rows = await runWithoutTenant(() => repo.getItems({ filters: [scoped] }));
    expect(rows).toHaveLength(2);
    await expect(runWithoutTenant(() => repo.getCount({ filters: [scoped] }))).resolves.toBe(2);

    const alphaRow = rows.find((row) => row.id === alpha.companyId);
    expect(alphaRow?.workspaceLabel).toBe(`ws-alpha-${marker}.invalid`);
    expect(alphaRow?.userCount).toBe(3);
    expect(alphaRow?.activeUserCount).toBe(2);
    expect(alphaRow?.plan).toBe("business");
    expect(alphaRow?.ownerEmail).toContain(`ws-alpha-${marker}.invalid`);

    const starter = await runWithoutTenant(() =>
      repo.getItems({ filters: [scoped, inFilter(FilterFieldKey.plan, ["starter"])] }),
    );
    expect(starter).toHaveLength(1);
    expect(starter[0]?.id).toBe(beta.companyId);

    const searched = await runWithoutTenant(() =>
      repo.getItems({ filters: [scoped], searchTerm: `ws-beta-${marker}.invalid` }),
    );
    expect(searched).toHaveLength(1);
    expect(searched[0]?.id).toBe(beta.companyId);
  });
});

describeDatabase("merged operator audit log against a real database", { timeout: 120_000 }, () => {
  it("serves the unfiltered first page the list route requests", async () => {
    const repo = new PrismaOperatorAuditRepo();

    const rows = await runWithoutTenant(() =>
      repo.getItems({
        sortDescriptor: { field: "createdAt", direction: "desc" },
        pagination: { page: 1, pageSize: 25 },
      }),
    );

    expect(rows.length).toBeLessThanOrEqual(25);
    await expect(runWithoutTenant(() => repo.getCount({}))).resolves.toBeGreaterThanOrEqual(rows.length);
  });

  it("unions product and operator events, filters by source and workspace, and paginates", async () => {
    const marker = randomUUID().slice(0, 8);
    const workspace = await seedWorkspace({
      domain: `audit-${marker}.invalid`,
      plan: "pro",
      status: "active",
      members: [{}],
    });
    const actorId = workspace.userIds[0];
    const operationIds: string[] = [];

    await runWithoutTenant(async () => {
      for (let index = 0; index < 3; index += 1) {
        await prisma.auditLog.create({
          data: {
            companyId: workspace.companyId,
            userId: actorId,
            event: `contact.created.${marker}`,
            eventData: {},
            entityId: randomUUID(),
            createdAt: new Date(`2026-08-0${index + 1}T10:00:00.000Z`),
          },
        });
      }
      const readOperationId = randomUUID();
      operationIds.push(readOperationId);
      await prisma.operatorAuditEvent.create({
        data: {
          actorUserId: actorId,
          action: "operator.users.list",
          targetCompanyId: workspace.companyId,
          createdAt: new Date("2026-08-20T10:00:00.000Z"),
        },
      });
      for (let index = 0; index < 2; index += 1) {
        const operationId = randomUUID();
        operationIds.push(operationId);
        await prisma.operatorAuditEvent.create({
          data: {
            actorUserId: actorId,
            action: `operator.user_status.update.${marker}`,
            targetCompanyId: workspace.companyId,
            targetUserId: actorId,
            reason: "Exercise the merged audit log",
            createdAt: new Date(`2026-08-1${index}T10:00:00.000Z`),
          },
        });
      }
    });

    const repo = new PrismaOperatorAuditRepo();
    const scoped = inFilter(FilterFieldKey.workspaceId, [workspace.companyId]);

    const all = await runWithoutTenant(() => repo.getItems({ filters: [scoped] }));
    expect(all).toHaveLength(5);
    await expect(runWithoutTenant(() => repo.getCount({ filters: [scoped] }))).resolves.toBe(5);
    expect(all[0]?.source).toBe("operator");
    expect(all.map((row) => row.createdAt.getTime())).toEqual(
      [...all.map((row) => row.createdAt.getTime())].sort((a, b) => b - a),
    );
    expect(all.every((row) => row.workspaceLabel === `audit-${marker}.invalid`)).toBe(true);
    expect(all.find((row) => row.source === "operator")?.reason).toBe("Exercise the merged audit log");
    expect(all.find((row) => row.source === "product")?.reason).toBeNull();
    expect(all.every((row) => row.actorLabel?.includes(`audit-${marker}.invalid`))).toBe(true);
    expect(all.some((row) => row.action === "operator.users.list")).toBe(false);

    const productOnly = await runWithoutTenant(() =>
      repo.getItems({ filters: [scoped, inFilter(FilterFieldKey.auditSource, ["product"])] }),
    );
    expect(productOnly).toHaveLength(3);
    expect(productOnly.every((row) => row.source === "product")).toBe(true);

    const operatorOnly = await runWithoutTenant(() =>
      repo.getItems({ filters: [scoped, inFilter(FilterFieldKey.auditSource, ["operator"])] }),
    );
    expect(operatorOnly).toHaveLength(2);
    await expect(
      runWithoutTenant(() => repo.getCount({ filters: [scoped, inFilter(FilterFieldKey.auditSource, ["operator"])] })),
    ).resolves.toBe(2);

    const secondPage = await runWithoutTenant(() => repo.getItems({ filters: [scoped], skip: 2, take: 2 }));
    expect(secondPage).toHaveLength(2);
    expect(secondPage.map((row) => row.id)).not.toEqual(all.slice(0, 2).map((row) => row.id));
    expect(secondPage.map((row) => row.id)).toEqual(all.slice(2, 4).map((row) => row.id));

    await runWithoutTenant(async () => {
      await prisma.operatorAuditEvent.deleteMany({ where: { targetCompanyId: workspace.companyId } });
      await prisma.auditLog.deleteMany({ where: { companyId: workspace.companyId } });
    });
  });
});
