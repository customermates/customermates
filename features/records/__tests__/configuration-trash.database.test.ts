import { PermissionService } from "@/core/base/permission.service";
import type { ConfigurationChange } from "../configuration.schema";
import type { RecordScalar } from "../record-model.schema";
import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
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
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { PrismaRecordRepo } = await import("../prisma-record.repository");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("../record-access");
const { RecordCalculationService } = await import("../record-calculation.service");
const { RecordWriteService } = await import("../record-write.service");
const { RecordConfigurationService } = await import("../configuration.service");
const { RecordConfigurationWriter } = await import("../record-configuration-writer");
const { MutateRecordInteractor } = await import("../mutate-record.interactor");
const { ApplyRecordConfigurationInteractor } = await import("../configure-records.interactor");
const { PreviewRecordConfigurationInteractor } = await import("../preview-record-configuration.interactor");
const { ConfigurationTrashHandler } = await import("../configuration-trash.handler");
const { RecordTrashHandler } = await import("../record-trash.handler");
const { PrismaTrashRepo } = await import("@/features/trash/prisma-trash.repository");
const { QueryTrashInteractor } = await import("@/features/trash/query-trash.interactor");
const { RestoreTrashInteractor } = await import("@/features/trash/restore-trash.interactor");
const { PreviewTrashDeletionInteractor } = await import("@/features/trash/preview-trash-deletion.interactor");
const { DeleteTrashPermanentlyInteractor } = await import("@/features/trash/delete-trash-permanently.interactor");
const { PurgeExpiredTrashInteractor } = await import("@/features/trash/purge-expired-trash.interactor");
const { purgeCompanyTrash } = await import("@/features/trash/purge-company-trash");
const { createCrmPreset, presetId } = await import("../crm-preset");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];
const text = (value: string): RecordScalar => ({ kind: "text", value });

async function fixture() {
  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    const adminRole = await prisma.userRole.create({
      data: { companyId: company.id, name: "Administrator", isSystemRole: true },
    });
    const admin = await prisma.user.create({
      data: {
        companyId: company.id,
        roleId: adminRole.id,
        firstName: "Admin",
        lastName: "Test",
        email: `${randomUUID()}@example.test`,
        status: "active",
      },
    });
    return { company, adminRole, admin };
  });
  const admin = createMockUser({ ...seed.admin, role: { ...seed.adminRole, permissions: [] } });
  const handlers = (companyId?: string) => {
    const scoped = new PrismaRecordRepo(companyId);
    const scopedPolicy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), scoped);
    const configurations = new RecordConfigurationService(scoped);
    return [
      new ConfigurationTrashHandler(
        scoped,
        scopedPolicy,
        new PreviewRecordConfigurationInteractor(scoped, scopedPolicy, configurations),
        new ApplyRecordConfigurationInteractor(
          scoped,
          scopedPolicy,
          configurations,
          new RecordConfigurationWriter(scoped, new RecordCalculationService(scoped)),
          { dispatch: () => Promise.resolve() },
        ),
      ),
      new RecordTrashHandler(scoped, scopedPolicy, { dispatch: () => Promise.resolve() }),
    ];
  };
  const repo = new PrismaRecordRepo();
  const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo);
  const configurations = new RecordConfigurationService(repo);
  const apply = new ApplyRecordConfigurationInteractor(
    repo,
    policy,
    configurations,
    new RecordConfigurationWriter(repo, new RecordCalculationService(repo)),
    { dispatch: () => Promise.resolve() },
  );
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    new RecordWriteService(repo, policy, new RecordCalculationService(repo)),
    { dispatch: () => Promise.resolve() },
  );
  const trashRepo = new PrismaTrashRepo();
  const trash = {
    query: new QueryTrashInteractor(trashRepo, repo, handlers()),
    restore: new RestoreTrashInteractor(trashRepo, handlers()),
    preview: new PreviewTrashDeletionInteractor(trashRepo, handlers()),
    remove: new DeleteTrashPermanentlyInteractor(trashRepo, handlers()),
  };
  const id = (key: string) => presetId(seed.company.id, key);
  await runWithTenant(admin, () =>
    runInTransaction(() => repo.saveModel(createCrmPreset(seed.company.id), admin.id), { timeout: 30000 }),
  );
  const revision = () =>
    runWithoutTenant(() => prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId: seed.company.id } })).then(
      (state) => state.revision,
    );
  const change = async (operations: ConfigurationChange["operations"]): Promise<ConfigurationChange> => ({
    expectedRevision: await revision(),
    idempotencyKey: randomUUID(),
    operations,
  });
  const as = <T>(fn: () => Promise<T>, user: TenantUser = admin) => runWithTenant(user, fn);
  const items = () =>
    runWithoutTenant(() =>
      prisma.trashItem.findMany({ where: { companyId: seed.company.id }, orderBy: { deletedAt: "asc" } }),
    );
  return { seed, admin, id, apply, mutate, trash, change, as, items, handlers, revision };
}

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

describeDatabase("configuration trash", () => {
  it("moves a field to Trash with an undo batch, lists it and restores it through Trash", async () => {
    const f = await fixture();
    const fieldId = f.id("deal.notes");
    const deleted = await f.as(async () =>
      f.apply.invoke(await f.change([{ operation: "delete", target: { kind: "field", id: fieldId } }])),
    );
    if (!deleted.ok || deleted.data.status !== "completed") throw new Error(JSON.stringify(deleted));
    const [item] = await f.items();
    expect(item).toMatchObject({ kind: "field", targetId: fieldId, typeId: f.id("deal"), label: "Notes" });
    expect(item?.batchId).toBe(deleted.data.trashBatchId);
    const listed = await f.as(() => f.trash.query.invoke({ kinds: ["field"] } as never));
    expect(listed.ok && listed.data.items.map((entry) => entry.targetId)).toEqual([fieldId]);

    expect(
      await f.as(async () =>
        f.apply.invoke(await f.change([{ operation: "restore", target: { kind: "field", id: fieldId } }])),
      ),
    ).toMatchObject({ ok: false });

    expect(await f.as(() => f.trash.restore.invoke({ batchId: deleted.data.trashBatchId } as never))).toMatchObject({
      ok: true,
      data: { status: "completed", blocked: [] },
    });
    expect(await f.items()).toEqual([]);
    const model = await f.as(() => new PrismaRecordRepo().getModel());
    expect(model.fields.find((field) => field.id === fieldId)?.archived).toBe(false);
  }, 180_000);

  it("lists only the deleted list, not what was deleted with it, and deletes it permanently with exact counts", async () => {
    const f = await fixture();
    const created = await f.as(async () =>
      f.mutate.invoke({
        mutation: {
          action: "create",
          typeId: f.id("organization"),
          fields: [{ fieldId: f.id("organization.name"), value: text("T") }],
        },
        expectedRevision: await f.revision(),
        idempotencyKey: randomUUID(),
      }),
    );
    expect(created).toMatchObject({ ok: true });
    await f.as(async () =>
      f.apply.invoke(await f.change([{ operation: "delete", target: { kind: "type", id: f.id("organization") } }])),
    );
    const listed = await f.as(() =>
      f.trash.query.invoke({ kinds: ["list", "field", "relationship", "channels"] } as never),
    );
    expect(listed.ok && listed.data.items.map((entry) => [entry.kind, entry.targetId])).toEqual([
      ["list", f.id("organization")],
    ]);
    const itemIds = listed.ok ? listed.data.items.map((entry) => entry.id) : [];
    const preview = await f.as(() => f.trash.preview.invoke({ itemIds }));
    if (!preview.ok) throw new Error("Preview failed");
    expect(preview.data.removedRecords).toEqual([{ typeId: f.id("organization"), label: "Organizations", count: 1 }]);
    expect(
      await f.as(() => f.trash.remove.invoke({ itemIds, expectedImpactHash: preview.data.impactHash })),
    ).toMatchObject({ ok: true });
    expect(await f.items()).toEqual([]);
    expect(
      await runWithoutTenant(() =>
        prisma.recordTypeDefinition.count({ where: { companyId: f.seed.company.id, id: f.id("organization") } }),
      ),
    ).toBe(0);
  }, 180_000);

  it("deletes expired items permanently in the daily job, per company and idempotently", async () => {
    const f = await fixture();
    const fieldId = f.id("deal.notes");
    await f.as(async () =>
      f.apply.invoke(await f.change([{ operation: "delete", target: { kind: "field", id: fieldId } }])),
    );
    const record = await f.as(async () =>
      f.mutate.invoke({
        mutation: {
          action: "create",
          typeId: f.id("deal"),
          fields: [{ fieldId: f.id("deal.name"), value: text("Old") }],
        },
        expectedRevision: await f.revision(),
        idempotencyKey: randomUUID(),
      }),
    );
    if (!record.ok || record.data.status !== "completed") throw new Error("Fixture record failed");
    const ref = record.data.refs[0];
    await f.as(async () =>
      f.mutate.invoke({
        mutation: { action: "delete", ref, expectedVersion: 1 },
        expectedRevision: await f.revision(),
        idempotencyKey: randomUUID(),
      }),
    );
    expect(await f.items()).toHaveLength(2);
    const now = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
    const job = new PurgeExpiredTrashInteractor(
      {
        findExpiredTrashCompaniesUnscoped: async (at, limit) =>
          (await new PrismaTrashRepo().findExpiredTrashCompaniesUnscoped(at, limit * 1000)).filter(
            (due) => due.companyId === f.seed.company.id,
          ),
      },
      purgeCompanyTrash((companyId) => new PrismaTrashRepo(companyId), f.handlers),
    );
    const early = await job.invoke({ now: new Date() });
    expect(early.purged).toBe(0);
    const first = await job.invoke({ now });
    expect(first.purged).toBeGreaterThanOrEqual(2);
    expect(await f.items()).toEqual([]);
    expect(
      await runWithoutTenant(() =>
        prisma.recordFieldDefinition.count({ where: { companyId: f.seed.company.id, id: fieldId } }),
      ),
    ).toBe(0);
    expect(
      await runWithoutTenant(() =>
        prisma.crmRecord.count({ where: { companyId: f.seed.company.id, id: ref.recordId } }),
      ),
    ).toBe(0);
    expect(
      await runWithoutTenant(() =>
        prisma.eventLog.findMany({
          where: { companyId: f.seed.company.id, subjectId: ref.recordId, kind: "record.deletedPermanently" },
          select: { actorId: true },
        }),
      ),
    ).toEqual([{ actorId: null }]);
    expect((await job.invoke({ now })).purged).toBe(0);
  }, 180_000);

  it("backfills Trash items for configuration that was deleted before the migration", async () => {
    const f = await fixture();
    await f.as(async () =>
      f.apply.invoke(await f.change([{ operation: "delete", target: { kind: "field", id: f.id("deal.notes") } }])),
    );
    await f.as(async () =>
      f.apply.invoke(await f.change([{ operation: "delete", target: { kind: "type", id: f.id("organization") } }])),
    );
    const before = (await f.items()).map((item) => [item.kind, item.targetId, item.label, item.deletedById]);
    expect(before.map(([kind]) => kind)).toEqual(["field", "list"]);
    await runWithoutTenant(() => prisma.trashItem.deleteMany({ where: { companyId: f.seed.company.id } }));
    const sql = readFileSync("prisma/migrations/20261009010000_trash_configuration_backfill/migration.sql", "utf8");
    await runWithoutTenant(() => prisma.$executeRawUnsafe(sql));
    await runWithoutTenant(() => prisma.$executeRawUnsafe(sql));
    const after = await f.items();
    expect(after.map((item) => [item.kind, item.targetId, item.label, item.deletedById])).toEqual(before);
    expect(after.every((item) => item.expiresAt.getTime() > Date.now() + 29 * 24 * 60 * 60 * 1000)).toBe(true);
  }, 180_000);
});
