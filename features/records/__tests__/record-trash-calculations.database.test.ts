import { PermissionService } from "@/core/base/permission.service";
import type {
  CalculatedValue,
  CalculationExpression,
  RecordField,
  RecordModel,
  RecordRef,
  RecordScalar,
} from "../record-model.schema";
import type { RecordMutation } from "../record-query.schema";
import type { RecordRepo } from "../record.repo";
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
const { WebhookPauseNotifier } = await import("@/features/webhook/webhook-pause-notifier");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("../record-access");
const { RecordCalculationService, recordKey } = await import("../record-calculation.service");
const { RecordWriteService, sameRecordResult } = await import("../record-write.service");
const { MutateRecordInteractor } = await import("../mutate-record.interactor");
const { GetRecordInteractor } = await import("../get-record.interactor");
const { PreviewRecordDeletionInteractor } = await import("../preview-record-deletion.interactor");
const { RecordTrashHandler } = await import("../record-trash.handler");
const { PrismaTrashRepo } = await import("@/features/trash/prisma-trash.repository");
const { QueryTrashInteractor } = await import("@/features/trash/query-trash.interactor");
const { RestoreTrashInteractor } = await import("@/features/trash/restore-trash.interactor");
const { PreviewTrashDeletionInteractor } = await import("@/features/trash/preview-trash-deletion.interactor");
const { DeleteTrashPermanentlyInteractor } = await import("@/features/trash/delete-trash-permanently.interactor");
const { EmptyTrashInteractor } = await import("@/features/trash/empty-trash.interactor");
const { PurgeCompanyTrashInteractor } = await import("@/features/trash/purge-company-trash.interactor");
const { purgeTrashItems } = await import("@/features/trash/purge-trash-items");
const { createCrmPreset, presetId } = await import("../crm-preset");
const { RecordConfigurationService } = await import("../configuration.service");
const { RecordTrashService } = await import("../record-trash.service");
const { decodeRecordValue } = await import("../record-storage");
const { createTestRecordOperationService, createTestRecordRepo } = await import("@/tests/helpers/record-repository");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];
const text = (value: string): RecordScalar => ({ kind: "text", value });
const decimal = (value: string): RecordScalar => ({ kind: "decimal", value, currency: null });
const euro = (value: string): RecordScalar => ({ kind: "decimal", value, currency: "EUR" });

function extendModel(model: RecordModel, id: (key: string) => string) {
  const field = (fieldId: string): CalculationExpression => ({ kind: "field", fieldId });
  const literal = (value: RecordScalar | null): CalculationExpression => ({ kind: "literal", value });
  const related = (
    relationId: string,
    direction: "outgoing" | "incoming",
    expression: CalculationExpression,
    reducer: Extract<CalculationExpression, { kind: "related" }>["reducer"],
  ): CalculationExpression => ({ kind: "related", relationId, direction, expression, reducer });
  const operation = (
    operator: Extract<CalculationExpression, { kind: "operation" }>["operator"],
    ...args: CalculationExpression[]
  ): CalculationExpression => ({ kind: "operation", operator, arguments: args });
  const add = (
    type: string,
    key: string,
    valueType: RecordField["valueType"],
    behavior: RecordField["behavior"] = { kind: "input" },
  ) => {
    model.fields.push({
      id: id(key),
      typeId: id(type),
      label: key,
      valueType,
      behavior,
      required: false,
      archived: false,
      publishedSummary: false,
      options: [],
      position: model.fields.filter((candidate) => candidate.typeId === id(type)).length,
      ...(valueType === "currency" ? { format: { currency: "EUR" } } : {}),
    });
  };
  const relation = (
    key: string,
    source: string,
    target: string,
    sourceCardinality: "one" | "many",
    targetCardinality: "one" | "many",
  ) =>
    model.relationships.push({
      id: id(key),
      sourceTypeId: id(source),
      targetTypeId: id(target),
      sourceLabel: key,
      targetLabel: `${key} (back)`,
      sourceCardinality,
      targetCardinality,
      onSourceDelete: "unlink",
      onTargetDelete: "unlink",
      messagesOnSource: false,
      messagesOnTarget: false,
      archived: false,
    });
  relation("deal.account", "deal", "organization", "one", "many");
  relation("deal.champion", "deal", "contact", "one", "one");
  add("deal", "deal.amount", "number");
  const accountDeals = (reducer: "count" | "sum" | "min" | "max" | "average") =>
    related(id("deal.account"), "incoming", field(id("deal.amount")), reducer);
  add("organization", "organization.dealCount", "number", { kind: "rollup", expression: accountDeals("count") });
  add("organization", "organization.dealSum", "number", { kind: "rollup", expression: accountDeals("sum") });
  add("organization", "organization.dealMin", "number", { kind: "rollup", expression: accountDeals("min") });
  add("organization", "organization.dealMax", "number", { kind: "rollup", expression: accountDeals("max") });
  add("organization", "organization.dealAverage", "number", { kind: "rollup", expression: accountDeals("average") });
  add("organization", "organization.pipeline", "currency", {
    kind: "rollup",
    expression: related(id("deal.account"), "incoming", field(id("deal.totalValue")), "sum"),
  });
  add("organization", "organization.quantity", "number", {
    kind: "rollup",
    expression: related(
      id("deal.account"),
      "incoming",
      related(id("lineItem.deal"), "incoming", field(id("lineItem.quantity")), "sum"),
      "sum",
    ),
  });
  add("deal", "deal.accountName", "text", {
    kind: "lookup",
    expression: related(id("deal.account"), "outgoing", field(id("organization.name")), "one"),
  });
  add("deal", "deal.accountDeals", "number", {
    kind: "lookup",
    expression: related(id("deal.account"), "outgoing", field(id("organization.dealCount")), "one"),
  });
  add("deal", "deal.accountSum", "number", {
    kind: "lookup",
    expression: related(id("deal.account"), "outgoing", field(id("organization.dealSum")), "one"),
  });
  add("deal", "deal.label", "text", {
    kind: "formula",
    expression: operation(
      "concat",
      field(id("deal.name")),
      literal(text(" @ ")),
      operation("coalesce", field(id("deal.accountName")), literal(text("-"))),
    ),
  });
  add("deal", "deal.share", "number", {
    kind: "formula",
    expression: operation("divide", field(id("deal.amount")), field(id("deal.accountSum"))),
  });
  add("deal", "deal.firstAmount", "number", {
    kind: "snapshot",
    capture: "create",
    expression: field(id("deal.amount")),
  });
  add("deal", "deal.championName", "text", {
    kind: "lookup",
    expression: related(id("deal.champion"), "outgoing", field(id("contact.name")), "one"),
  });
  add("contact", "contact.dealCount", "number", {
    kind: "rollup",
    expression: related(id("deal.contacts"), "incoming", field(id("deal.amount")), "count"),
  });
  add("contact", "contact.dealSum", "number", {
    kind: "rollup",
    expression: related(id("deal.contacts"), "incoming", field(id("deal.amount")), "sum"),
  });
  add("contact", "contact.championOf", "text", {
    kind: "lookup",
    expression: related(id("deal.champion"), "incoming", field(id("deal.name")), "one"),
  });
  add("service", "service.quantitySold", "number", {
    kind: "rollup",
    expression: related(id("lineItem.service"), "incoming", field(id("lineItem.quantity")), "sum"),
  });
}

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
  const repo = createTestRecordRepo();
  const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo);
  const writer = new RecordWriteService(repo, policy, new RecordCalculationService(repo));
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    writer,
    { dispatch: () => Promise.resolve() },
    new RecordTrashService(repo, new RecordCalculationService(repo)),
  );
  const read = new GetRecordInteractor(repo, policy);
  const trashRepo = new PrismaTrashRepo();
  const handler = new RecordTrashHandler(
    repo,
    policy,
    { dispatch: () => Promise.resolve() },
    new RecordTrashService(repo, new RecordCalculationService(repo)),
  );
  const handlers = [handler];
  const worker = createTestRecordOperationService(
    repo,
    policy,
    new RecordConfigurationService(repo),
    new WebhookPauseNotifier(
      { getWebhookByIdOrThrow: () => Promise.reject(new Error("No webhook expected")) },
      { publish: () => Promise.resolve() },
    ),
  );
  const trash = {
    query: new QueryTrashInteractor(trashRepo, repo, handlers, new PrismaUserRepo(new PermissionService())),
    restore: new RestoreTrashInteractor(trashRepo, handlers),
    preview: new PreviewTrashDeletionInteractor(trashRepo, handlers),
    remove: new DeleteTrashPermanentlyInteractor(trashRepo, handlers),
    empty: new EmptyTrashInteractor(trashRepo, policy, handlers),
    expire: new PurgeCompanyTrashInteractor(
      (companyId) => new PrismaTrashRepo(companyId),
      (companyId) => [
        new RecordTrashHandler(
          createTestRecordRepo(companyId),
          policy,
          { dispatch: () => Promise.resolve() },
          new RecordTrashService(
            createTestRecordRepo(companyId),
            new RecordCalculationService(createTestRecordRepo(companyId)),
          ),
        ),
      ],
    ),
  };
  const id = (key: string) => presetId(seed.company.id, key);
  await runWithTenant(admin, () =>
    runInTransaction(
      async () => {
        const model = createCrmPreset(seed.company.id);
        extendModel(model, id);
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
  const completed = async (value: RecordMutation, as: TenantUser = admin) => {
    const result = await mutation(value, as);
    if (!result.ok || result.data.status !== "completed") throw new Error(JSON.stringify(result));
    return result.data;
  };
  const created = async (value: Extract<RecordMutation, { action: "create" }>, as: TenantUser = admin) =>
    (await completed(value, as)).refs.find((candidate) => candidate.typeId === value.typeId) as RecordRef;
  const version = async (ref: RecordRef) => {
    const result = await runWithTenant(admin, () => read.invoke(ref));
    if (!result.ok) throw new Error("Record could not be read");
    return result.data.version;
  };
  const update = async (ref: RecordRef, fields: Array<{ fieldId: string; value: RecordScalar | null }>) =>
    completed({ action: "update", ref, expectedVersion: await version(ref), fields });
  const remove = async (ref: RecordRef, as: TenantUser = admin, permanent?: boolean) =>
    completed({ action: "delete", ref, expectedVersion: await version(ref), ...(permanent ? { permanent } : {}) }, as);
  const removeMany = async (refs: RecordRef[], permanent?: boolean) =>
    mutation({
      action: "deleteMany",
      targets: await Promise.all(refs.map(async (ref) => ({ ref, expectedVersion: await version(ref) }))),
      ...(permanent ? { permanent } : {}),
    });
  const restore = (selection: { batchId: string } | { itemIds: string[] }, as: TenantUser = admin) =>
    runWithTenant(as, () => f.trash.restore.invoke(selection as never));
  const value = async (ref: RecordRef, key: string) => {
    const result = await runWithTenant(admin, () => read.invoke(ref));
    if (!result.ok) throw new Error(`Record could not be read: ${JSON.stringify(result.error)}`);
    const found = result.data.fields.find((candidate) => candidate.fieldId === id(key))?.result;
    if (!found || found.state !== "value") return found?.state === "error" ? `error:${found.code}` : null;
    const scalar = found.value;
    if (scalar.kind === "decimal") return Number(scalar.value);
    if (scalar.kind === "text") return scalar.value;
    return JSON.stringify(scalar);
  };
  const values = async (ref: RecordRef, keys: string[]) =>
    Object.fromEntries(await Promise.all(keys.map(async (key) => [key, await value(ref, key)] as const)));
  const items = (batchId: string) =>
    runWithoutTenant(() => prisma.trashItem.findMany({ where: { companyId: seed.company.id, batchId } }));
  const rows = (ref: RecordRef) =>
    runWithoutTenant(() =>
      prisma.crmRecord.findUnique({
        where: { companyId_typeId_id: { companyId: seed.company.id, typeId: ref.typeId, id: ref.recordId } },
        select: { deletedAt: true, trashItemId: true, version: true },
      }),
    );
  const drain = async (operationId: string, as: TenantUser = admin, steps = 400) => {
    let done = false;
    for (let step = 0; step < steps && !done; step++)
      done = (await runWithTenant(as, () => worker.advance(operationId))).done;
    return runWithoutTenant(() =>
      prisma.recordOperation.findUniqueOrThrow({
        where: { companyId_id: { companyId: seed.company.id, id: operationId } },
      }),
    );
  };
  const inconsistencies = async () =>
    runWithTenant(admin, () =>
      runInTransaction(
        async () => {
          const model = await repo.getModel();
          const writes = new Map<string, CalculatedValue>();
          const dependencies = new Map<string, string[]>();
          const capturing = new Proxy(repo, {
            get(target, property) {
              if (property === "setValue") {
                return (ref: RecordRef, fieldId: string, result: CalculatedValue) => {
                  writes.set(`${recordKey(ref)}:${fieldId}`, result);
                  return Promise.resolve();
                };
              }
              if (property === "setValueDependencies") {
                return (ref: RecordRef, fieldId: string, sources: RecordRef[]) => {
                  dependencies.set(`${recordKey(ref)}:${fieldId}`, sources.map(recordKey).sort());
                  return Promise.resolve();
                };
              }
              const member = Reflect.get(target, property, target) as unknown;
              return typeof member === "function" ? (member as (...args: unknown[]) => unknown).bind(target) : member;
            },
          }) as RecordRepo;
          const calculations = new RecordCalculationService(capturing);
          const problems: string[] = [];
          for (const type of model.types) {
            const refs = await repo.getRecordRefsCompanyWide(type.id, undefined, 5000);
            for (const ref of refs) {
              const stored = await repo.getRecordCompanyWide(ref);
              for (const definition of model.fields) {
                if (
                  definition.typeId !== type.id ||
                  definition.archived ||
                  definition.behavior.kind === "input" ||
                  definition.behavior.kind === "snapshot"
                )
                  continue;
                const key = `${recordKey(ref)}:${definition.id}`;
                writes.delete(key);
                dependencies.delete(key);
                await calculations.calculateField(model, ref, definition.id, 5000);
                const current = decodeRecordValue(
                  stored?.values.find((candidate) => candidate.fieldId === definition.id),
                  definition,
                );
                const fresh = writes.get(key);
                if (fresh && !sameRecordResult(fresh, current)) {
                  problems.push(
                    `${definition.label} on ${type.label} ${ref.recordId.slice(0, 8)}: stored ${JSON.stringify(current)} expected ${JSON.stringify(fresh)}`,
                  );
                }
                if (dependencies.has(key))
                  problems.push(`${definition.label} on ${type.label} ${ref.recordId.slice(0, 8)}: stale provenance`);
              }
            }
          }
          return problems;
        },
        { timeout: 120000 },
      ),
    );
  const f = {
    repo,
    policy,
    handler,
    worker,
    seed,
    admin,
    member,
    id,
    mutation,
    completed,
    created,
    update,
    remove,
    removeMany,
    restore,
    value,
    values,
    items,
    rows,
    drain,
    inconsistencies,
    read,
    trash,
    version,
  };
  return f;
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function organization(f: Fixture, name: string) {
  return f.created({
    action: "create",
    typeId: f.id("organization"),
    fields: [{ fieldId: f.id("organization.name"), value: text(name) }],
  });
}

async function deal(f: Fixture, name: string, amount: string, account?: RecordRef, as?: TenantUser) {
  return f.created(
    {
      action: "create",
      typeId: f.id("deal"),
      fields: [
        { fieldId: f.id("deal.name"), value: text(name) },
        { fieldId: f.id("deal.amount"), value: decimal(amount) },
      ],
      ...(account
        ? { links: [{ relationId: f.id("deal.account"), direction: "outgoing" as const, record: account }] }
        : {}),
      ...(as ? { assignedUserIds: [as.id] } : {}),
    },
    as,
  );
}

async function lineItem(f: Fixture, parent: RecordRef, quantity: string, service?: RecordRef) {
  return f.created({
    action: "create",
    typeId: f.id("lineItem"),
    fields: [{ fieldId: f.id("lineItem.quantity"), value: decimal(quantity) }],
    links: [
      { relationId: f.id("lineItem.deal"), direction: "outgoing", record: parent },
      ...(service ? [{ relationId: f.id("lineItem.service"), direction: "outgoing" as const, record: service }] : []),
    ],
  });
}

async function seedDeals(f: Fixture, account: RecordRef, count: number, itemsPerDeal: number) {
  const companyId = f.seed.company.id;
  const deals = Array.from({ length: count }, () => ({ typeId: f.id("deal"), recordId: randomUUID() }));
  const items = deals.flatMap((parent) =>
    Array.from({ length: itemsPerDeal }, () => ({ parent, ref: { typeId: f.id("lineItem"), recordId: randomUUID() } })),
  );
  await runWithoutTenant(async () => {
    await prisma.crmRecord.createMany({
      data: [...deals, ...items.map((item) => item.ref)].map((ref) => ({
        companyId,
        typeId: ref.typeId,
        id: ref.recordId,
      })),
    });
    await prisma.recordAssignment.createMany({
      data: deals.map((ref) => ({ companyId, typeId: ref.typeId, recordId: ref.recordId, userId: f.admin.id })),
    });
    await prisma.recordLink.createMany({
      data: [
        ...deals.map((ref) => ({ relationId: f.id("deal.account"), source: ref, target: account })),
        ...items.map((item) => ({ relationId: f.id("lineItem.deal"), source: item.ref, target: item.parent })),
      ].map((link) => ({
        companyId,
        relationId: link.relationId,
        sourceTypeId: link.source.typeId,
        sourceId: link.source.recordId,
        targetTypeId: link.target.typeId,
        targetId: link.target.recordId,
      })),
    });
  });
  await runWithTenant(f.admin, () =>
    runInTransaction(
      async () => {
        const model = await f.repo.getModel();
        for (const [index, ref] of deals.entries()) {
          await f.repo.setValue(
            ref,
            f.id("deal.name"),
            { state: "value", value: text(`Bulk ${index}`) },
            model.revision,
          );
          await f.repo.setValue(
            ref,
            f.id("deal.amount"),
            { state: "value", value: decimal(String(index + 1)) },
            model.revision,
          );
        }
        for (const item of items) {
          await f.repo.setValue(
            item.ref,
            f.id("lineItem.name"),
            { state: "value", value: text("Row") },
            model.revision,
          );
          await f.repo.setValue(
            item.ref,
            f.id("lineItem.quantity"),
            { state: "value", value: decimal("1") },
            model.revision,
          );
          await f.repo.setValue(
            item.ref,
            f.id("lineItem.pricingMode"),
            { state: "value", value: { kind: "select", value: "live" } },
            model.revision,
          );
        }
        await recalculateAll(f, model);
      },
      { timeout: 600000 },
    ),
  );
  return deals;
}

async function recalculateAll(f: Fixture, model: RecordModel) {
  const calculations = new RecordCalculationService(f.repo);
  const { validateRecordModel } = await import("../record-model-validation");
  for (const fieldId of validateRecordModel(model).calculationOrder) {
    const definition = model.fields.find((candidate) => candidate.id === fieldId);
    if (!definition || definition.behavior.kind === "snapshot") continue;
    const refs = await f.repo.getRecordRefsCompanyWide(definition.typeId, undefined, 5000);
    for (const ref of refs) await calculations.calculateField(model, ref, fieldId, 5000);
  }
}

async function shareLinkIds(f: Fixture, rows: RecordRef[]) {
  const recordIds = rows.map((row) => row.recordId);
  await runWithoutTenant(async () => {
    for (const relation of ["lineItem.deal", "lineItem.service"]) {
      await prisma.$executeRaw`UPDATE "RecordLink" SET id = "sourceId" WHERE "companyId" = ${f.seed.company.id}
        AND "relationId" = ${f.id(relation)} AND "sourceId" = ANY(${recordIds})`;
    }
  });
}

async function seedLineItemsSharingLinkIds(
  f: Fixture,
  parent: RecordRef,
  serviceAt: (index: number) => RecordRef,
  count: number,
) {
  const companyId = f.seed.company.id;
  const rows = Array.from({ length: count }, (_, index) => ({
    typeId: f.id("lineItem"),
    recordId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  }));
  await runWithoutTenant(async () => {
    await prisma.crmRecord.createMany({
      data: rows.map((ref) => ({ companyId, typeId: ref.typeId, id: ref.recordId })),
    });
    await prisma.recordLink.createMany({
      data: [
        ...rows.map((ref) => ({ relationId: f.id("lineItem.deal"), source: ref, target: parent })),
        ...rows.map((ref, index) => ({ relationId: f.id("lineItem.service"), source: ref, target: serviceAt(index) })),
      ].map((link) => ({
        companyId,
        id: link.source.recordId,
        relationId: link.relationId,
        sourceTypeId: link.source.typeId,
        sourceId: link.source.recordId,
        targetTypeId: link.target.typeId,
        targetId: link.target.recordId,
      })),
    });
  });
  await runWithTenant(f.admin, () =>
    runInTransaction(
      async () => {
        const model = await f.repo.getModel();
        for (const ref of rows) {
          await f.repo.setValue(ref, f.id("lineItem.name"), { state: "value", value: text("Row") }, model.revision);
          await f.repo.setValue(
            ref,
            f.id("lineItem.quantity"),
            { state: "value", value: decimal("1") },
            model.revision,
          );
          await f.repo.setValue(
            ref,
            f.id("lineItem.pricingMode"),
            { state: "value", value: { kind: "select", value: "live" } },
            model.revision,
          );
        }
        await recalculateAll(f, model);
      },
      { timeout: 600000 },
    ),
  );
  return rows;
}

const ORGANIZATION_ROLLUPS = [
  "organization.dealCount",
  "organization.dealSum",
  "organization.dealMin",
  "organization.dealMax",
  "organization.dealAverage",
];

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

describeDatabase("record trash calculations", () => {
  it("1: rollups and lookups follow a deal and an organization into Trash and back", async () => {
    const f = await fixture();
    const acme = await organization(f, "Acme");
    const deals = [
      await deal(f, "Small", "10", acme),
      await deal(f, "Medium", "20", acme),
      await deal(f, "Large", "60", acme),
    ];
    expect(await f.values(acme, ORGANIZATION_ROLLUPS)).toEqual({
      "organization.dealCount": 3,
      "organization.dealSum": 90,
      "organization.dealMin": 10,
      "organization.dealMax": 60,
      "organization.dealAverage": 30,
    });
    expect(await f.values(deals[0], ["deal.accountName", "deal.accountDeals", "deal.label", "deal.share"])).toEqual({
      "deal.accountName": "Acme",
      "deal.accountDeals": 3,
      "deal.label": "Small @ Acme",
      "deal.share": 10 / 90,
    });
    expect(await f.inconsistencies()).toEqual([]);

    const removed = await f.remove(deals[2]);
    expect(await f.values(acme, ORGANIZATION_ROLLUPS)).toEqual({
      "organization.dealCount": 2,
      "organization.dealSum": 30,
      "organization.dealMin": 10,
      "organization.dealMax": 20,
      "organization.dealAverage": 15,
    });
    expect(await f.values(deals[0], ["deal.accountDeals", "deal.share"])).toEqual({
      "deal.accountDeals": 2,
      "deal.share": 10 / 30,
    });
    expect(await f.inconsistencies()).toEqual([]);

    const restored = await f.restore({ batchId: removed.trashBatchId as string });
    expect(restored).toMatchObject({ ok: true, data: { status: "completed", restoredRecords: 1, droppedLinks: 0 } });
    expect(await f.values(acme, ORGANIZATION_ROLLUPS)).toEqual({
      "organization.dealCount": 3,
      "organization.dealSum": 90,
      "organization.dealMin": 10,
      "organization.dealMax": 60,
      "organization.dealAverage": 30,
    });
    expect(await f.values(deals[2], ["deal.accountName", "deal.accountDeals", "deal.label", "deal.share"])).toEqual({
      "deal.accountName": "Acme",
      "deal.accountDeals": 3,
      "deal.label": "Large @ Acme",
      "deal.share": 60 / 90,
    });
    expect(await f.inconsistencies()).toEqual([]);

    const organizationDeleted = await f.remove(acme);
    for (const ref of deals) {
      expect(await f.values(ref, ["deal.accountName", "deal.accountDeals", "deal.accountSum", "deal.share"])).toEqual({
        "deal.accountName": null,
        "deal.accountDeals": null,
        "deal.accountSum": null,
        "deal.share": null,
      });
    }
    expect(await f.value(deals[1], "deal.label")).toBe("Medium @ -");
    expect(await f.inconsistencies()).toEqual([]);
    await f.restore({ batchId: organizationDeleted.trashBatchId as string });
    expect(await f.values(acme, ORGANIZATION_ROLLUPS)).toMatchObject({
      "organization.dealCount": 3,
      "organization.dealSum": 90,
    });
    expect(await f.value(deals[1], "deal.label")).toBe("Medium @ Acme");
    expect(await f.inconsistencies()).toEqual([]);
  }, 180_000);

  it("2: a restored record recomputes formula chains against what changed while it was in Trash", async () => {
    const f = await fixture();
    const acme = await organization(f, "Acme");
    const kept = await deal(f, "Kept", "40", acme);
    const trashed = await deal(f, "Trashed", "10", acme);
    const removed = await f.remove(trashed);
    await f.update(acme, [{ fieldId: f.id("organization.name"), value: text("Acme Renamed") }]);
    await f.update(kept, [{ fieldId: f.id("deal.amount"), value: decimal("90") }]);
    await deal(f, "Newcomer", "100", acme);
    expect(await f.inconsistencies()).toEqual([]);
    await f.restore({ batchId: removed.trashBatchId as string });
    expect(
      await f.values(trashed, ["deal.accountName", "deal.label", "deal.accountDeals", "deal.accountSum", "deal.share"]),
    ).toEqual({
      "deal.accountName": "Acme Renamed",
      "deal.label": "Trashed @ Acme Renamed",
      "deal.accountDeals": 3,
      "deal.accountSum": 200,
      "deal.share": 10 / 200,
    });
    expect(await f.value(kept, "deal.share")).toBe(90 / 200);
    expect(await f.inconsistencies()).toEqual([]);
  }, 180_000);

  it("3a: a link whose other side was deleted permanently is dropped, reported and leaves consistent values", async () => {
    const f = await fixture();
    const acme = await organization(f, "Acme");
    const trashed = await deal(f, "Orphan", "10", acme);
    const removed = await f.remove(trashed);
    await f.remove(acme, f.admin, true);
    expect(await f.inconsistencies()).toEqual([]);
    const restored = await f.restore({ batchId: removed.trashBatchId as string });
    expect(restored).toMatchObject({ ok: true, data: { restoredRecords: 1, droppedLinks: 1 } });
    expect(await f.values(trashed, ["deal.accountName", "deal.label"])).toEqual({
      "deal.accountName": null,
      "deal.label": "Orphan @ -",
    });
    expect(await f.inconsistencies()).toEqual([]);
  }, 180_000);

  it("3d: a link lost when the other side is deleted from Trash is reported by the synchronous and the background restore", async () => {
    const f = await fixture();
    const acme = await organization(f, "Acme");
    const globex = await organization(f, "Globex");
    const first = await deal(f, "First", "10", acme);
    const second = await deal(f, "Second", "20", globex);
    const firstDelete = await f.remove(first);
    const secondDelete = await f.remove(second);
    for (const ref of [acme, globex]) {
      const organizationDelete = await f.remove(ref);
      const itemIds = (await f.items(organizationDelete.trashBatchId as string)).map((item) => item.id);
      const preview = await runWithTenant(f.admin, () => f.trash.preview.invoke({ itemIds }));
      if (!preview.ok) throw new Error("Preview failed");
      expect(
        await runWithTenant(f.admin, () =>
          f.trash.remove.invoke({ itemIds, expectedImpactHash: preview.data.impactHash }),
        ),
      ).toMatchObject({ ok: true, data: { deletedItemIds: itemIds } });
    }
    expect(await f.restore({ batchId: firstDelete.trashBatchId as string })).toMatchObject({
      ok: true,
      data: { restoredRecords: 1, droppedLinks: 1 },
    });
    const items = await f.items(secondDelete.trashBatchId as string);
    const operationId = await runWithTenant(f.admin, () =>
      runInTransaction(() => f.handler.restoreInBackground(items)),
    );
    expect(await f.drain(operationId)).toMatchObject({
      state: "completed",
      result: { restore: { restoredRecords: 1, droppedLinks: 1, blocked: [] } },
    });
    expect(await f.values(first, ["deal.accountName", "deal.label"])).toEqual({
      "deal.accountName": null,
      "deal.label": "First @ -",
    });
    expect(await f.value(second, "deal.label")).toBe("Second @ -");
    expect(await f.inconsistencies()).toEqual([]);
  }, 180_000);

  it("3b: a one-to-one link taken while the record was in Trash is dropped and both sides stay consistent", async () => {
    const f = await fixture();
    const ada = await f.created({
      action: "create",
      typeId: f.id("contact"),
      fields: [{ fieldId: f.id("contact.firstName"), value: text("Ada") }],
    });
    const first = await f.created({
      action: "create",
      typeId: f.id("deal"),
      fields: [{ fieldId: f.id("deal.name"), value: text("First") }],
      links: [{ relationId: f.id("deal.champion"), direction: "outgoing", record: ada }],
    });
    expect(await f.value(ada, "contact.championOf")).toBe("First");
    const removed = await f.remove(first);
    expect(await f.value(ada, "contact.championOf")).toBeNull();
    const second = await f.created({
      action: "create",
      typeId: f.id("deal"),
      fields: [{ fieldId: f.id("deal.name"), value: text("Second") }],
      links: [{ relationId: f.id("deal.champion"), direction: "outgoing", record: ada }],
    });
    const restored = await f.restore({ batchId: removed.trashBatchId as string });
    expect(restored).toMatchObject({ ok: true, data: { restoredRecords: 1, droppedLinks: 1 } });
    expect(await f.value(first, "deal.championName")).toBeNull();
    expect(await f.value(second, "deal.championName")).toBe("Ada");
    expect(await f.value(ada, "contact.championOf")).toBe("Second");
    expect(await f.inconsistencies()).toEqual([]);
  }, 180_000);

  it("3c: restores both sides of a link deleted separately, in either order and in one request", async () => {
    const f = await fixture();
    const acme = await organization(f, "Acme");
    const trashedDeal = await deal(f, "Gone", "30", acme);
    const other = await deal(f, "Stays", "70", acme);
    const dealDelete = await f.remove(trashedDeal);
    const organizationDelete = await f.remove(acme);
    expect(await f.inconsistencies()).toEqual([]);
    const itemIds = [
      ...(await f.items(dealDelete.trashBatchId as string)),
      ...(await f.items(organizationDelete.trashBatchId as string)),
    ].map((item) => item.id);
    const restored = await f.restore({ itemIds });
    expect(restored).toMatchObject({ ok: true, data: { restoredRecords: 2, droppedLinks: 0, blocked: [] } });
    expect(await f.values(acme, ["organization.dealCount", "organization.dealSum"])).toEqual({
      "organization.dealCount": 2,
      "organization.dealSum": 100,
    });
    expect(await f.value(other, "deal.accountDeals")).toBe(2);
    expect(await f.value(trashedDeal, "deal.label")).toBe("Gone @ Acme");
    expect(await f.inconsistencies()).toEqual([]);
  }, 180_000);

  it("3e: many-to-many links and the rollups over them follow both sides into Trash and back", async () => {
    const f = await fixture();
    const contact = (name: string) =>
      f.created({
        action: "create",
        typeId: f.id("contact"),
        fields: [{ fieldId: f.id("contact.firstName"), value: text(name) }],
      });
    const ada = await contact("Ada");
    const bob = await contact("Bob");
    const withContacts = (name: string, amount: string, contacts: RecordRef[]) =>
      f.created({
        action: "create",
        typeId: f.id("deal"),
        fields: [
          { fieldId: f.id("deal.name"), value: text(name) },
          { fieldId: f.id("deal.amount"), value: decimal(amount) },
        ],
        links: contacts.map((record) => ({
          relationId: f.id("deal.contacts"),
          direction: "outgoing" as const,
          record,
        })),
      });
    const shared = await withContacts("Shared", "10", [ada, bob]);
    await withContacts("Ada only", "5", [ada]);
    const rollups = ["contact.dealCount", "contact.dealSum"];
    expect(await f.values(ada, rollups)).toEqual({ "contact.dealCount": 2, "contact.dealSum": 15 });
    expect(await f.values(bob, rollups)).toEqual({ "contact.dealCount": 1, "contact.dealSum": 10 });

    const dealDelete = await f.remove(shared);
    expect(await f.values(ada, rollups)).toEqual({ "contact.dealCount": 1, "contact.dealSum": 5 });
    expect(await f.values(bob, rollups)).toEqual({ "contact.dealCount": 0, "contact.dealSum": 0 });
    const contactDelete = await f.remove(ada);
    expect(await f.inconsistencies()).toEqual([]);

    expect(await f.restore({ batchId: dealDelete.trashBatchId as string })).toMatchObject({
      ok: true,
      data: { restoredRecords: 1, droppedLinks: 0, blocked: [] },
    });
    expect(await f.values(bob, rollups)).toEqual({ "contact.dealCount": 1, "contact.dealSum": 10 });
    expect(await f.inconsistencies()).toEqual([]);
    expect(await f.restore({ batchId: contactDelete.trashBatchId as string })).toMatchObject({
      ok: true,
      data: { restoredRecords: 1, droppedLinks: 0, blocked: [] },
    });
    expect(await f.values(ada, rollups)).toEqual({ "contact.dealCount": 2, "contact.dealSum": 15 });
    expect(await f.inconsistencies()).toEqual([]);
  }, 180_000);

  it("4: sub-list rows follow their deal and roll up into the organization across Trash", async () => {
    const f = await fixture();
    const acme = await organization(f, "Acme");
    const service = await f.created({
      action: "create",
      typeId: f.id("service"),
      fields: [
        { fieldId: f.id("service.name"), value: text("Consulting") },
        { fieldId: f.id("service.amount"), value: euro("100") },
      ],
    });
    const parent = await deal(f, "With rows", "5", acme);
    const rowRefs = [await lineItem(f, parent, "2", service), await lineItem(f, parent, "3", service)];
    expect(await f.values(parent, ["deal.totalQuantity", "deal.totalValue"])).toEqual({
      "deal.totalQuantity": 5,
      "deal.totalValue": 500,
    });
    expect(await f.values(acme, ["organization.pipeline", "organization.quantity"])).toEqual({
      "organization.pipeline": 500,
      "organization.quantity": 5,
    });
    const rowDelete = await f.remove(rowRefs[0]);
    expect(await f.values(acme, ["organization.pipeline", "organization.quantity"])).toEqual({
      "organization.pipeline": 300,
      "organization.quantity": 3,
    });
    expect(await f.inconsistencies()).toEqual([]);
    await f.restore({ batchId: rowDelete.trashBatchId as string });
    expect(await f.values(acme, ["organization.pipeline", "organization.quantity"])).toEqual({
      "organization.pipeline": 500,
      "organization.quantity": 5,
    });
    expect(await f.inconsistencies()).toEqual([]);

    const parentDelete = await f.remove(parent);
    for (const ref of rowRefs) expect((await f.rows(ref))?.deletedAt).not.toBeNull();
    expect(await f.values(acme, ["organization.pipeline", "organization.quantity", "organization.dealCount"])).toEqual({
      "organization.pipeline": 0,
      "organization.quantity": 0,
      "organization.dealCount": 0,
    });
    expect(await f.inconsistencies()).toEqual([]);
    await f.update(service, [{ fieldId: f.id("service.amount"), value: euro("200") }]);
    await f.restore({ batchId: parentDelete.trashBatchId as string });
    expect(await f.values(parent, ["deal.totalQuantity", "deal.totalValue"])).toEqual({
      "deal.totalQuantity": 5,
      "deal.totalValue": 1000,
    });
    expect(await f.values(acme, ["organization.pipeline", "organization.quantity", "organization.dealCount"])).toEqual({
      "organization.pipeline": 1000,
      "organization.quantity": 5,
      "organization.dealCount": 1,
    });
    expect(await f.inconsistencies()).toEqual([]);

    const serviceDelete = await f.remove(service);
    expect(await f.values(parent, ["deal.totalQuantity", "deal.totalValue"])).toEqual({
      "deal.totalQuantity": 0,
      "deal.totalValue": 0,
    });
    expect(await f.inconsistencies()).toEqual([]);
    await f.restore({ batchId: serviceDelete.trashBatchId as string });
    expect(await f.values(acme, ["organization.pipeline", "organization.quantity"])).toEqual({
      "organization.pipeline": 1000,
      "organization.quantity": 5,
    });
    expect(await f.inconsistencies()).toEqual([]);
  }, 180_000);

  it("4b: a sub-list row in Trash leaves Trash with its deal when the deal is deleted permanently", async () => {
    const f = await fixture();
    const purgedParent = await deal(f, "Purged from Trash", "1");
    const purgedRow = await lineItem(f, purgedParent, "2");
    const purgedRowDelete = await f.remove(purgedRow);
    const parentDelete = await f.remove(purgedParent);
    const itemIds = (await f.items(parentDelete.trashBatchId as string)).map((item) => item.id);
    const preview = await runWithTenant(f.admin, () => f.trash.preview.invoke({ itemIds }));
    if (!preview.ok) throw new Error("Preview failed");
    expect(preview.data.removedRecords.find((entry) => entry.typeId === f.id("lineItem"))?.count).toBe(1);
    expect(
      await runWithTenant(f.admin, () =>
        f.trash.remove.invoke({ itemIds, expectedImpactHash: preview.data.impactHash }),
      ),
    ).toMatchObject({ ok: true, data: { deletedItemIds: itemIds } });
    expect(await f.items(purgedRowDelete.trashBatchId as string)).toEqual([]);
    expect(await f.rows(purgedRow)).toBeNull();

    const deletedParent = await deal(f, "Deleted directly", "1");
    const deletedRow = await lineItem(f, deletedParent, "3");
    const deletedRowDelete = await f.remove(deletedRow);
    await f.remove(deletedParent, f.admin, true);
    expect(await f.items(deletedRowDelete.trashBatchId as string)).toEqual([]);
    expect(await f.rows(deletedRow)).toBeNull();

    const togetherParent = await deal(f, "Deleted together", "1");
    const togetherRow = await lineItem(f, togetherParent, "4");
    const together = await f.removeMany([togetherRow, togetherParent]);
    if (!together.ok || together.data.status !== "completed") throw new Error(JSON.stringify(together));
    const batch = await f.items(together.data.trashBatchId as string);
    expect(batch).toHaveLength(2);
    const parentFirst = [...batch].sort(
      (left, right) =>
        Number(right.targetId === togetherParent.recordId) - Number(left.targetId === togetherParent.recordId),
    );
    expect(
      await runWithTenant(f.admin, () =>
        purgeTrashItems(new PrismaTrashRepo(), [f.handler], parentFirst, {
          companyId: f.seed.company.id,
          actorId: f.admin.id,
        }),
      ),
    ).toEqual({ deletedItemIds: parentFirst.map((item) => item.id), pendingItemIds: [], failedItemIds: [] });
    expect(await f.rows(togetherRow)).toBeNull();
    expect(await f.inconsistencies()).toEqual([]);

    const service = await f.created({
      action: "create",
      typeId: f.id("service"),
      fields: [
        { fieldId: f.id("service.name"), value: text("Consulting") },
        { fieldId: f.id("service.amount"), value: euro("100") },
      ],
    });
    const servicedParent = await deal(f, "Serviced", "1");
    const servicedRow = await lineItem(f, servicedParent, "5", service);
    const serviceDelete = await f.remove(service);
    expect((await f.rows(servicedRow))?.trashItemId).toBe((await f.items(serviceDelete.trashBatchId as string))[0].id);
    const servicedParentDelete = await f.remove(servicedParent);
    const servicedItemIds = (await f.items(servicedParentDelete.trashBatchId as string)).map((item) => item.id);
    const servicedPreview = await runWithTenant(f.admin, () => f.trash.preview.invoke({ itemIds: servicedItemIds }));
    if (!servicedPreview.ok) throw new Error("Preview failed");
    expect(servicedPreview.data.removedRecords.map((entry) => [entry.typeId, entry.count])).toEqual(
      expect.arrayContaining([
        [f.id("deal"), 1],
        [f.id("lineItem"), 1],
      ]),
    );
    expect(
      await runWithTenant(f.admin, () =>
        f.trash.remove.invoke({ itemIds: servicedItemIds, expectedImpactHash: servicedPreview.data.impactHash }),
      ),
    ).toMatchObject({ ok: true, data: { deletedItemIds: servicedItemIds, failedItemIds: [] } });
    expect(await f.rows(servicedRow)).toBeNull();
    expect((await f.rows(service))?.deletedAt).not.toBeNull();
    expect(await f.restore({ batchId: serviceDelete.trashBatchId as string })).toMatchObject({
      ok: true,
      data: { restoredRecords: 1, droppedLinks: 1, blocked: [] },
    });
    expect(await f.value(service, "service.name")).toBe("Consulting");
    expect(await f.inconsistencies()).toEqual([]);
  }, 180_000);

  it("5: a delete and a restore beyond the synchronous budget run in the background and stay consistent", async () => {
    const f = await fixture();
    const acme = await organization(f, "Acme");
    const parents = await seedDeals(f, acme, 3, 180);
    expect(await f.values(acme, ["organization.dealCount", "organization.dealSum", "organization.quantity"])).toEqual({
      "organization.dealCount": 3,
      "organization.dealSum": 6,
      "organization.quantity": 540,
    });
    expect(await f.inconsistencies()).toEqual([]);
    const deleted = await f.removeMany(parents);
    if (!deleted.ok || deleted.data.status !== "pending") throw new Error(JSON.stringify(deleted));
    const deletion = await f.drain(deleted.data.operationId);
    expect(deletion).toMatchObject({ state: "completed", result: { trashBatchId: deleted.data.operationId } });
    expect(await f.values(acme, ["organization.dealCount", "organization.dealSum", "organization.quantity"])).toEqual({
      "organization.dealCount": 0,
      "organization.dealSum": 0,
      "organization.quantity": 0,
    });
    expect(await f.inconsistencies()).toEqual([]);
    const items = await f.items(deleted.data.operationId);
    expect(items).toHaveLength(3);
    const restored = await f.restore({ batchId: deleted.data.operationId });
    if (!restored.ok || restored.data.status !== "pending") throw new Error(JSON.stringify(restored));
    const restore = await f.drain(restored.data.operationId);
    expect(restore).toMatchObject({
      state: "completed",
      result: { restore: { restoredRecords: 543, blocked: [], droppedLinks: 0 } },
    });
    expect(await f.values(acme, ["organization.dealCount", "organization.dealSum", "organization.quantity"])).toEqual({
      "organization.dealCount": 3,
      "organization.dealSum": 6,
      "organization.quantity": 540,
    });
    for (const parent of parents) expect(await f.value(parent, "deal.totalQuantity")).toBe(180);
    expect(await f.inconsistencies()).toEqual([]);

    const purged = await f.removeMany(parents, true);
    if (!purged.ok || purged.data.status !== "pending") throw new Error(JSON.stringify(purged));
    expect(await f.drain(purged.data.operationId)).toMatchObject({ state: "completed", errorCode: null });
    expect(await f.items(purged.data.operationId)).toEqual([]);
    expect(
      await runWithoutTenant(() =>
        prisma.crmRecord.count({
          where: { companyId: f.seed.company.id, typeId: { in: [f.id("deal"), f.id("lineItem")] } },
        }),
      ),
    ).toBe(0);
    expect(await f.values(acme, ["organization.dealCount", "organization.dealSum", "organization.quantity"])).toEqual({
      "organization.dealCount": 0,
      "organization.dealSum": 0,
      "organization.quantity": 0,
    });
    expect(await f.inconsistencies()).toEqual([]);
  }, 900_000);

  it("6: snapshots keep their captured values across Trash and restore", async () => {
    const f = await fixture();
    const service = await f.created({
      action: "create",
      typeId: f.id("service"),
      fields: [
        { fieldId: f.id("service.name"), value: text("Audit") },
        { fieldId: f.id("service.amount"), value: euro("50") },
      ],
    });
    const parent = await deal(f, "Snap", "7");
    const row = await lineItem(f, parent, "1", service);
    await f.update(row, [{ fieldId: f.id("lineItem.pricingMode"), value: { kind: "select", value: "saved" } }]);
    expect(await f.value(row, "lineItem.savedPrice")).toBe(50);
    await f.update(parent, [{ fieldId: f.id("deal.amount"), value: decimal("8") }]);
    expect(await f.value(parent, "deal.firstAmount")).toBe(7);
    const removed = await f.remove(parent);
    await f.update(service, [{ fieldId: f.id("service.amount"), value: euro("80") }]);
    await f.restore({ batchId: removed.trashBatchId as string });
    expect(await f.value(row, "lineItem.savedPrice")).toBe(50);
    expect(await f.value(row, "lineItem.effectivePrice")).toBe(50);
    expect(await f.value(parent, "deal.firstAmount")).toBe(7);
    expect(await f.value(parent, "deal.totalValue")).toBe(50);
    expect(await f.inconsistencies()).toEqual([]);
  }, 180_000);

  it("7: permanent deletion, Empty Trash and expiry leave the surviving rollups consistent", async () => {
    const f = await fixture();
    const acme = await organization(f, "Acme");
    const deals = [await deal(f, "A", "1", acme), await deal(f, "B", "2", acme), await deal(f, "C", "4", acme)];
    const first = await f.remove(deals[0]);
    const listed = await runWithTenant(f.admin, () => f.trash.query.invoke({} as never));
    const itemIds = listed.ok ? listed.data.items.map((item) => item.id) : [];
    const preview = await runWithTenant(f.admin, () => f.trash.preview.invoke({ itemIds }));
    if (!preview.ok) throw new Error("Preview failed");
    expect(preview.data.removedLinks).toBe(1);
    expect(
      await runWithTenant(f.admin, () =>
        f.trash.remove.invoke({ itemIds, expectedImpactHash: preview.data.impactHash }),
      ),
    ).toMatchObject({ ok: true, data: { deletedItemIds: itemIds } });
    expect(await f.rows(deals[0])).toBeNull();
    expect(await f.values(acme, ["organization.dealCount", "organization.dealSum"])).toEqual({
      "organization.dealCount": 2,
      "organization.dealSum": 6,
    });
    expect(await f.inconsistencies()).toEqual([]);
    expect(first.trashBatchId).toEqual(expect.any(String));

    await f.remove(deals[1]);
    const everything = await runWithTenant(f.admin, () => f.trash.preview.invoke({ all: true }));
    if (!everything.ok) throw new Error("Preview failed");
    expect(
      await runWithTenant(f.admin, () => f.trash.empty.invoke({ expectedImpactHash: everything.data.impactHash })),
    ).toMatchObject({ ok: true });
    expect(await f.values(acme, ["organization.dealCount", "organization.dealSum"])).toEqual({
      "organization.dealCount": 1,
      "organization.dealSum": 4,
    });
    expect(await f.inconsistencies()).toEqual([]);

    await f.remove(deals[2]);
    const expired = await runWithoutTenant(() =>
      f.trash.expire.invoke({
        companyId: f.seed.company.id,
        now: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString(),
        after: null,
      }),
    );
    expect(expired).toMatchObject({ deleted: 1, failed: 0 });
    expect(await f.values(acme, ["organization.dealCount", "organization.dealSum"])).toEqual({
      "organization.dealCount": 0,
      "organization.dealSum": 0,
    });
    expect(await f.inconsistencies()).toEqual([]);
  }, 180_000);

  it("9: a member sees and restores only their own deals while rollups stay company wide", async () => {
    const f = await fixture();
    const acme = await organization(f, "Acme");
    const mine = await f.created({
      action: "create",
      typeId: f.id("deal"),
      fields: [
        { fieldId: f.id("deal.name"), value: text("Mine") },
        { fieldId: f.id("deal.amount"), value: decimal("10") },
      ],
      links: [{ relationId: f.id("deal.account"), direction: "outgoing", record: acme }],
      assignedUserIds: [f.member.id],
    });
    const theirs = await deal(f, "Theirs", "20", acme);
    const own = await f.remove(mine, f.member);
    const other = await f.remove(theirs);
    expect(await f.values(acme, ["organization.dealCount", "organization.dealSum"])).toEqual({
      "organization.dealCount": 0,
      "organization.dealSum": 0,
    });
    const listed = await runWithTenant(f.member, () => f.trash.query.invoke({} as never));
    expect(listed.ok && listed.data.items.map((item) => item.batchId)).toEqual([own.trashBatchId]);
    const otherItemIds = (await f.items(other.trashBatchId as string)).map((item) => item.id);
    expect(await f.restore({ itemIds: otherItemIds }, f.member)).toMatchObject({ ok: false });
    const ownItemIds = (await f.items(own.trashBatchId as string)).map((item) => item.id);
    expect(await f.restore({ batchId: own.trashBatchId as string }, f.member)).toEqual({
      ok: true,
      data: { status: "completed", restoredItemIds: ownItemIds, blocked: [], restoredRecords: 1, droppedLinks: 0 },
    });
    expect(await f.values(acme, ["organization.dealCount", "organization.dealSum"])).toEqual({
      "organization.dealCount": 1,
      "organization.dealSum": 10,
    });
    expect(await f.value(mine, "deal.accountName")).toBe("Acme");
    expect((await f.rows(theirs))?.deletedAt).not.toBeNull();
    expect(await f.inconsistencies()).toEqual([]);
  }, 180_000);

  it("10: line items whose deal and service links share one id, as upgraded ones do, come back with every link", async () => {
    const f = await fixture();
    const service = await f.created({
      action: "create",
      typeId: f.id("service"),
      fields: [
        { fieldId: f.id("service.name"), value: text("Consulting") },
        { fieldId: f.id("service.amount"), value: euro("100") },
      ],
    });
    const parent = await deal(f, "Upgraded", "1");
    const rows = [await lineItem(f, parent, "2", service), await lineItem(f, parent, "3", service)];
    await shareLinkIds(f, rows);
    const liveLinks = () =>
      runWithoutTenant(() =>
        prisma.recordLink.count({
          where: { companyId: f.seed.company.id, sourceId: { in: rows.map((row) => row.recordId) }, deletedAt: null },
        }),
      );
    expect(await liveLinks()).toBe(4);
    expect(await f.value(service, "service.quantitySold")).toBe(5);

    const rowDelete = await f.remove(rows[0]);
    expect(await f.value(service, "service.quantitySold")).toBe(3);
    expect(await f.restore({ batchId: rowDelete.trashBatchId as string })).toMatchObject({
      ok: true,
      data: { restoredRecords: 1, droppedLinks: 0, blocked: [] },
    });
    expect(await liveLinks()).toBe(4);
    expect(await f.value(service, "service.quantitySold")).toBe(5);

    const dealDelete = await f.remove(parent);
    expect(await f.value(service, "service.quantitySold")).toBe(0);
    expect(await f.restore({ batchId: dealDelete.trashBatchId as string })).toMatchObject({
      ok: true,
      data: { restoredRecords: 3, droppedLinks: 0, blocked: [] },
    });
    expect(await liveLinks()).toBe(4);
    expect(await f.value(service, "service.quantitySold")).toBe(5);
    expect(await f.values(parent, ["deal.totalQuantity", "deal.totalValue"])).toEqual({
      "deal.totalQuantity": 5,
      "deal.totalValue": 500,
    });
    expect(await f.inconsistencies()).toEqual([]);

    const again = await f.remove(parent);
    const items = await f.items(again.trashBatchId as string);
    const operationId = await runWithTenant(f.admin, () =>
      runInTransaction(() => f.handler.restoreInBackground(items)),
    );
    expect(await f.drain(operationId)).toMatchObject({
      state: "completed",
      result: { restore: { restoredRecords: 3, droppedLinks: 0, blocked: [] } },
    });
    expect(await liveLinks()).toBe(4);
    expect(await f.value(service, "service.quantitySold")).toBe(5);
    expect(await f.inconsistencies()).toEqual([]);
  }, 180_000);

  it("10b: deleting and restoring more than 500 line items that share link ids in the background keeps rollups current", async () => {
    const f = await fixture();
    const service = (name: string) =>
      f.created({
        action: "create",
        typeId: f.id("service"),
        fields: [
          { fieldId: f.id("service.name"), value: text(name) },
          { fieldId: f.id("service.amount"), value: euro("100") },
        ],
      });
    const shared = await service("Shared");
    const own = await service("Own");
    const parent = await deal(f, "Upgraded in bulk", "1");
    const rows = await seedLineItemsSharingLinkIds(f, parent, (index) => (index === 24 ? own : shared), 501);
    const liveLinks = () =>
      runWithoutTenant(() =>
        prisma.recordLink.count({
          where: { companyId: f.seed.company.id, sourceId: { in: rows.map((row) => row.recordId) }, deletedAt: null },
        }),
      );
    expect(await f.value(parent, "deal.totalQuantity")).toBe(501);
    expect(await f.values(own, ["service.quantitySold"])).toEqual({ "service.quantitySold": 1 });
    expect(await f.values(shared, ["service.quantitySold"])).toEqual({ "service.quantitySold": 500 });
    expect(await liveLinks()).toBe(1002);
    const ownLinkEvent = async () =>
      (
        await runWithoutTenant(() =>
          prisma.eventLog.findMany({
            where: { companyId: f.seed.company.id, subjectId: own.recordId, kind: "record.updated" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { payload: true },
          }),
        )
      )[0]?.payload;

    const expectedVersion = await f.version(parent);
    const preview = await runWithTenant(f.admin, async () =>
      new PreviewRecordDeletionInteractor(
        f.repo,
        f.policy,
        new RecordWriteService(f.repo, f.policy, new RecordCalculationService(f.repo)),
      ).invoke({ ref: parent, expectedVersion, expectedRevision: (await f.repo.getState())?.revision ?? 0 }),
    );
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    const deleted = await f.mutation({
      action: "delete",
      ref: parent,
      expectedVersion,
      expectedImpactHash: preview.data.impactHash,
    });
    if (!deleted.ok || deleted.data.status !== "pending") throw new Error(JSON.stringify(deleted));
    expect(await f.drain(deleted.data.operationId)).toMatchObject({ state: "completed", errorCode: null });
    expect(await f.value(own, "service.quantitySold")).toBe(0);
    expect(await f.value(shared, "service.quantitySold")).toBe(0);
    expect(await liveLinks()).toBe(0);
    expect(await ownLinkEvent()).toMatchObject({
      links: [{ relationId: f.id("lineItem.service"), source: rows[24], target: own, before: true, after: false }],
    });
    expect(await f.inconsistencies()).toEqual([]);

    const restored = await f.restore({ batchId: deleted.data.operationId });
    if (!restored.ok || restored.data.status !== "pending") throw new Error(JSON.stringify(restored));
    expect(await f.drain(restored.data.operationId)).toMatchObject({
      state: "completed",
      result: { restore: { restoredRecords: 502, droppedLinks: 0, blocked: [] } },
    });
    expect(await liveLinks()).toBe(1002);
    expect(await ownLinkEvent()).toMatchObject({
      links: [{ relationId: f.id("lineItem.service"), source: rows[24], target: own, before: false, after: true }],
    });
    expect(await f.value(own, "service.quantitySold")).toBe(1);
    expect(await f.value(shared, "service.quantitySold")).toBe(500);
    expect(await f.value(parent, "deal.totalQuantity")).toBe(501);
    expect(await f.inconsistencies()).toEqual([]);
  }, 900_000);

  it("11: a line item deleted with its service waits in Trash for its deal and never blocks configuration", async () => {
    const f = await fixture();
    const service = await f.created({
      action: "create",
      typeId: f.id("service"),
      fields: [
        { fieldId: f.id("service.name"), value: text("Consulting") },
        { fieldId: f.id("service.amount"), value: euro("100") },
      ],
    });
    const parent = await deal(f, "Waiting", "1");
    const row = await lineItem(f, parent, "2", service);
    const cardinality = () =>
      runWithTenant(f.admin, () =>
        runInTransaction(async () => f.repo.validateRelationshipCardinality(await f.repo.getModel())),
      );
    const removeBoth = async () => {
      const serviceDelete = await f.remove(service);
      expect((await f.rows(row))?.trashItemId).toBe((await f.items(serviceDelete.trashBatchId as string))[0].id);
      const dealDelete = await f.remove(parent);
      return {
        serviceItems: await f.items(serviceDelete.trashBatchId as string),
        dealItems: await f.items(dealDelete.trashBatchId as string),
      };
    };
    const live = async () => {
      expect(await f.value(service, "service.quantitySold")).toBe(2);
      expect(await f.values(parent, ["deal.totalQuantity", "deal.totalValue"])).toEqual({
        "deal.totalQuantity": 2,
        "deal.totalValue": 200,
      });
      expect(await cardinality()).toEqual([]);
      expect(await f.inconsistencies()).toEqual([]);
    };

    const first = await removeBoth();
    expect(await f.restore({ itemIds: first.serviceItems.map((item) => item.id) })).toMatchObject({
      ok: true,
      data: { restoredRecords: 1, droppedLinks: 0, blocked: [] },
    });
    expect((await f.rows(service))?.deletedAt).toBeNull();
    expect((await f.rows(row))?.trashItemId).toBe(first.dealItems[0].id);
    expect(await cardinality()).toEqual([]);
    expect(await f.value(service, "service.quantitySold")).toBe(0);
    expect(await f.inconsistencies()).toEqual([]);
    expect(await f.restore({ itemIds: first.dealItems.map((item) => item.id) })).toMatchObject({
      ok: true,
      data: { restoredRecords: 2, droppedLinks: 0, blocked: [] },
    });
    await live();

    const together = await removeBoth();
    expect(
      await f.restore({ itemIds: [...together.serviceItems, ...together.dealItems].map((item) => item.id) }),
    ).toMatchObject({ ok: true, data: { restoredRecords: 3, droppedLinks: 0, blocked: [] } });
    await live();

    const background = await removeBoth();
    const operationId = await runWithTenant(f.admin, () =>
      runInTransaction(() => f.handler.restoreInBackground(background.serviceItems)),
    );
    expect(await f.drain(operationId)).toMatchObject({
      state: "completed",
      result: { restore: { restoredRecords: 1, droppedLinks: 0, blocked: [] } },
    });
    expect((await f.rows(row))?.trashItemId).toBe(background.dealItems[0].id);
    expect(await cardinality()).toEqual([]);
    expect(await f.restore({ itemIds: background.dealItems.map((item) => item.id) })).toMatchObject({
      ok: true,
      data: { restoredRecords: 2, droppedLinks: 0, blocked: [] },
    });
    await live();

    const orphaned = await removeBoth();
    await runWithoutTenant(async () => {
      await prisma.crmRecord.delete({
        where: {
          companyId_typeId_id: { companyId: f.seed.company.id, typeId: parent.typeId, id: parent.recordId },
        },
      });
      await prisma.trashItem.deleteMany({ where: { id: { in: orphaned.dealItems.map((item) => item.id) } } });
    });
    expect(await f.restore({ itemIds: orphaned.serviceItems.map((item) => item.id) })).toMatchObject({
      ok: true,
      data: { restoredItemIds: [], blocked: [{ itemId: orphaned.serviceItems[0].id, reason: "parentDeleted" }] },
    });
    expect((await f.rows(row))?.deletedAt).not.toBeNull();
    expect(await cardinality()).toEqual([]);
  }, 180_000);

  it("12: a member sees and restores the line items of their own deals and nothing of other deals", async () => {
    const f = await fixture();
    await runWithTenant(f.admin, () =>
      runInTransaction(
        () =>
          f.repo.setGrants(f.id("deal"), [
            { roleId: f.seed.memberRole.id, actions: ["readOwn", "create", "update", "delete"] },
          ]),
        { timeout: 30000 },
      ),
    );
    const mine = await deal(f, "Mine", "1", undefined, f.member);
    const theirs = await deal(f, "Theirs", "1");
    const myRows = [
      await f.created(
        {
          action: "create",
          typeId: f.id("lineItem"),
          fields: [{ fieldId: f.id("lineItem.quantity"), value: decimal("2") }],
          links: [{ relationId: f.id("lineItem.deal"), direction: "outgoing", record: mine }],
        },
        f.member,
      ),
      await f.created(
        {
          action: "create",
          typeId: f.id("lineItem"),
          fields: [{ fieldId: f.id("lineItem.quantity"), value: decimal("3") }],
          links: [{ relationId: f.id("lineItem.deal"), direction: "outgoing", record: mine }],
        },
        f.member,
      ),
    ];
    const theirRow = await lineItem(f, theirs, "4");
    const myRowDelete = await f.remove(myRows[0], f.member);
    const theirRowDelete = await f.remove(theirRow);
    expect(await f.value(mine, "deal.totalQuantity")).toBe(3);
    const listed = await runWithTenant(f.member, () => f.trash.query.invoke({} as never));
    expect(listed.ok && listed.data.items.map((item) => item.batchId)).toEqual([myRowDelete.trashBatchId]);
    expect(await f.restore({ batchId: theirRowDelete.trashBatchId as string }, f.member)).toMatchObject({ ok: false });
    expect(await f.restore({ batchId: myRowDelete.trashBatchId as string }, f.member)).toMatchObject({
      ok: true,
      data: { restoredRecords: 1, droppedLinks: 0, blocked: [] },
    });
    expect(await f.value(mine, "deal.totalQuantity")).toBe(5);

    const myDealDelete = await f.remove(mine, f.member);
    const ownDeal = await runWithTenant(f.member, () => f.trash.query.invoke({} as never));
    expect(ownDeal.ok && ownDeal.data.items.map((item) => item.batchId)).toEqual([myDealDelete.trashBatchId]);
    expect(await f.restore({ batchId: myDealDelete.trashBatchId as string }, f.member)).toMatchObject({
      ok: true,
      data: { restoredRecords: 3, droppedLinks: 0, blocked: [] },
    });
    expect(await f.value(mine, "deal.totalQuantity")).toBe(5);
    expect((await f.rows(theirRow))?.deletedAt).not.toBeNull();
    expect(await f.inconsistencies()).toEqual([]);
  }, 180_000);
});
