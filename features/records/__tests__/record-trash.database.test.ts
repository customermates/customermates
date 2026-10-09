import { PermissionService } from "@/core/base/permission.service";
import type { RecordRef, RecordScalar } from "../record-model.schema";
import type { RecordMutation } from "../record-query.schema";
import type { TenantUser } from "@/features/user/user.schema";

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
const { runWithTenant, runWithoutTenant } = await import("@/core/decorators/tenant-context");
const { runInTransaction } = await import("@/core/decorators/transaction-runner");
const { PrismaRecordRepo } = await import("../prisma-record.repository");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("../record-access");
const { RecordCalculationService } = await import("../record-calculation.service");
const { RecordWriteService } = await import("../record-write.service");
const { MutateRecordInteractor } = await import("../mutate-record.interactor");
const { QueryRecordsInteractor } = await import("../query-records.interactor");
const { GetRecordInteractor } = await import("../get-record.interactor");
const { SearchRecordsInteractor } = await import("../search-records.interactor");
const { QueryRecordMeasureInteractor } = await import("../query-record-measure.interactor");
const { RecordTrashHandler } = await import("../record-trash.handler");
const { PrismaTrashRepo } = await import("@/features/trash/prisma-trash.repository");
const { QueryTrashInteractor } = await import("@/features/trash/query-trash.interactor");
const { RestoreTrashInteractor } = await import("@/features/trash/restore-trash.interactor");
const { PreviewTrashDeletionInteractor } = await import("@/features/trash/preview-trash-deletion.interactor");
const { DeleteTrashPermanentlyInteractor } = await import("@/features/trash/delete-trash-permanently.interactor");
const { EmptyTrashInteractor } = await import("@/features/trash/empty-trash.interactor");
const { createCrmPreset, presetId } = await import("../crm-preset");
const { RecordConfigurationService } = await import("../configuration.service");
const { RecordOperationService } = await import("../record-operation.service");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];
const text = (value: string): RecordScalar => ({ kind: "text", value });
const decimal = (value: string): RecordScalar => ({ kind: "decimal", value, currency: null });

async function fixture() {
  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    const adminRole = await prisma.userRole.create({
      data: { companyId: company.id, name: "Administrator", isSystemRole: true },
    });
    const memberRole = await prisma.userRole.create({ data: { companyId: company.id, name: "Member" } });
    const [admin, member] = await Promise.all(
      [adminRole, memberRole].map((role, index) =>
        prisma.user.create({
          data: {
            companyId: company.id,
            roleId: role.id,
            firstName: index ? "Member" : "Admin",
            lastName: "Test",
            email: `${randomUUID()}@example.test`,
            status: "active",
          },
        }),
      ),
    );
    return { company, adminRole, memberRole, admin, member };
  });
  const admin = createMockUser({ ...seed.admin, role: { ...seed.adminRole, permissions: [] } });
  const member = createMockUser({ ...seed.member, role: { ...seed.memberRole, permissions: [] } });
  const repo = new PrismaRecordRepo();
  const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo);
  const writer = new RecordWriteService(repo, policy, new RecordCalculationService(repo));
  const mutate = new MutateRecordInteractor(repo, policy, writer, { dispatch: () => Promise.resolve() });
  const read = new GetRecordInteractor(repo, policy);
  const query = new QueryRecordsInteractor(repo, policy);
  const search = new SearchRecordsInteractor(repo, policy);
  const measure = new QueryRecordMeasureInteractor(repo, policy);
  const trashRepo = new PrismaTrashRepo();
  const handler = new RecordTrashHandler(repo, policy, { dispatch: () => Promise.resolve() });
  const handlers = [handler];
  const worker = new RecordOperationService(repo, policy, new RecordConfigurationService(repo));
  const trash = {
    query: new QueryTrashInteractor(trashRepo, repo, handlers),
    restore: new RestoreTrashInteractor(trashRepo, handlers),
    preview: new PreviewTrashDeletionInteractor(trashRepo, handlers),
    remove: new DeleteTrashPermanentlyInteractor(trashRepo, handlers),
    empty: new EmptyTrashInteractor(trashRepo, policy, handlers),
  };
  const id = (key: string) => presetId(seed.company.id, key);
  const primaryContact = randomUUID();
  await runWithTenant(admin, () =>
    runInTransaction(
      async () => {
        const model = createCrmPreset(seed.company.id);
        model.relationships.push({
          id: primaryContact,
          sourceTypeId: id("deal"),
          targetTypeId: id("contact"),
          sourceLabel: "Primary contact",
          targetLabel: "Primary deal",
          sourceCardinality: "many",
          targetCardinality: "one",
          onSourceDelete: "unlink",
          onTargetDelete: "unlink",
          messagesOnSource: false,
          messagesOnTarget: false,
          archived: false,
        });
        await repo.saveModel(model, admin.id);
        await repo.setGrants(id("deal"), [{ roleId: seed.memberRole.id, actions: ["readOwn", "create", "delete"] }]);
      },
      { timeout: 30000 },
    ),
  );
  const revision = () =>
    runWithoutTenant(() => prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId: seed.company.id } })).then(
      (state) => state.revision,
    );
  const mutation = async (value: RecordMutation, as: TenantUser = admin) => {
    const expectedRevision = await revision();
    return runWithTenant(as, () => mutate.invoke({ mutation: value, expectedRevision, idempotencyKey: randomUUID() }));
  };
  const created = async (value: Extract<RecordMutation, { action: "create" }>, as: TenantUser = admin) => {
    const result = await mutation(value, as);
    if (!result.ok || result.data.status !== "completed") throw new Error(JSON.stringify(result));
    return result.data.refs.find((candidate) => candidate.typeId === value.typeId) as RecordRef;
  };
  const version = async (ref: RecordRef) => {
    const result = await runWithTenant(admin, () => read.invoke(ref));
    if (!result.ok) throw new Error("Record could not be read");
    return result.data.version;
  };
  const remove = async (ref: RecordRef, as: TenantUser = admin, permanent?: boolean) => {
    const result = await mutation(
      { action: "delete", ref, expectedVersion: await version(ref), ...(permanent ? { permanent } : {}) },
      as,
    );
    if (!result.ok || result.data.status !== "completed") throw new Error(JSON.stringify(result));
    return result.data;
  };
  const field = async (ref: RecordRef, fieldId: string) => {
    const result = await runWithTenant(admin, () => read.invoke(ref));
    if (!result.ok) throw new Error("Record could not be read");
    return result.data.fields.find((candidate) => candidate.fieldId === fieldId)?.result;
  };
  const rows = (ref: RecordRef) =>
    runWithoutTenant(() =>
      prisma.crmRecord.findUnique({
        where: { companyId_typeId_id: { companyId: seed.company.id, typeId: ref.typeId, id: ref.recordId } },
        select: { deletedAt: true, trashItemId: true },
      }),
    );
  const events = (ref: RecordRef) =>
    runWithoutTenant(() =>
      prisma.eventLog.findMany({
        where: { companyId: seed.company.id, subjectKind: "record", subjectId: ref.recordId },
        orderBy: { createdAt: "asc" },
        select: { kind: true, payload: true },
      }),
    );
  return {
    repo,
    handler,
    worker,
    seed,
    admin,
    member,
    id,
    primaryContact,
    mutation,
    created,
    remove,
    field,
    rows,
    events,
    read,
    query,
    search,
    measure,
    trash,
  };
}

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

describeDatabase("record trash", () => {
  it("moves a deal and its line items to Trash, hides them from every read path and restores them", async () => {
    const f = await fixture();
    const deal = await f.created({
      action: "create",
      typeId: f.id("deal"),
      fields: [{ fieldId: f.id("deal.name"), value: text("Atlas expansion") }],
    });
    const contact = await f.created({
      action: "create",
      typeId: f.id("contact"),
      fields: [
        { fieldId: f.id("contact.firstName"), value: text("Ada") },
        { fieldId: f.id("contact.lastName"), value: text("Atlas") },
      ],
      links: [{ relationId: f.id("deal.contacts"), direction: "incoming", record: deal }],
    });
    const lineItems = [];
    for (const quantity of ["2", "3"]) {
      lineItems.push(
        await f.created({
          action: "create",
          typeId: f.id("lineItem"),
          fields: [{ fieldId: f.id("lineItem.quantity"), value: decimal(quantity) }],
          links: [{ relationId: f.id("lineItem.deal"), direction: "outgoing", record: deal }],
        }),
      );
    }
    expect(await f.field(deal, f.id("deal.totalQuantity"))).toMatchObject({ state: "value", value: { value: "5" } });

    const deleted = await f.remove(deal);
    expect(deleted.trashBatchId).toEqual(expect.any(String));
    for (const ref of [deal, ...lineItems]) expect((await f.rows(ref))?.deletedAt).not.toBeNull();
    const items = await runWithoutTenant(() =>
      prisma.trashItem.findMany({ where: { companyId: f.seed.company.id, batchId: deleted.trashBatchId } }),
    );
    expect(items).toMatchObject([{ kind: "record", targetId: deal.recordId, label: "Atlas expansion" }]);
    expect((await f.rows(lineItems[0]))?.trashItemId).toBe(items[0]?.id);

    expect(await runWithTenant(f.admin, () => f.read.invoke(deal))).toMatchObject({ ok: false });
    const deals = await runWithTenant(f.admin, () => f.query.invoke({ typeId: f.id("deal") } as never));
    expect(deals.ok && deals.data.total).toBe(0);
    const found = await runWithTenant(f.admin, () => f.search.invoke({ searchTerm: "Atlas" } as never));
    expect(found.ok && found.data.results.map((hit) => hit.ref.recordId)).toEqual([contact.recordId]);
    const total = await runWithTenant(f.admin, () =>
      f.measure.invoke({
        source: { typeId: f.id("lineItem") },
        aggregation: "sum",
        valueFieldId: f.id("lineItem.quantity"),
        groupBy: null,
      } as never),
    );
    expect(total.ok && total.data.total.count).toBe(0);
    const contacts = await runWithTenant(f.admin, () =>
      f.query.invoke({
        typeId: f.id("contact"),
        includeRelationships: [{ relationId: f.id("deal.contacts"), direction: "incoming", limit: 25 }],
      } as never),
    );
    expect(contacts.ok && contacts.data.records[0]?.relationships[0]?.readableCount).toBe(0);

    const listed = await runWithTenant(f.admin, () => f.trash.query.invoke({} as never));
    expect(listed.ok && listed.data.items).toMatchObject([
      { kind: "record", label: "Atlas expansion", listLabel: "Deals", daysLeft: 30 },
    ]);

    const restored = await runWithTenant(f.admin, () =>
      f.trash.restore.invoke({ batchId: deleted.trashBatchId } as never),
    );
    expect(restored).toMatchObject({
      ok: true,
      data: { status: "completed", restoredRecords: 3, droppedLinks: 0, blocked: [] },
    });
    for (const ref of [deal, ...lineItems]) expect(await f.rows(ref)).toEqual({ deletedAt: null, trashItemId: null });
    expect(await f.field(deal, f.id("deal.totalQuantity"))).toMatchObject({ state: "value", value: { value: "5" } });
    const relinked = await runWithTenant(f.admin, () =>
      f.query.invoke({
        typeId: f.id("contact"),
        includeRelationships: [{ relationId: f.id("deal.contacts"), direction: "incoming", limit: 25 }],
      } as never),
    );
    expect(relinked.ok && relinked.data.records[0]?.relationships[0]?.readableCount).toBe(1);
    expect((await f.events(deal)).map((event) => event.kind)).toEqual([
      "record.created",
      "record.updated",
      "record.updated",
      "record.updated",
      "record.deleted",
      "record.restored",
    ]);
    expect(await runWithoutTenant(() => prisma.trashItem.count({ where: { companyId: f.seed.company.id } }))).toBe(0);
  }, 180_000);

  it("recalculates totals when a line item goes to Trash and when it comes back", async () => {
    const f = await fixture();
    const deal = await f.created({
      action: "create",
      typeId: f.id("deal"),
      fields: [{ fieldId: f.id("deal.name"), value: text("Borealis") }],
    });
    const created: RecordRef[] = [];
    for (const quantity of ["4", "6"]) {
      created.push(
        await f.created({
          action: "create",
          typeId: f.id("lineItem"),
          fields: [{ fieldId: f.id("lineItem.quantity"), value: decimal(quantity) }],
          links: [{ relationId: f.id("lineItem.deal"), direction: "outgoing", record: deal }],
        }),
      );
    }
    const deleted = await f.remove(created[1]);
    expect(await f.field(deal, f.id("deal.totalQuantity"))).toMatchObject({ value: { value: "4" } });
    await runWithTenant(f.admin, () => f.trash.restore.invoke({ batchId: deleted.trashBatchId } as never));
    expect(await f.field(deal, f.id("deal.totalQuantity"))).toMatchObject({ value: { value: "10" } });
  }, 180_000);

  it("drops a link whose single side was taken while the record was in Trash and reports it", async () => {
    const f = await fixture();
    const contact = await f.created({
      action: "create",
      typeId: f.id("contact"),
      fields: [{ fieldId: f.id("contact.firstName"), value: text("Cleo") }],
    });
    const first = await f.created({
      action: "create",
      typeId: f.id("deal"),
      fields: [{ fieldId: f.id("deal.name"), value: text("First") }],
      links: [{ relationId: f.primaryContact, direction: "outgoing", record: contact }],
    });
    const deleted = await f.remove(first);
    expect(
      await f.created({
        action: "create",
        typeId: f.id("deal"),
        fields: [{ fieldId: f.id("deal.name"), value: text("Second") }],
        links: [{ relationId: f.primaryContact, direction: "outgoing", record: contact }],
      }),
    ).toBeTruthy();
    expect(
      await runWithTenant(f.admin, async () => f.repo.validateRelationshipCardinality(await f.repo.getModel())),
    ).toEqual([]);
    const restored = await runWithTenant(f.admin, () =>
      f.trash.restore.invoke({ batchId: deleted.trashBatchId } as never),
    );
    expect(restored).toMatchObject({ ok: true, data: { restoredRecords: 1, droppedLinks: 1 } });
    expect(
      await runWithoutTenant(() =>
        prisma.recordLink.count({ where: { companyId: f.seed.company.id, relationId: f.primaryContact } }),
      ),
    ).toBe(1);
  }, 180_000);

  it("deletes permanently with an exact preview, erases value snapshots and keeps the event skeleton", async () => {
    const f = await fixture();
    const deal = await f.created({
      action: "create",
      typeId: f.id("deal"),
      fields: [{ fieldId: f.id("deal.name"), value: text("Erase me") }],
    });
    await f.created({
      action: "create",
      typeId: f.id("lineItem"),
      fields: [{ fieldId: f.id("lineItem.name"), value: text("Secret item") }],
      links: [{ relationId: f.id("lineItem.deal"), direction: "outgoing", record: deal }],
    });
    await f.remove(deal);
    const listed = await runWithTenant(f.admin, () => f.trash.query.invoke({} as never));
    const itemIds = listed.ok ? listed.data.items.map((item) => item.id) : [];
    const preview = await runWithTenant(f.admin, () => f.trash.preview.invoke({ itemIds }));
    if (!preview.ok) throw new Error("Preview failed");
    expect(preview.data.removedRecords).toEqual(
      expect.arrayContaining([
        { typeId: f.id("deal"), label: "Deals", count: 1 },
        { typeId: f.id("lineItem"), label: "Line items", count: 1 },
      ]),
    );
    expect(
      await runWithTenant(f.admin, () => f.trash.remove.invoke({ itemIds, expectedImpactHash: "0".repeat(64) })),
    ).toMatchObject({ ok: false });
    expect(
      await runWithTenant(f.admin, () =>
        f.trash.remove.invoke({ itemIds, expectedImpactHash: preview.data.impactHash }),
      ),
    ).toMatchObject({ ok: true, data: { deletedItemIds: itemIds } });
    expect(await f.rows(deal)).toBeNull();
    const history = await f.events(deal);
    expect(history.map((event) => event.kind)).toEqual([
      "record.created",
      "record.updated",
      "record.deleted",
      "record.deletedPermanently",
    ]);
    expect(JSON.stringify(history)).not.toContain("Erase me");
    expect(history.every((event) => (event.payload as { fields: unknown[] }).fields.length === 0)).toBe(true);
  }, 180_000);

  it("deletes permanently right away with permanent: true", async () => {
    const f = await fixture();
    const deal = await f.created({
      action: "create",
      typeId: f.id("deal"),
      fields: [{ fieldId: f.id("deal.name"), value: text("Gone now") }],
    });
    const result = await f.remove(deal, f.admin, true);
    expect(result.trashBatchId).toBeUndefined();
    expect(await f.rows(deal)).toBeNull();
    expect(await runWithoutTenant(() => prisma.trashItem.count({ where: { companyId: f.seed.company.id } }))).toBe(0);
    expect(JSON.stringify(await f.events(deal))).not.toContain("Gone now");
  }, 180_000);

  it("shows members only the records they could see and delete, and lets only administrators empty Trash", async () => {
    const f = await fixture();
    const own = await f.created(
      {
        action: "create",
        typeId: f.id("deal"),
        fields: [{ fieldId: f.id("deal.name"), value: text("Mine") }],
        assignedUserIds: [f.member.id],
      },
      f.member,
    );
    const other = await f.created({
      action: "create",
      typeId: f.id("deal"),
      fields: [{ fieldId: f.id("deal.name"), value: text("Theirs") }],
    });
    const contact = await f.created({
      action: "create",
      typeId: f.id("contact"),
      fields: [{ fieldId: f.id("contact.firstName"), value: text("Not deletable") }],
    });
    await f.remove(own, f.member);
    await f.remove(other);
    await f.remove(contact);
    const memberView = await runWithTenant(f.member, () => f.trash.query.invoke({} as never));
    expect(memberView.ok && memberView.data.items.map((item) => item.label)).toEqual(["Mine"]);
    const adminView = await runWithTenant(f.admin, () => f.trash.query.invoke({} as never));
    expect(adminView.ok && adminView.data.total).toBe(3);
    const filtered = await runWithTenant(f.admin, () =>
      f.trash.query.invoke({ typeIds: [f.id("contact")], search: "deletable" } as never),
    );
    expect(filtered.ok && filtered.data.items.map((item) => item.label)).toEqual(["Not deletable"]);
    const all = await runWithTenant(f.member, () => f.trash.preview.invoke({ all: true }));
    if (!all.ok) throw new Error("Preview failed");
    expect(
      await runWithTenant(f.member, () => f.trash.empty.invoke({ expectedImpactHash: all.data.impactHash })),
    ).toMatchObject({ ok: false });
    const everything = await runWithTenant(f.admin, () => f.trash.preview.invoke({ all: true }));
    if (!everything.ok) throw new Error("Preview failed");
    expect(
      await runWithTenant(f.admin, () => f.trash.empty.invoke({ expectedImpactHash: everything.data.impactHash })),
    ).toMatchObject({ ok: true });
    expect(await runWithoutTenant(() => prisma.crmRecord.count({ where: { companyId: f.seed.company.id } }))).toBe(0);
  }, 180_000);

  it("restores a deal and a line item deleted together, whatever their order", async () => {
    const f = await fixture();
    const deal = await f.created({
      action: "create",
      typeId: f.id("deal"),
      fields: [{ fieldId: f.id("deal.name"), value: text("Together") }],
    });
    const item = await f.created({
      action: "create",
      typeId: f.id("lineItem"),
      fields: [],
      links: [{ relationId: f.id("lineItem.deal"), direction: "outgoing", record: deal }],
    });
    const versions = await runWithTenant(f.admin, async () =>
      Promise.all([deal, item].map(async (ref) => ({ ref, read: await f.read.invoke(ref) }))),
    );
    const deleted = await f.mutation({
      action: "deleteMany",
      targets: versions.map(({ ref, read }) => ({ ref, expectedVersion: read.ok ? read.data.version : 0 })),
    });
    if (!deleted.ok || deleted.data.status !== "completed") throw new Error(JSON.stringify(deleted));
    const batchId = deleted.data.trashBatchId;
    const restored = await runWithTenant(f.admin, () => f.trash.restore.invoke({ batchId } as never));
    expect(restored).toMatchObject({ ok: true, data: { blocked: [], restoredRecords: 2 } });
    for (const ref of [deal, item]) expect(await f.rows(ref)).toEqual({ deletedAt: null, trashItemId: null });
  }, 180_000);

  it("restores a large delete page by page as a background operation", async () => {
    const f = await fixture();
    const deal = await f.created({
      action: "create",
      typeId: f.id("deal"),
      fields: [{ fieldId: f.id("deal.name"), value: text("Large") }],
    });
    for (let index = 0; index < 3; index++) {
      await f.created({
        action: "create",
        typeId: f.id("lineItem"),
        fields: [{ fieldId: f.id("lineItem.quantity"), value: decimal("1") }],
        links: [{ relationId: f.id("lineItem.deal"), direction: "outgoing", record: deal }],
      });
    }
    const deleted = await f.remove(deal);
    const items = await runWithoutTenant(() =>
      prisma.trashItem.findMany({ where: { companyId: f.seed.company.id, batchId: deleted.trashBatchId } }),
    );
    const operationId = await runWithTenant(f.admin, () =>
      runInTransaction(() => f.handler.restoreInBackground(items as never)),
    );
    let done = false;
    for (let step = 0; step < 20 && !done; step++)
      done = (await runWithTenant(f.admin, () => f.worker.advance(operationId))).done;
    const operation = await runWithoutTenant(() =>
      prisma.recordOperation.findUniqueOrThrow({
        where: { companyId_id: { companyId: f.seed.company.id, id: operationId } },
      }),
    );
    expect(operation).toMatchObject({
      state: "completed",
      result: { restore: { restoredRecords: 4, restoredItemIds: [items[0]?.id], blocked: [] } },
    });
    expect(await f.field(deal, f.id("deal.totalQuantity"))).toMatchObject({ value: { value: "3" } });
    expect(
      await runWithoutTenant(() =>
        prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId: f.seed.company.id } }),
      ),
    ).toMatchObject({ activeOperationId: null });
  }, 180_000);

  it("blocks restoring a line item while its deal is in Trash", async () => {
    const f = await fixture();
    const deal = await f.created({
      action: "create",
      typeId: f.id("deal"),
      fields: [{ fieldId: f.id("deal.name"), value: text("Parent") }],
    });
    const item = await f.created({
      action: "create",
      typeId: f.id("lineItem"),
      fields: [],
      links: [{ relationId: f.id("lineItem.deal"), direction: "outgoing", record: deal }],
    });
    const itemDelete = await f.remove(item);
    await f.remove(deal);
    const restored = await runWithTenant(f.admin, () =>
      f.trash.restore.invoke({ batchId: itemDelete.trashBatchId } as never),
    );
    expect(restored).toMatchObject({
      ok: true,
      data: { restoredItemIds: [], blocked: [{ reason: "parentDeleted", parent: deal }] },
    });
  }, 180_000);
});
