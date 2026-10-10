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
const { WebhookPauseNotifier } = await import("@/features/webhook/webhook-pause-notifier");
const { MutateRecordInteractor } = await import("../mutate-record.interactor");
const { ApplyRecordConfigurationInteractor } = await import("../configure-records.interactor");
const { PreviewRecordConfigurationInteractor } = await import("../preview-record-configuration.interactor");
const { ConfigurationTrashHandler } = await import("../configuration-trash.handler");
const { RecordTrashHandler } = await import("../record-trash.handler");
const { PrismaTrashRepo } = await import("@/features/trash/prisma-trash.repository");
const { QueryTrashInteractor } = await import("@/features/trash/query-trash.interactor");
const { RestoreTrashInteractor } = await import("@/features/trash/restore-trash.interactor");
const { PreviewTrashDeletionInteractor } = await import("@/features/trash/preview-trash-deletion.interactor");
const { DeleteTrashPermanentlyInteractor, purgeTrashItems } = await import(
  "@/features/trash/delete-trash-permanently.interactor"
);
const { EmptyTrashInteractor } = await import("@/features/trash/empty-trash.interactor");
const { Prisma } = await import("@/generated/prisma");

const noWebhooks = new WebhookPauseNotifier(
  { getWebhookByIdOrThrow: () => Promise.reject(new Error("No webhook expected")) },
  { publish: () => Promise.resolve() },
);
const { PurgeExpiredTrashInteractor } = await import("@/features/trash/purge-expired-trash.interactor");
const { purgeExpiredCompanyTrash } = await import("@/features/trash/purge-company-trash");
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
          new RecordConfigurationWriter(scoped, new RecordCalculationService(scoped), noWebhooks),
          { dispatch: () => Promise.resolve() },
        ),
        new PrismaTrashRepo(companyId),
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
    new RecordConfigurationWriter(repo, new RecordCalculationService(repo), noWebhooks),
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
    empty: new EmptyTrashInteractor(trashRepo, policy, handlers()),
  };
  const id = (key: string) => presetId(seed.company.id, key);
  const employer = randomUUID();
  await runWithTenant(admin, () =>
    runInTransaction(
      () => {
        const model = createCrmPreset(seed.company.id);
        model.relationships.push({
          id: employer,
          sourceTypeId: id("contact"),
          targetTypeId: id("organization"),
          sourceLabel: "Employer",
          targetLabel: "Staff",
          sourceCardinality: "many",
          targetCardinality: "many",
          onSourceDelete: "unlink",
          onTargetDelete: "cascade",
          messagesOnSource: false,
          messagesOnTarget: false,
          archived: false,
        });
        return repo.saveModel(model, admin.id);
      },
      { timeout: 30000 },
    ),
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
  const create = async (
    typeKey: string,
    fieldKey: string,
    name: string,
    links: Array<{ relationId: string; record: { typeId: string; recordId: string } }> = [],
  ) => {
    const typeId = id(typeKey);
    const result = await runWithTenant(admin, async () =>
      mutate.invoke({
        mutation: {
          action: "create",
          typeId,
          fields: [{ fieldId: id(fieldKey), value: text(name) }],
          links: links.map((link) => ({ ...link, direction: "outgoing" as const })),
        },
        expectedRevision: await revision(),
        idempotencyKey: randomUUID(),
      }),
    );
    if (!result.ok || result.data.status !== "completed") throw new Error(JSON.stringify(result));
    return result.data.refs.find((ref) => ref.typeId === typeId) as { typeId: string; recordId: string };
  };
  return { seed, admin, id, employer, apply, mutate, trash, change, as, items, handlers, revision, create };
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

    const batchId = deleted.data.trashBatchId;
    expect(await f.as(() => f.trash.restore.invoke({ batchId } as never))).toMatchObject({
      ok: true,
      data: { status: "completed", blocked: [] },
    });
    expect(await f.items()).toEqual([]);
    const model = await f.as(() => new PrismaRecordRepo().getModel());
    expect(model.fields.find((field) => field.id === fieldId)?.archived).toBe(false);
  }, 180_000);

  it("restores a deleted list through Trash", async () => {
    const f = await fixture();
    const deleted = await f.as(async () =>
      f.apply.invoke(await f.change([{ operation: "delete", target: { kind: "type", id: f.id("organization") } }])),
    );
    if (!deleted.ok || deleted.data.status !== "completed") throw new Error(JSON.stringify(deleted));
    const batchId = deleted.data.trashBatchId;
    const restored = await f.as(() => f.trash.restore.invoke({ batchId } as never));
    expect(restored).toMatchObject({ ok: true, data: { status: "completed", blocked: [] } });
    const model = await f.as(() => new PrismaRecordRepo().getModel());
    expect(model.types.find((type) => type.id === f.id("organization"))?.archived).toBe(false);
    expect(await f.items()).toEqual([]);
  }, 180_000);

  it("keeps a deleted list's bindings and gives a deleted field its binding back through Trash", async () => {
    const f = await fixture();
    const avatar = () =>
      f.as(async () =>
        (await new PrismaRecordRepo().getModel()).capabilities.find(
          (binding) => binding.kind === "avatar" && binding.typeId === f.id("contact"),
        ),
      );
    const remove = async (kind: "field" | "type", id: string) => {
      const result = await f.as(async () =>
        f.apply.invoke(await f.change([{ operation: "delete", target: { kind, id } }])),
      );
      if (!result.ok || result.data.status !== "completed" || !result.data.trashBatchId)
        throw new Error(JSON.stringify(result));

      return result.data.trashBatchId;
    };
    const restore = async (batchId: string) =>
      expect(await f.as(() => f.trash.restore.invoke({ batchId } as never))).toMatchObject({
        ok: true,
        data: { status: "completed", blocked: [] },
      });
    const image = [{ role: "image", fieldId: f.id("contact.avatarUrl") }];

    await restore(await remove("type", f.id("contact")));
    expect((await avatar())?.fields).toEqual(image);

    await remove("field", f.id("contact.avatarUrl"));
    expect((await avatar())?.fields ?? []).toEqual([]);
    const [item] = await f.items();
    expect(item).toMatchObject({ kind: "field", targetId: f.id("contact.avatarUrl") });
    await restore(item.batchId);
    expect((await avatar())?.fields).toEqual(image);
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

  it("purges trashed records of a permanently deleted list through Trash, cascaded records in other lists included", async () => {
    const f = await fixture();
    const organization = await f.create("organization", "organization.name", "Erased Org");
    const contact = await f.create("contact", "contact.firstName", "Erased Staff", [
      { relationId: f.employer, record: organization },
    ]);
    const { version } = await runWithoutTenant(() =>
      prisma.crmRecord.findUniqueOrThrow({
        where: {
          companyId_typeId_id: { companyId: f.seed.company.id, typeId: organization.typeId, id: organization.recordId },
        },
        select: { version: true },
      }),
    );
    await f.as(async () =>
      f.mutate.invoke({
        mutation: { action: "delete", ref: organization, expectedVersion: version },
        expectedRevision: await f.revision(),
        idempotencyKey: randomUUID(),
      }),
    );
    expect(
      await runWithoutTenant(() =>
        prisma.crmRecord.findUnique({
          where: {
            companyId_typeId_id: { companyId: f.seed.company.id, typeId: contact.typeId, id: contact.recordId },
          },
          select: { deletedAt: true },
        }),
      ),
    ).toMatchObject({ deletedAt: expect.any(Date) });
    await f.as(async () =>
      f.apply.invoke(await f.change([{ operation: "delete", target: { kind: "type", id: f.id("organization") } }])),
    );
    const listed = await f.as(() => f.trash.query.invoke({ kinds: ["list"] } as never));
    const itemIds = listed.ok ? listed.data.items.map((item) => item.id) : [];
    const preview = await f.as(() => f.trash.preview.invoke({ itemIds }));
    if (!preview.ok) throw new Error("Preview failed");
    expect(preview.data.removedRecords).toEqual([{ typeId: f.id("organization"), label: "Organizations", count: 2 }]);
    expect(
      await f.as(() => f.trash.remove.invoke({ itemIds, expectedImpactHash: preview.data.impactHash })),
    ).toMatchObject({ ok: true });
    expect(
      await runWithoutTenant(() =>
        prisma.crmRecord.count({
          where: { companyId: f.seed.company.id, id: { in: [organization.recordId, contact.recordId] } },
        }),
      ),
    ).toBe(0);
    const events = await runWithoutTenant(() =>
      prisma.eventLog.findMany({
        where: { companyId: f.seed.company.id, subjectId: { in: [organization.recordId, contact.recordId] } },
        select: { subjectId: true, kind: true, payload: true },
      }),
    );
    expect(
      events
        .filter((event) => event.kind === "record.deletedPermanently")
        .map((event) => event.subjectId)
        .sort(),
    ).toEqual([organization.recordId, contact.recordId].sort());
    expect(JSON.stringify(events)).not.toContain("Erased");
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
    const dispatched: unknown[] = [];
    const job = new PurgeExpiredTrashInteractor(
      {
        findExpiredTrashCompaniesUnscoped: async (at, after, limit) =>
          (await new PrismaTrashRepo().findExpiredTrashCompaniesUnscoped(at, after, limit * 1000)).filter(
            (due) => due.companyId === f.seed.company.id,
          ),
      },
      {
        dispatch: (_id, payload) => {
          dispatched.push(payload);
          return Promise.resolve();
        },
      },
    );
    expect(await job.invoke({ now: new Date() })).toEqual({ dispatched: [], skipped: [] });
    expect(await job.invoke({ now })).toEqual({ dispatched: [f.seed.company.id], skipped: [] });
    expect(dispatched).toEqual([{ companyId: f.seed.company.id, actorUserId: f.admin.id, now: now.toISOString() }]);
    const purge = () =>
      f.as(() => purgeExpiredCompanyTrash(new PrismaTrashRepo(f.seed.company.id), f.handlers(f.seed.company.id), now));
    expect(await purge()).toEqual({ next: null, deleted: 2, pending: 0, failed: 0 });
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
    expect(await purge()).toEqual({ next: null, deleted: 0, pending: 0, failed: 0 });
    expect(await job.invoke({ now })).toEqual({ dispatched: [], skipped: [] });
  }, 180_000);

  it("clears the item of a relationship whose other list is deleted permanently, so no orphan remains", async () => {
    const f = await fixture();
    await f.as(async () =>
      f.apply.invoke(await f.change([{ operation: "delete", target: { kind: "relationship", id: f.employer } }])),
    );
    await f.as(async () =>
      f.apply.invoke(await f.change([{ operation: "delete", target: { kind: "type", id: f.id("organization") } }])),
    );
    const list = (await f.items()).find((item) => item.kind === "list");
    expect((await f.items()).map((item) => item.kind)).toEqual(["relationship", "list"]);
    const preview = await f.as(() => f.trash.preview.invoke({ itemIds: [list?.id ?? ""] }));
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    expect(
      await f.as(() =>
        f.trash.remove.invoke({ itemIds: [list?.id ?? ""], expectedImpactHash: preview.data.impactHash }),
      ),
    ).toMatchObject({ ok: true, data: { deletedItemIds: [list?.id], pendingItemIds: [], failedItemIds: [] } });
    expect(await f.items()).toEqual([]);
  }, 180_000);

  it("skips a failing item so Restore, Delete permanently, Empty trash and the retention job keep working", async () => {
    const f = await fixture();
    const companyId = f.seed.company.id;
    const orphan = async (kind: "relationship" | "widget", expiresAt = new Date(Date.now() + 86_400_000)) =>
      runWithoutTenant(() =>
        prisma.trashItem.create({
          data: {
            id: randomUUID(),
            companyId,
            kind,
            targetId: randomUUID(),
            typeId: kind === "relationship" ? f.id("deal") : null,
            label: `Orphan ${kind}`,
            deletedById: f.admin.id,
            deletedAt: new Date(),
            expiresAt,
            batchId: randomUUID(),
          },
        }),
      );
    const deleteNotes = async () => {
      await f.as(async () =>
        f.apply.invoke(await f.change([{ operation: "delete", target: { kind: "field", id: f.id("deal.notes") } }])),
      );
      return (await f.items()).find((item) => item.targetId === f.id("deal.notes"));
    };
    const stale = await orphan("relationship");
    const notes = await deleteNotes();
    expect(await f.as(() => f.trash.restore.invoke({ itemIds: [stale.id, notes?.id ?? ""] }))).toMatchObject({
      ok: true,
      data: { restoredItemIds: [notes?.id], blocked: [{ itemId: stale.id, reason: "notFound" }] },
    });
    expect(await f.items()).toEqual([]);
    const leftover = await orphan("relationship");
    const preview = await f.as(() => f.trash.preview.invoke({ itemIds: [leftover.id] }));
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    expect(
      await f.as(() => f.trash.remove.invoke({ itemIds: [leftover.id], expectedImpactHash: preview.data.impactHash })),
    ).toMatchObject({ ok: true, data: { deletedItemIds: [leftover.id], failedItemIds: [] } });
    expect(await f.items()).toEqual([]);

    const failing = {
      kinds: ["widget"] as const,
      restoreOrder: 9,
      visibility: (alias: InstanceType<typeof Prisma.Sql>) => Promise.resolve(Prisma.sql`${alias}.kind = 'widget'`),
      restore: () => Promise.reject(new Error("restore failed")),
      impact: () => Promise.resolve({ removedRecords: [], removedLinks: 0 }),
      purge: () => Promise.reject(new Error("purge failed")),
    };
    const handlers = [...f.handlers(companyId), failing];
    const repo = new PrismaTrashRepo(companyId);
    const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), new PrismaRecordRepo(companyId));
    const empty = new EmptyTrashInteractor(repo, policy, handlers);
    const broken = await orphan("widget");
    const field = await deleteNotes();
    const all = await f.as(() => new PreviewTrashDeletionInteractor(repo, handlers).invoke({ all: true }));
    if (!all.ok) throw new Error(JSON.stringify(all));
    expect(await f.as(() => empty.invoke({ expectedImpactHash: all.data.impactHash }))).toMatchObject({
      ok: true,
      data: { deletedItemIds: [field?.id], pendingItemIds: [], failedItemIds: [broken.id] },
    });
    expect((await f.items()).map((item) => item.id)).toEqual([broken.id]);

    const record = await f.create("deal", "deal.name", "Expired");
    await f.as(async () =>
      f.mutate.invoke({
        mutation: { action: "delete", ref: record, expectedVersion: 1 },
        expectedRevision: await f.revision(),
        idempotencyKey: randomUUID(),
      }),
    );
    await runWithoutTenant(() =>
      prisma.trashItem.updateMany({ where: { companyId }, data: { expiresAt: new Date(Date.now() - 1000) } }),
    );
    await runWithoutTenant(() => prisma.user.update({ where: { id: f.admin.id }, data: { status: "inactive" } }));
    const dispatched: unknown[] = [];
    await new PurgeExpiredTrashInteractor(
      {
        findExpiredTrashCompaniesUnscoped: async (at, after, limit) =>
          (await new PrismaTrashRepo().findExpiredTrashCompaniesUnscoped(at, after, limit * 1000)).filter(
            (due) => due.companyId === companyId,
          ),
      },
      {
        dispatch: (_id, payload) => {
          dispatched.push(payload);
          return Promise.resolve();
        },
      },
    ).invoke();
    expect(dispatched).toEqual([expect.objectContaining({ companyId, actorUserId: f.admin.id })]);
    expect(await f.as(() => purgeExpiredCompanyTrash(repo, handlers, new Date()))).toEqual({
      next: null,
      deleted: 1,
      pending: 0,
      failed: 1,
    });
    expect((await f.items()).map((item) => item.id)).toEqual([broken.id]);
  }, 180_000);

  it("reports a list purge that continues in the background as pending and keeps its item", async () => {
    const f = await fixture();
    const companyId = f.seed.company.id;
    await f.as(async () =>
      f.apply.invoke(await f.change([{ operation: "delete", target: { kind: "type", id: f.id("organization") } }])),
    );
    const [config] = f.handlers(companyId);
    const background = new ConfigurationTrashHandler(
      new PrismaRecordRepo(companyId),
      new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), new PrismaRecordRepo(companyId)),
      (config as unknown as { preview: never }).preview,
      { run: () => Promise.resolve({ ok: true, data: { status: "pending", operationId: randomUUID() } }) } as never,
      new PrismaTrashRepo(companyId),
    );
    const items = await f.as(() => new PrismaTrashRepo(companyId).find({ all: true }, Prisma.sql`TRUE`));
    expect(
      await f.as(() =>
        runInTransaction(() => purgeTrashItems(new PrismaTrashRepo(companyId), [background], items, f.admin.id)),
      ),
    ).toEqual({
      deletedItemIds: [],
      pendingItemIds: [items[0]?.id],
      failedItemIds: [],
    });
    expect(await f.items()).toHaveLength(1);
  }, 180_000);

  it("backfills Trash items for configuration that was deleted before the migration", async () => {
    const f = await fixture();
    await f.as(async () =>
      f.apply.invoke(await f.change([{ operation: "delete", target: { kind: "field", id: f.id("deal.notes") } }])),
    );
    await f.as(async () =>
      f.apply.invoke(
        await f.change([{ operation: "delete", target: { kind: "field", id: f.id("organization.notes") } }]),
      ),
    );
    await f.as(async () =>
      f.apply.invoke(await f.change([{ operation: "delete", target: { kind: "type", id: f.id("organization") } }])),
    );
    const before = (await f.items()).map((item) => [item.kind, item.targetId, item.label, item.deletedById]);
    expect(before.map(([kind, targetId]) => [kind, targetId])).toEqual([
      ["field", f.id("deal.notes")],
      ["field", f.id("organization.notes")],
      ["list", f.id("organization")],
    ]);
    await runWithoutTenant(() => prisma.trashItem.deleteMany({ where: { companyId: f.seed.company.id } }));
    const sql = readFileSync("prisma/migrations/20261009030000_trash_configuration_backfill/migration.sql", "utf8");
    await runWithoutTenant(() => prisma.$executeRawUnsafe(sql));
    await runWithoutTenant(() => prisma.$executeRawUnsafe(sql));
    const after = await f.items();
    expect(after.map((item) => [item.kind, item.targetId, item.label, item.deletedById])).toEqual(before);
    expect(after.every((item) => item.expiresAt.getTime() > Date.now() + 29 * 24 * 60 * 60 * 1000)).toBe(true);
  }, 180_000);
});
