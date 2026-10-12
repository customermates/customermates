import type { RecordModel } from "../record-model.schema";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

import { getLocalDatabaseTestUrl } from "@/tests/helpers/database-test";
import { createMockUser } from "@/tests/helpers/mock-user";

vi.mock("@/env", () => ({
  env: {
    APP_MODE: "cloud",
    BASE_URL: "http://127.0.0.1:4000",
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: "test",
  },
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

const { prisma } = await import("@/prisma/db");
const { Prisma } = await import("@/generated/prisma");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { PrismaRecordRepo } = await import("../prisma-record.repository");
const { recordAccessForActor } = await import("../record-access");
const { compileRecordQuery } = await import("../record-query");
const { compileRecordGroups } = await import("../record-group-query");
const { compileRecordPathSummaries } = await import("../record-path-query");
const { compileRecordMeasure } = await import("../record-measure");
const { RecordQuerySchema } = await import("../record-query.schema");
const { RecordMeasureSchema } = await import("../record-measure.schema");
const { relationshipColumnKey, relationshipPathColumnKey } = await import("../record-column.schema");
const { createCrmPreset, presetId } = await import("../crm-preset");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

describeDatabase("trashed relationship targets", () => {
  it("are ignored by filters, groups, paths and measures even while their link is still live", async () => {
    const seed = await runWithoutTenant(async () => {
      const company = await prisma.company.create({ data: {} });
      companies.push(company.id);
      const role = await prisma.userRole.create({
        data: { companyId: company.id, name: "Administrator", isSystemRole: true },
      });
      const user = await prisma.user.create({
        data: {
          companyId: company.id,
          roleId: role.id,
          firstName: "Admin",
          lastName: "Test",
          email: `${randomUUID()}@example.test`,
          status: "active",
        },
      });
      return { company, role, user };
    });
    const companyId = seed.company.id;
    const admin = createMockUser({ ...seed.user, role: { ...seed.role, permissions: [] } });
    const repo = new PrismaRecordRepo();
    const preset = createCrmPreset(companyId);
    await runWithTenant(admin, () => runInTransaction(() => repo.saveModel(preset, admin.id), { timeout: 30000 }));
    const id = (key: string) => presetId(companyId, key);
    const pathId = randomUUID();
    const relationId = id("deal.organizations");
    const step = { relationId, direction: "outgoing" as const };
    const model: RecordModel = {
      ...preset,
      types: preset.types.map((type) =>
        type.id === id("deal")
          ? { ...type, relationshipPaths: [{ id: pathId, label: "Organizations", path: [step], archived: false }] }
          : type,
      ),
    };

    const [linkedDeal, trashOnlyDeal, liveOrganization, trashedOrganization] = [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      randomUUID(),
    ];
    await runWithoutTenant(async () => {
      await prisma.crmRecord.createMany({
        data: [
          { companyId, typeId: id("deal"), id: linkedDeal },
          { companyId, typeId: id("deal"), id: trashOnlyDeal },
          { companyId, typeId: id("organization"), id: liveOrganization },
          { companyId, typeId: id("organization"), id: trashedOrganization, deletedAt: new Date() },
        ],
      });
      await prisma.recordLink.createMany({
        data: [
          [linkedDeal, liveOrganization],
          [linkedDeal, trashedOrganization],
          [trashOnlyDeal, trashedOrganization],
        ].map(([source, target]) => ({
          companyId,
          id: randomUUID(),
          relationId,
          sourceTypeId: id("deal"),
          sourceId: source,
          targetTypeId: id("organization"),
          targetId: target,
        })),
      });
    });

    const actor = { id: seed.user.id, status: seed.user.status, role: { ...seed.role, permissions: [] } };
    const grants = await runWithTenant(admin, () => repo.getGrants());
    const policy = recordAccessForActor({ actor, grants, model, records: repo, companyId, userId: seed.user.id });
    const access = policy.access(model.types.map((type) => type.id));
    const run = <T>(sql: ReturnType<typeof compileRecordGroups>) => runWithoutTenant(() => prisma.$queryRaw<T[]>(sql));
    const matching = async (query: Record<string, unknown>) =>
      (
        await run<{ id: string }>(
          Prisma.sql`SELECT id FROM (${compileRecordQuery(companyId, RecordQuerySchema.parse({ typeId: id("deal"), ...query }), model, access).matching}) matched`,
        )
      )
        .map((row) => row.id)
        .sort();

    const relationship = (operator: "any" | "none", recordIds: string[] | null) => ({
      relationships: [{ ...step, operator, recordIds }],
    });
    expect(await matching(relationship("any", [trashedOrganization]))).toEqual([]);
    expect(await matching(relationship("any", null))).toEqual([linkedDeal]);
    expect(await matching(relationship("none", null))).toEqual([trashOnlyDeal]);
    expect(await matching(relationship("none", [trashedOrganization]))).toEqual([linkedDeal, trashOnlyDeal].sort());
    const related = (recordIds: string[]) => ({
      relatedFilters: [{ path: [step], operator: "any", filters: [], recordIds }],
    });
    expect(await matching(related([trashedOrganization]))).toEqual([]);
    expect(await matching(related([liveOrganization]))).toEqual([linkedDeal]);

    for (const field of [relationshipColumnKey(relationId, "outgoing"), relationshipPathColumnKey(pathId)]) {
      const groups = await run<{ key: string; itemIds: string[]; restricted: boolean }>(
        compileRecordGroups(
          companyId,
          RecordQuerySchema.parse({ typeId: id("deal"), grouping: { field } }),
          model,
          access,
          { userId: seed.user.id, access: "all" },
        ),
      );
      expect(
        groups.some((group) => group.key.includes(trashedOrganization)),
        field,
      ).toBe(false);
      expect(
        groups.some((group) => group.restricted),
        field,
      ).toBe(false);
      const live = groups.find((group) => group.key.includes(liveOrganization));
      expect(live?.itemIds, field).toEqual([linkedDeal]);
      expect(groups.flatMap((group) => group.itemIds).sort(), field).toEqual([linkedDeal, trashOnlyDeal].sort());
    }

    const pathSql = compileRecordPathSummaries(
      companyId,
      id("deal"),
      [linkedDeal, trashOnlyDeal],
      [{ pathId, limit: 5 }],
      model,
      access,
    );
    if (!pathSql) throw new Error("Expected a path query");
    const paths = await run<{ ownerId: string; recordId: string; readableCount: number }>(pathSql);
    expect(paths.map((row) => [row.ownerId, row.recordId, row.readableCount])).toEqual([
      [linkedDeal, liveOrganization, 1],
    ]);

    const measure = await run<{ groupRecordId: string | null; groupState: string; count: number }>(
      compileRecordMeasure(
        companyId,
        RecordMeasureSchema.parse({
          source: { typeId: id("deal") },
          aggregation: "count",
          valueFieldId: null,
          groupBy: { path: [step], fieldId: null },
        }),
        model,
        access,
      ),
    );
    const grouped = measure.filter((row) => row.groupRecordId !== null || row.groupState !== "value");
    expect(grouped.some((row) => row.groupRecordId === trashedOrganization)).toBe(false);
    expect(grouped.some((row) => row.groupState === "restricted")).toBe(false);
    expect(grouped.find((row) => row.groupRecordId === liveOrganization)?.count).toBe(1);
  });
});
