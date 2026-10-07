import { PermissionService } from "@/core/base/permission.service";
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

const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { PrismaRecordRepo } = await import("@/features/records/prisma-record.repository");
const { createCrmPreset, presetId } = await import("@/features/records/crm-preset");
const { PrismaRecordActivitiesRepo } = await import("@/ee/messaging/activities/prisma-record-activities.repository");
const { configurationActivity } = await import("@/ee/messaging/activities/configuration-activity");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

describeDatabase("configuration history labels", () => {
  it("names a deleted list from the stored revision snapshots, not the live model", async () => {
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
          firstName: "History",
          lastName: "Test",
          email: `${company.id}@example.test`,
          status: "active",
        },
      });
      return { company, role, user };
    });
    const admin = createMockUser({ ...seed.user, role: { ...seed.role, permissions: [] } });
    const repo = new PrismaRecordRepo();
    await runWithTenant(admin, () =>
      runInTransaction(() => repo.saveModel(createCrmPreset(seed.company.id), admin.id), { timeout: 30000 }),
    );
    const serviceTypeId = presetId(seed.company.id, "service");
    const before = await runWithTenant(admin, () => repo.getModel());
    const after = {
      ...before,
      revision: before.revision + 1,
      types: before.types.filter((type) => type.id !== serviceTypeId),
      fields: before.fields.filter((field) => field.typeId !== serviceTypeId),
    };
    await runWithoutTenant(() =>
      prisma.recordSchemaRevision.create({
        data: {
          companyId: seed.company.id,
          revision: after.revision,
          actorId: seed.user.id,
          snapshot: JSON.parse(JSON.stringify(after)),
          change: {
            version: 1,
            source: { kind: "configuration" },
            causeId: "history-labels",
            expectedRevision: before.revision,
            configuration: {
              expectedRevision: before.revision,
              idempotencyKey: "history-labels",
              operations: [{ operation: "deleteType", typeId: serviceTypeId }],
            },
            references: [],
            grants: [],
          },
        },
      }),
    );

    const loaded = await runWithTenant(admin, () =>
      runInTransaction(() =>
        new PrismaRecordActivitiesRepo(new PermissionService()).configurationsCompanyWide([String(after.revision)]),
      ),
    );

    expect(loaded.revisions).toHaveLength(1);
    const [revision] = loaded.revisions;
    expect(revision.models.map((model) => model.revision)).toEqual([after.revision, before.revision]);
    expect(configurationActivity(revision.change, revision.models, loaded.roleNames).changes).toEqual([
      { field: "deleteType", snapshot: true, previous: undefined, current: "Services" },
    ]);
  }, 120_000);
});
