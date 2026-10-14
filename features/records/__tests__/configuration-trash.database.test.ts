import { PermissionService } from "@/core/base/permission.service";
import type { ConfigurationChange } from "../configuration.schema";
import type { RecordScalar } from "../record-model.schema";
import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { Client } from "pg";
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
const sentry = vi.hoisted(() => ({ captured: [] as unknown[] }));
vi.mock("@sentry/nextjs", () => ({
  captureException: (error: unknown) => {
    sentry.captured.push(error);
    return "captured";
  },
  captureMessage: () => "captured",
  flush: () => Promise.resolve(true),
  setTag: () => undefined,
  setUser: () => undefined,
  withScope: (callback: (scope: Record<string, () => void>) => unknown) =>
    callback({ setContext: () => undefined, setTag: () => undefined, setUser: () => undefined }),
}));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

const { prisma } = await import("@/prisma/db");
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("../record-access");
const { RecordCalculationService } = await import("../record-calculation.service");
const { RecordWriteService } = await import("../record-write.service");
const { RecordConfigurationService } = await import("../configuration.service");
const { RecordConfigurationWriter } = await import("../record-configuration-writer");
const { WebhookPauseNotifier } = await import("@/features/webhook/webhook-pause-notifier");
const { MutateRecordInteractor } = await import("../mutate-record.interactor");
const { RecordTrashService } = await import("../record-trash.service");
const { ApplyRecordConfigurationInteractor } = await import("../configure-records.interactor");
const { PreviewRecordConfigurationInteractor } = await import("../preview-record-configuration.interactor");
const { ConfigurationTrashHandler } = await import("../configuration-trash.handler");
const { RecordTrashHandler } = await import("../record-trash.handler");
const { PrismaTrashRepo } = await import("@/features/trash/prisma-trash.repository");
const { QueryTrashInteractor } = await import("@/features/trash/query-trash.interactor");
const { RestoreTrashInteractor } = await import("@/features/trash/restore-trash.interactor");
const { PreviewTrashDeletionInteractor } = await import("@/features/trash/preview-trash-deletion.interactor");
const { DeleteTrashPermanentlyInteractor } = await import("@/features/trash/delete-trash-permanently.interactor");
const { purgeTrashItems } = await import("@/features/trash/purge-trash-items");
const { ConfigurationSystemPurge } = await import("../configuration-system-purge");
const { EmptyTrashInteractor } = await import("@/features/trash/empty-trash.interactor");
const { Prisma } = await import("@/generated/prisma");

const noWebhooks = new WebhookPauseNotifier(
  { getWebhookByIdOrThrow: () => Promise.reject(new Error("No webhook expected")) },
  { publish: () => Promise.resolve() },
);
const { PurgeExpiredTrashInteractor } = await import("@/features/trash/purge-expired-trash.interactor");
const { PurgeCompanyTrashInteractor } = await import("@/features/trash/purge-company-trash.interactor");
const { AdvanceSystemRecordOperationInteractor } = await import("../advance-system-record-operation.interactor");
const { getWebhookPauseNotifier } = await import("@/core/di");
const { createCrmPreset, presetId } = await import("../crm-preset");
const { createTestRecordOperationService, createTestRecordRepo } = await import("@/tests/helpers/record-repository");
const { PrismaDataViewRepo } = await import("@/features/data-view/prisma-data-view.repository");
const { ViewTrashBlockers } = await import("@/features/data-view/view-trash-blockers");

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
  const systemDispatches: Array<{ operationId: string; system?: { companyId: string } }> = [];
  const handlers = (
    companyId?: string,
    webhooks = noWebhooks,
    systemConfigurations?: InstanceType<typeof RecordConfigurationService>,
  ) => {
    const scoped = createTestRecordRepo(companyId);
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
        new ConfigurationSystemPurge(
          scoped,
          systemConfigurations ?? new RecordConfigurationService(scoped),
          new RecordConfigurationWriter(scoped, new RecordCalculationService(scoped), webhooks),
          new PrismaTrashRepo(companyId),
          {
            dispatch: (_id, payload) => {
              systemDispatches.push(payload as (typeof systemDispatches)[number]);
              return Promise.resolve();
            },
          },
        ),
      ),
      new RecordTrashHandler(
        scoped,
        scopedPolicy,
        { dispatch: () => Promise.resolve() },
        new RecordTrashService(scoped, new RecordCalculationService(scoped)),
      ),
    ];
  };
  const repo = createTestRecordRepo();
  const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo);
  const configurations = new RecordConfigurationService(repo);
  const apply = new ApplyRecordConfigurationInteractor(
    repo,
    policy,
    configurations,
    new RecordConfigurationWriter(repo, new RecordCalculationService(repo), noWebhooks),
    { dispatch: () => Promise.resolve() },
  );
  const worker = createTestRecordOperationService(repo, policy, configurations, noWebhooks);
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    new RecordWriteService(repo, policy, new RecordCalculationService(repo)),
    { dispatch: () => Promise.resolve() },
    new RecordTrashService(repo, new RecordCalculationService(repo)),
  );
  const trashRepo = new PrismaTrashRepo();
  const trash = {
    query: new QueryTrashInteractor(trashRepo, repo, handlers(), new PrismaUserRepo(new PermissionService())),
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
  return {
    seed,
    admin,
    id,
    employer,
    apply,
    worker,
    mutate,
    trash,
    change,
    as,
    items,
    handlers,
    revision,
    create,
    systemDispatches,
  };
}

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

describeDatabase("configuration trash", () => {
  it("publishes an optional choice field without backfilling a Northwind-sized set of records", async () => {
    const f = await fixture();
    const companyId = f.seed.company.id;
    const typeId = f.id("organization");
    await runWithoutTenant(() =>
      prisma.crmRecord.createMany({
        data: Array.from({ length: 456 }, () => ({ companyId, typeId, id: randomUUID() })),
      }),
    );
    const fieldId = randomUUID();
    const change = await f.change([
      {
        operation: "putField",
        field: {
          id: fieldId,
          typeId,
          label: "PB renewal risk",
          valueType: "select",
          behavior: { kind: "input" },
          required: false,
          multiple: false,
          options: [
            { id: "low", label: "Low", color: "success", attributes: [] },
            { id: "medium", label: "Medium", color: "warning", attributes: [] },
            { id: "high", label: "High", color: "destructive", attributes: [] },
          ],
          position: 20,
        },
      },
    ]);
    const applied = await f.as(() => f.apply.invoke(change));
    expect(applied).toMatchObject({ ok: true, data: { status: "completed", schemaRevision: 2 } });
    const fields = await runWithoutTenant(() =>
      prisma.recordFieldDefinition.findMany({ where: { companyId, typeId, id: fieldId } }),
    );
    expect(fields).toHaveLength(1);
    expect(await runWithoutTenant(() => prisma.recordValue.count({ where: { companyId, fieldId } }))).toBe(0);
  });

  it("creates, trashes and restores a calculated field on 2,100 records without a transaction timeout", async () => {
    const f = await fixture();
    const companyId = f.seed.company.id;
    const typeId = f.id("service");
    const fieldId = randomUUID();
    const recordIds = Array.from({ length: 2100 }, () => randomUUID());
    for (let offset = 0; offset < recordIds.length; offset += 500) {
      const page = recordIds.slice(offset, offset + 500);
      await runWithoutTenant(() =>
        runInTransaction(async () => {
          await prisma.crmRecord.createMany({
            data: page.map((id) => ({ companyId, typeId, id })),
          });
          await prisma.recordValue.createMany({
            data: page.flatMap((recordId, index) => [
              {
                companyId,
                typeId,
                recordId,
                fieldId: f.id("service.name"),
                state: "value",
                textValue: `Service ${offset + index}`,
                schemaRevision: 1,
              },
              {
                companyId,
                typeId,
                recordId,
                fieldId: f.id("service.amount"),
                state: "value",
                decimalValue: 100,
                currency: "EUR",
                schemaRevision: 1,
              },
            ]),
          });
        }),
      );
    }
    const calculated = {
      id: fieldId,
      typeId,
      label: "Half price",
      valueType: "currency" as const,
      required: false,
      archived: false,
      options: [],
      position: 99,
      format: { currency: "EUR" },
      behavior: {
        kind: "formula" as const,
        expression: {
          kind: "operation" as const,
          operator: "divide" as const,
          arguments: [
            { kind: "field" as const, fieldId: f.id("service.amount") },
            {
              kind: "literal" as const,
              value: { kind: "decimal" as const, value: "2", currency: null },
            },
          ],
        },
      },
    };
    const webhookId = randomUUID();
    await f.as(async () => {
      await prisma.webhook.create({
        data: { id: webhookId, companyId, url: "https://hooks.example.test/configuration", events: ["record.updated"] },
      });
      await prisma.recordEventSubscription.create({
        data: {
          id: webhookId,
          companyId,
          kind: "webhook",
          ownerUserId: f.admin.id,
          typeId,
          events: ["record.updated"],
          changedFieldIds: [],
        },
      });
    });
    const complete = async (operationId: string) => {
      let done = false;
      for (let step = 0; step < 250 && !done; step++) done = (await f.as(() => f.worker.advance(operationId))).done;
      expect(done).toBe(true);
      expect((await f.as(() => createTestRecordRepo().getOperation(operationId)))?.state).toBe("completed");
    };
    const createStarted = Date.now();
    const created = await f.as(async () =>
      f.apply.invoke(await f.change([{ operation: "putField", field: calculated }])),
    );
    if (!created.ok || created.data.status !== "pending") throw new Error(JSON.stringify(created));
    const createAcceptedMs = Date.now() - createStarted;
    await complete(created.data.operationId);
    const createFinishedMs = Date.now() - createStarted;
    const values = () => runWithoutTenant(() => prisma.recordValue.findMany({ where: { companyId, typeId, fieldId } }));
    expect(await values()).toHaveLength(recordIds.length);
    expect((await values()).every((value) => value.decimalValue?.toString() === "50")).toBe(true);
    const webhookMatches = () =>
      runWithoutTenant(() => prisma.recordEventMatch.count({ where: { companyId, subscriptionId: webhookId } }));
    expect(await webhookMatches()).toBe(0);
    expect(await runWithoutTenant(() => prisma.webhookDelivery.count({ where: { companyId, webhookId } }))).toBe(0);

    const beforeDelete = await runWithoutTenant(() =>
      prisma.crmRecord.findUniqueOrThrow({
        where: { companyId_typeId_id: { companyId, typeId, id: recordIds[0] } },
        select: { version: true },
      }),
    );
    const deleteStarted = Date.now();
    const deleted = await f.as(async () =>
      f.apply.invoke(await f.change([{ operation: "delete", target: { kind: "field", id: fieldId } }])),
    );
    if (!deleted.ok || deleted.data.status !== "completed" || !deleted.data.trashBatchId)
      throw new Error(JSON.stringify(deleted));
    const deleteFinishedMs = Date.now() - deleteStarted;
    const { trashBatchId } = deleted.data;
    expect(await values()).toHaveLength(recordIds.length);
    expect(
      await runWithoutTenant(() =>
        prisma.crmRecord.findUniqueOrThrow({
          where: {
            companyId_typeId_id: { companyId, typeId, id: recordIds[0] },
          },
          select: { version: true },
        }),
      ),
    ).toEqual(beforeDelete);

    await runWithoutTenant(() =>
      prisma.recordValue.updateMany({
        where: { companyId, typeId, fieldId: f.id("service.amount") },
        data: { decimalValue: 120 },
      }),
    );
    const restoreStarted = Date.now();
    const restored = await f.as(() => f.trash.restore.invoke({ batchId: trashBatchId } as never));
    if (!restored.ok || restored.data.status !== "pending") throw new Error(JSON.stringify(restored));
    const restoreAcceptedMs = Date.now() - restoreStarted;
    await complete(restored.data.operationId);
    const restoreFinishedMs = Date.now() - restoreStarted;
    expect((await values()).every((value) => value.decimalValue?.toString() === "60")).toBe(true);
    expect(await webhookMatches()).toBe(0);
    expect(await runWithoutTenant(() => prisma.webhookDelivery.count({ where: { companyId, webhookId } }))).toBe(0);
    expect(
      (await f.as(() => createTestRecordRepo().getModel())).fields.find((field) => field.id === fieldId)?.archived,
    ).toBe(false);
    console.info("calculated-field-2100-ms", {
      createAcceptedMs,
      createFinishedMs,
      deleteFinishedMs,
      restoreAcceptedMs,
      restoreFinishedMs,
    });
  }, 600_000);

  it("moves an unreferenced input field to Trash and back without rewriting the records of its list", async () => {
    const f = await fixture();
    const companyId = f.seed.company.id;
    const deal = await f.create("deal", "deal.name", "Untouched by the notes field");
    const version = () =>
      runWithoutTenant(() =>
        prisma.crmRecord.findUniqueOrThrow({
          where: { companyId_typeId_id: { companyId, typeId: deal.typeId, id: deal.recordId } },
          select: { version: true, updatedAt: true },
        }),
      );
    const before = await version();
    const change = await f.change([{ operation: "delete", target: { kind: "field", id: f.id("deal.notes") } }]);
    const removed = await f.as(() => f.apply.invoke(change));
    expect(removed).toMatchObject({ ok: true, data: { status: "completed" } });
    expect(await version()).toEqual(before);
    const item = (await f.items()).find((row) => row.targetId === f.id("deal.notes"));
    expect(await f.as(() => f.trash.restore.invoke({ itemIds: [item?.id ?? ""] }))).toMatchObject({
      ok: true,
      data: { restoredItemIds: [item?.id] },
    });
    expect(await version()).toEqual(before);
  }, 180_000);

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
    const model = await f.as(() => createTestRecordRepo().getModel());
    expect(model.fields.find((field) => field.id === fieldId)?.archived).toBe(false);
  }, 180_000);

  it("reports saved-view references removed by field deletion and again on restore", async () => {
    const f = await fixture();
    const companyId = f.seed.company.id;
    const fieldId = f.id("deal.notes");
    const viewId = randomUUID();
    const views = new PrismaDataViewRepo({} as never, companyId);
    await f.as(() =>
      prisma.dataView.create({
        data: {
          id: viewId,
          companyId,
          userId: f.admin.id,
          surfaceKey: `records:${f.id("deal")}`,
          name: "Urgent deals",
          filters: [
            {
              field: fieldId,
              operator: FilterOperatorKey.contains,
              value: "urgent",
            },
          ],
          columnOrder: [fieldId],
        },
      }),
    );
    const change = await f.change([{ operation: "delete", target: { kind: "field", id: fieldId } }]);
    const repo = createTestRecordRepo();
    const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo);
    const preview = await f.as(() =>
      new PreviewRecordConfigurationInteractor(repo, policy, new RecordConfigurationService(repo)).invoke(change),
    );
    if (!preview.ok || !preview.data.valid) throw new Error(JSON.stringify(preview));
    expect(preview.data.deletion?.cleaned).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ consumer: expect.objectContaining({ kind: "view", id: viewId }) }),
      ]),
    );
    const deleted = await f.as(() => f.apply.invoke(change));
    if (!deleted.ok || deleted.data.status !== "completed") throw new Error(JSON.stringify(deleted));
    expect(deleted.data.deletionCleaned).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ consumer: expect.objectContaining({ kind: "view", id: viewId }) }),
      ]),
    );
    const stored = await f.as(() => views.getRecordViewStatesByIds([viewId]));
    expect(stored[0]?.state).toMatchObject({ filters: [], columnOrder: [] });
    const [fieldItem] = (await f.items()).filter((item) => item.kind === "field" && item.targetId === fieldId);
    expect(fieldItem).toBeDefined();
    await f.as(() =>
      prisma.dataView.update({
        where: { companyId, id: viewId },
        data: { deletedAt: new Date() },
      }),
    );
    await f.as(() => views.restoreTrashed([viewId]));
    const blockers = new ViewTrashBlockers(repo, views, new PrismaTrashRepo(companyId));
    expect(await f.as(() => blockers.restoreReferences([viewId]))).toEqual([
      { viewId, filters: 1, columns: 1, sort: false, grouping: false },
    ]);
    expect(await f.as(() => f.trash.restore.invoke({ itemIds: [fieldItem?.id ?? ""] }))).toMatchObject({
      ok: true,
      data: {
        status: "completed",
        droppedViewReferences: [{ viewId, filters: 1, columns: 1, sort: false, grouping: false }],
      },
    });
    expect((await f.as(() => views.getRecordViewStatesByIds([viewId])))[0]?.state).toMatchObject({
      filters: [],
      columnOrder: [],
    });
  }, 180_000);

  it("restores a trashed input field at once on a workspace with two thousand records, without rewriting them", async () => {
    const f = await fixture();
    const typeId = f.id("organization");
    const fieldId = f.id("organization.notes");
    const deleted = await f.as(async () =>
      f.apply.invoke(await f.change([{ operation: "delete", target: { kind: "field", id: fieldId } }])),
    );
    if (!deleted.ok || deleted.data.status !== "completed" || !deleted.data.trashBatchId)
      throw new Error(JSON.stringify(deleted));
    const { trashBatchId } = deleted.data;
    const ids = Array.from({ length: 2000 }, () => randomUUID());
    await runWithoutTenant(() =>
      runInTransaction(async () => {
        await prisma.crmRecord.createMany({ data: ids.map((id) => ({ companyId: f.seed.company.id, typeId, id })) });
        await prisma.recordValue.createMany({
          data: ids.map((recordId, index) => ({
            companyId: f.seed.company.id,
            typeId,
            recordId,
            fieldId: f.id("organization.name"),
            state: "value",
            textValue: `Org ${index}`,
            schemaRevision: 1,
          })),
        });
      }),
    );
    const restored = await f.as(() => f.trash.restore.invoke({ batchId: trashBatchId } as never));
    expect(restored).toMatchObject({ ok: true, data: { status: "completed", blocked: [] } });
    expect(await f.items()).toEqual([]);
    expect(
      await runWithoutTenant(() =>
        prisma.crmRecord.count({ where: { companyId: f.seed.company.id, id: { in: ids }, version: { gt: 1 } } }),
      ),
    ).toBe(0);
    const model = await f.as(() => createTestRecordRepo().getModel());
    expect(model.fields.find((field) => field.id === fieldId)?.archived).toBe(false);
  }, 300_000);

  it("restores a deleted list through Trash", async () => {
    const f = await fixture();
    const deleted = await f.as(async () =>
      f.apply.invoke(await f.change([{ operation: "delete", target: { kind: "type", id: f.id("organization") } }])),
    );
    if (!deleted.ok || deleted.data.status !== "completed") throw new Error(JSON.stringify(deleted));
    const batchId = deleted.data.trashBatchId;
    const restored = await f.as(() => f.trash.restore.invoke({ batchId } as never));
    expect(restored).toMatchObject({ ok: true, data: { status: "completed", blocked: [] } });
    const model = await f.as(() => createTestRecordRepo().getModel());
    expect(model.types.find((type) => type.id === f.id("organization"))?.archived).toBe(false);
    expect(await f.items()).toEqual([]);
  }, 180_000);

  it("keeps a deleted list's bindings and gives a deleted field its binding back through Trash", async () => {
    const f = await fixture();
    const avatar = () =>
      f.as(async () =>
        (await createTestRecordRepo().getModel()).capabilities.find(
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
    const listed = await f.as(() => f.trash.query.invoke({ kinds: ["list", "field", "relationship"] } as never));
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
            (due) => due === f.seed.company.id,
          ),
      },
      {
        dispatch: (_id, payload) => {
          dispatched.push(payload);
          return Promise.resolve();
        },
      },
    );
    expect(await job.invoke({ now: new Date() })).toEqual({ dispatched: [] });
    expect(await job.invoke({ now })).toEqual({ dispatched: [f.seed.company.id] });
    expect(dispatched).toEqual([{ companyId: f.seed.company.id, now: now.toISOString() }]);
    const purge = () =>
      new PurgeCompanyTrashInteractor(
        (companyId) => new PrismaTrashRepo(companyId),
        (companyId) => f.handlers(companyId),
      ).invoke({ companyId: f.seed.company.id, now: now.toISOString(), after: null });
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
    expect(await job.invoke({ now })).toEqual({ dispatched: [] });
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

  it("answers a configuration restore during an active record operation with conflict recordWritePaused", async () => {
    const f = await fixture();
    const companyId = f.seed.company.id;
    await f.as(async () =>
      f.apply.invoke(await f.change([{ operation: "delete", target: { kind: "field", id: f.id("deal.notes") } }])),
    );
    const [item] = await f.items();
    if (!item) throw new Error("The field is not in Trash");
    await runWithoutTenant(() =>
      prisma.recordSchemaState.update({ where: { companyId }, data: { activeOperationId: randomUUID() } }),
    );
    expect(await f.as(() => f.trash.restore.invoke({ itemIds: [item.id] }))).toMatchObject({
      ok: false,
      error: {
        issues: [
          expect.objectContaining({
            params: expect.objectContaining({ error: "recordWritePaused", kind: "conflict" }),
          }),
        ],
      },
    });
    expect((await f.items()).map((row) => row.id)).toEqual([item.id]);
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
    const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), createTestRecordRepo(companyId));
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
            (due) => due === companyId,
          ),
      },
      {
        dispatch: (_id, payload) => {
          dispatched.push(payload);
          return Promise.resolve();
        },
      },
    ).invoke();
    expect(dispatched).toEqual([expect.objectContaining({ companyId })]);
    expect(
      await new PurgeCompanyTrashInteractor(
        () => repo,
        () => handlers,
      ).invoke({ companyId, now: new Date().toISOString(), after: null }),
    ).toEqual({
      next: null,
      deleted: 1,
      pending: 0,
      failed: 1,
    });
    expect((await f.items()).map((item) => item.id)).toEqual([broken.id]);
  }, 180_000);

  it.each(["inactive", "absent"] as const)(
    "purges expired configuration and record items as the system when the workspace admin is %s",
    async (admin) => {
      const f = await fixture();
      const companyId = f.seed.company.id;
      const record = await f.create("deal", "deal.name", "Expired");
      await f.as(async () =>
        f.mutate.invoke({
          mutation: { action: "delete", ref: record, expectedVersion: 1 },
          expectedRevision: await f.revision(),
          idempotencyKey: randomUUID(),
        }),
      );
      await f.as(async () =>
        f.apply.invoke(await f.change([{ operation: "delete", target: { kind: "field", id: f.id("deal.notes") } }])),
      );
      await f.as(async () =>
        f.apply.invoke(await f.change([{ operation: "delete", target: { kind: "type", id: f.id("organization") } }])),
      );
      const expired = await f.items();
      expect(new Set(expired.map((item) => item.kind))).toEqual(new Set(["record", "field", "list"]));
      await runWithoutTenant(async () => {
        await prisma.trashItem.updateMany({ where: { companyId }, data: { expiresAt: new Date(Date.now() - 1000) } });
        if (admin === "inactive") await prisma.user.update({ where: { id: f.admin.id }, data: { status: "inactive" } });
        else await prisma.userRole.update({ where: { id: f.seed.adminRole.id }, data: { isSystemRole: false } });
      });
      const dispatched: unknown[] = [];
      await new PurgeExpiredTrashInteractor(
        {
          findExpiredTrashCompaniesUnscoped: async (at, after, limit) =>
            (await new PrismaTrashRepo().findExpiredTrashCompaniesUnscoped(at, after, limit * 1000)).filter(
              (due) => due === companyId,
            ),
        },
        {
          dispatch: (_id, payload) => {
            dispatched.push(payload);
            return Promise.resolve();
          },
        },
      ).invoke();
      expect(dispatched).toEqual([{ companyId, now: expect.any(String) }]);
      expect(
        await new PurgeCompanyTrashInteractor(
          (scoped) => new PrismaTrashRepo(scoped),
          (scoped) => f.handlers(scoped),
        ).invoke({ companyId, now: new Date().toISOString(), after: null }),
      ).toEqual({ next: null, deleted: expired.length, pending: 0, failed: 0 });
      expect(await f.items()).toEqual([]);
      const remaining = await runWithoutTenant(() =>
        Promise.all([
          prisma.recordFieldDefinition.count({ where: { companyId, id: f.id("deal.notes") } }),
          prisma.recordTypeDefinition.count({ where: { companyId, id: f.id("organization") } }),
          prisma.crmRecord.count({ where: { companyId, id: record.recordId } }),
          prisma.eventLog.findMany({
            where: { companyId, subjectId: record.recordId, kind: "record.deletedPermanently" },
            select: { actorId: true },
          }),
        ]),
      );
      expect(remaining).toEqual([0, 0, 0, [{ actorId: null }]]);
    },
    180_000,
  );

  it("purges an expired list of more than 500 records in one system purge", async () => {
    const f = await fixture();
    const companyId = f.seed.company.id;
    const typeId = f.id("organization");
    await f.as(async () =>
      f.apply.invoke(await f.change([{ operation: "delete", target: { kind: "type", id: typeId } }])),
    );
    const recordIds = Array.from({ length: 520 }, () => randomUUID());
    await runWithoutTenant(async () => {
      await prisma.crmRecord.createMany({ data: recordIds.map((id) => ({ companyId, typeId, id })) });
      await prisma.trashItem.updateMany({ where: { companyId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await prisma.user.update({ where: { id: f.admin.id }, data: { status: "inactive" } });
    });
    expect(
      await new PurgeCompanyTrashInteractor(
        (scoped) => new PrismaTrashRepo(scoped),
        (scoped) => f.handlers(scoped),
      ).invoke({ companyId, now: new Date().toISOString(), after: null }),
    ).toEqual({ next: null, deleted: 1, pending: 0, failed: 0 });
    expect(f.systemDispatches).toEqual([]);
    expect(
      await runWithoutTenant(() =>
        Promise.all([
          prisma.recordTypeDefinition.count({ where: { companyId, id: typeId } }),
          prisma.crmRecord.count({ where: { companyId, id: { in: recordIds } } }),
        ]),
      ),
    ).toEqual([0, 0]);
  }, 300_000);

  it("drives a background system purge to completion as a system record operation", async () => {
    const f = await fixture();
    const companyId = f.seed.company.id;
    const fieldId = f.id("deal.notes");
    await f.as(async () =>
      f.apply.invoke(await f.change([{ operation: "delete", target: { kind: "field", id: fieldId } }])),
    );
    await runWithoutTenant(async () => {
      await prisma.trashItem.updateMany({ where: { companyId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await prisma.userRole.update({ where: { id: f.seed.adminRole.id }, data: { isSystemRole: false } });
    });
    const [item] = await f.items();
    if (!item) throw new Error("The field is not in Trash");
    sentry.captured.length = 0;
    const real = new RecordConfigurationService(createTestRecordRepo(companyId));
    const background = Object.assign(Object.create(real) as typeof real, {
      prepare: async (...args: Parameters<typeof real.prepare>) => {
        const prepared = await real.prepare(...args);
        return { ...prepared, preview: { ...prepared.preview, execution: "background" as const } };
      },
    });
    const purge = () =>
      new PurgeCompanyTrashInteractor(
        (scoped) => new PrismaTrashRepo(scoped),
        (scoped) => f.handlers(scoped, noWebhooks, background),
      ).invoke({ companyId, now: new Date().toISOString(), after: null });
    expect(await purge()).toEqual({ next: null, deleted: 0, pending: 1, failed: 0 });
    expect(f.systemDispatches).toEqual([{ operationId: expect.any(String), system: { companyId } }]);
    const operationId = f.systemDispatches[0]?.operationId ?? "";
    expect(
      await runWithoutTenant(() =>
        prisma.recordOperation.findUniqueOrThrow({
          where: { companyId_id: { companyId, id: operationId } },
          select: { userId: true, kind: true },
        }),
      ),
    ).toEqual({ userId: "system:trash", kind: "configuration" });
    expect((await f.items()).find((row) => row.id === item.id)?.payload).toMatchObject({
      purgeOperationId: operationId,
    });
    expect(await purge()).toEqual({ next: null, deleted: 0, pending: 1, failed: 0 });
    expect(f.systemDispatches).toHaveLength(1);
    const advance = new AdvanceSystemRecordOperationInteractor((scoped) => {
      const records = createTestRecordRepo(scoped);
      return createTestRecordOperationService(
        records,
        new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), records),
        new RecordConfigurationService(records),
        noWebhooks,
        scoped,
      );
    });
    const operationState = () =>
      runWithoutTenant(() =>
        prisma.recordOperation.findUniqueOrThrow({
          where: { companyId_id: { companyId, id: operationId } },
          select: { state: true, processed: true },
        }),
      );
    const before = await operationState();
    const holder = new Client({ connectionString: process.env.DATABASE_URL });
    await holder.connect();
    await holder.query("BEGIN");
    await holder.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [companyId]);
    const firstStep = advance.invoke({ companyId, operationId });
    const waiting = async () => {
      const locks = await holder.query<{ waiting: string }>(
        `SELECT count(*) AS waiting FROM pg_locks
         WHERE locktype = 'advisory' AND NOT granted
           AND ((classid::bigint << 32) | objid::bigint) = hashtextextended($1, 0)`,
        [companyId],
      );
      return Number(locks.rows[0]?.waiting ?? 0);
    };
    try {
      for (let poll = 0; poll < 100 && (await waiting()) === 0; poll++)
        await new Promise((resolve) => setTimeout(resolve, 100));
      expect(await waiting()).toBe(1);
      expect(await operationState()).toEqual(before);
    } finally {
      await holder.query("ROLLBACK");
      await holder.end();
    }
    let done = (await firstStep).done;
    for (let step = 0; step < 300 && !done; step++) done = (await advance.invoke({ companyId, operationId })).done;
    expect(done).toBe(true);
    expect(
      await runWithoutTenant(() =>
        Promise.all([
          prisma.recordOperation.findUniqueOrThrow({
            where: { companyId_id: { companyId, id: operationId } },
            select: { state: true },
          }),
          prisma.recordFieldDefinition.count({ where: { companyId, id: fieldId } }),
          prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId }, select: { activeOperationId: true } }),
        ]),
      ),
    ).toEqual([{ state: "completed" }, 0, { activeOperationId: null }]);
    expect(await f.items()).toEqual([]);
    expect(sentry.captured).toEqual([]);
  }, 300_000);

  it("notifies a paused webhook from a system purge through the company-scoped notifier", async () => {
    const f = await fixture();
    const companyId = f.seed.company.id;
    const webhookId = randomUUID();
    await runWithoutTenant(() =>
      prisma.webhook.create({
        data: {
          id: webhookId,
          companyId,
          url: "https://hooks.example.test/notes",
          events: ["record.updated"],
          enabled: false,
          pausedReason: "triggerFieldDeleted",
        },
      }),
    );
    await expect(runWithoutTenant(() => getWebhookPauseNotifier().notify([webhookId]))).rejects.toThrow(
      "User is not available when tenant is bypassed",
    );
    await expect(
      runWithoutTenant(() => getWebhookPauseNotifier(companyId).notify([webhookId])),
    ).resolves.toBeUndefined();
    const foreign = await fixture();
    await expect(
      runWithoutTenant(() => getWebhookPauseNotifier(foreign.seed.company.id).notify([webhookId])),
    ).rejects.toThrow();
  }, 180_000);

  it("reports a list purge that continues in the background as pending and keeps its item", async () => {
    const f = await fixture();
    const companyId = f.seed.company.id;
    await f.as(async () =>
      f.apply.invoke(await f.change([{ operation: "delete", target: { kind: "type", id: f.id("organization") } }])),
    );
    const [config] = f.handlers(companyId);
    const background = new ConfigurationTrashHandler(
      createTestRecordRepo(companyId),
      new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), createTestRecordRepo(companyId)),
      (config as unknown as { preview: never }).preview,
      { run: () => Promise.resolve({ ok: true, data: { status: "pending", operationId: randomUUID() } }) } as never,
      new PrismaTrashRepo(companyId),
      (config as unknown as { system: never }).system,
    );
    const items = await f.as(() => new PrismaTrashRepo(companyId).find({ all: true }, Prisma.sql`TRUE`));
    expect(
      await f.as(() =>
        runInTransaction(() =>
          purgeTrashItems(new PrismaTrashRepo(companyId), [background], items, { companyId, actorId: f.admin.id }),
        ),
      ),
    ).toEqual({
      deletedItemIds: [],
      pendingItemIds: [items[0]?.id],
      failedItemIds: [],
    });
    expect(await f.items()).toHaveLength(1);
  }, 180_000);
});
