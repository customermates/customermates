import { PermissionService } from "@/core/base/permission.service";
import type { ConfigurationChange, ConfigurationTarget } from "../configuration.schema";
import type { CalculationExpression, RecordField, RecordRef, RecordScalar } from "../record-model.schema";
import type { TenantUser } from "@/features/user/user.schema";

import { randomUUID } from "node:crypto";
import { omit } from "lodash";
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
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { WebhookPauseNotifier } = await import("@/features/webhook/webhook-pause-notifier");
const { RecordAccessPolicy } = await import("../record-access");
const { RecordCalculationService } = await import("../record-calculation.service");
const { RecordWriteService } = await import("../record-write.service");
const { RecordConfigurationService } = await import("../configuration.service");
const { RecordConfigurationWriter } = await import("../record-configuration-writer");
const { MutateRecordInteractor } = await import("../mutate-record.interactor");
const { RecordTrashService } = await import("../record-trash.service");
const { GetRecordInteractor } = await import("../get-record.interactor");
const { ApplyRecordConfigurationInteractor } = await import("../configure-records.interactor");
const { PreviewRecordConfigurationInteractor } = await import("../preview-record-configuration.interactor");
const { ConfigurationTrashHandler } = await import("../configuration-trash.handler");
const { ConfigurationSystemPurge } = await import("../configuration-system-purge");
const { RecordTrashHandler } = await import("../record-trash.handler");
const { PrismaTrashRepo } = await import("@/features/trash/prisma-trash.repository");
const { QueryTrashInteractor } = await import("@/features/trash/query-trash.interactor");
const { RestoreTrashInteractor } = await import("@/features/trash/restore-trash.interactor");
const { PreviewTrashDeletionInteractor } = await import("@/features/trash/preview-trash-deletion.interactor");
const { DeleteTrashPermanentlyInteractor } = await import("@/features/trash/delete-trash-permanently.interactor");
const { PurgeCompanyTrashInteractor } = await import("@/features/trash/purge-company-trash.interactor");
const { createCrmPreset, presetId } = await import("../crm-preset");
const { createTestRecordOperationService, createTestRecordRepo } = await import("@/tests/helpers/record-repository");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];
const noWebhooks = new WebhookPauseNotifier(
  { getWebhookByIdOrThrow: () => Promise.reject(new Error("No webhook expected")) },
  { publish: () => Promise.resolve() },
);

const decimal = (value: string, currency: string | null = null): RecordScalar => ({ kind: "decimal", value, currency });
const date = (value: string): RecordScalar => ({ kind: "date", value });
const choice = (value: string): RecordScalar => ({ kind: "select", value });
const money = (value: string) => ({ state: "value", value: decimal(value, "EUR") });
const number = (value: string) => ({ state: "value", value: decimal(value) });
const field = (fieldId: string): CalculationExpression => ({ kind: "field", fieldId });

type DefinedField = Omit<RecordField, "publishedSummary">;

async function fixture() {
  const seed = await runWithoutTenant(async () => {
    const company = await prisma.company.create({ data: {} });
    companies.push(company.id);
    const role = (name: string, isSystemRole = false) =>
      prisma.userRole.create({ data: { companyId: company.id, name, isSystemRole } });
    const roles = {
      admin: await role("Administrator", true),
      member: await role("Member"),
      schema: await role("Schema"),
    };
    await prisma.rolePermission.create({
      data: { companyId: company.id, roleId: roles.schema.id, resource: "dataModel", action: "update" },
    });
    const user = (roleId: string, firstName: string) =>
      prisma.user.create({
        data: {
          companyId: company.id,
          roleId,
          firstName,
          lastName: "Test",
          email: `${randomUUID()}@example.test`,
          status: "active",
        },
      });
    return {
      company,
      roles,
      users: {
        admin: await user(roles.admin.id, "Admin"),
        member: await user(roles.member.id, "Member"),
        schema: await user(roles.schema.id, "Schema"),
      },
    };
  });
  const companyId = seed.company.id;
  const tenant = (key: keyof typeof seed.users) =>
    createMockUser({
      ...seed.users[key],
      role: { ...seed.roles[key], permissions: [] },
    });
  const admin = tenant("admin");
  const member = tenant("member");
  const schemaManager = tenant("schema");
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
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    new RecordWriteService(repo, policy, new RecordCalculationService(repo)),
    { dispatch: () => Promise.resolve() },
    new RecordTrashService(repo, new RecordCalculationService(repo)),
  );
  const read = new GetRecordInteractor(repo, policy);
  const worker = createTestRecordOperationService(repo, policy, configurations, noWebhooks);
  const handlers = () => {
    const scoped = createTestRecordRepo(companyId);
    const scopedPolicy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), scoped);
    const scopedConfigurations = new RecordConfigurationService(scoped);
    const writer = new RecordConfigurationWriter(scoped, new RecordCalculationService(scoped), noWebhooks);
    return [
      new ConfigurationTrashHandler(
        scoped,
        scopedPolicy,
        new PreviewRecordConfigurationInteractor(scoped, scopedPolicy, scopedConfigurations),
        new ApplyRecordConfigurationInteractor(scoped, scopedPolicy, scopedConfigurations, writer, {
          dispatch: () => Promise.resolve(),
        }),
        new PrismaTrashRepo(companyId),
        new ConfigurationSystemPurge(scoped, scopedConfigurations, writer, new PrismaTrashRepo(companyId), {
          dispatch: () => Promise.resolve(),
        }),
      ),
      new RecordTrashHandler(
        scoped,
        scopedPolicy,
        { dispatch: () => Promise.resolve() },
        new RecordTrashService(scoped, new RecordCalculationService(scoped)),
      ),
    ];
  };
  const trashRepo = new PrismaTrashRepo();
  const trash = {
    query: new QueryTrashInteractor(trashRepo, repo, handlers(), new PrismaUserRepo(new PermissionService())),
    restore: new RestoreTrashInteractor(trashRepo, handlers()),
    preview: new PreviewTrashDeletionInteractor(trashRepo, handlers()),
    remove: new DeleteTrashPermanentlyInteractor(trashRepo, handlers()),
    purge: new PurgeCompanyTrashInteractor(
      (scoped) => new PrismaTrashRepo(scoped),
      () => handlers(),
    ),
  };

  const id = (key: string) => presetId(companyId, key);
  const dealTypeId = id("deal");
  const organizationTypeId = id("organization");
  const model = createCrmPreset(companyId);
  const customer = randomUUID();
  model.relationships.push({
    id: customer,
    sourceTypeId: dealTypeId,
    targetTypeId: organizationTypeId,
    sourceLabel: "Customer",
    targetLabel: "Orders",
    sourceCardinality: "one",
    targetCardinality: "many",
    onSourceDelete: "unlink",
    onTargetDelete: "unlink",
    messagesOnSource: false,
    messagesOnTarget: false,
    archived: false,
  });
  const position = model.fields.length;
  const base = { required: false, archived: false as const, options: [] };
  const currency = (label: string, typeId: string, behavior: DefinedField["behavior"], offset: number) => ({
    ...base,
    id: randomUUID(),
    typeId,
    label,
    valueType: "currency" as const,
    behavior,
    format: { currency: "EUR" },
    position: position + offset,
  });
  const credit: DefinedField = currency("Credit", organizationTypeId, { kind: "input" }, 0);
  const net: DefinedField = currency("Net", dealTypeId, { kind: "input" }, 1);
  const quantity: DefinedField = {
    ...base,
    id: randomUUID(),
    typeId: dealTypeId,
    label: "Quantity",
    valueType: "number",
    behavior: { kind: "input" },
    position: position + 2,
  };
  const gross: DefinedField = currency(
    "Gross",
    dealTypeId,
    {
      kind: "formula",
      expression: { kind: "operation", operator: "multiply", arguments: [field(net.id), field(quantity.id)] },
    },
    3,
  );
  const customerCredit: DefinedField = currency(
    "Customer credit",
    dealTypeId,
    {
      kind: "lookup",
      expression: {
        kind: "related",
        relationId: customer,
        direction: "outgoing",
        reducer: "one",
        expression: field(credit.id),
      },
    },
    4,
  );
  const ordered: DefinedField = currency(
    "Ordered",
    organizationTypeId,
    {
      kind: "rollup",
      expression: {
        kind: "related",
        relationId: customer,
        direction: "incoming",
        reducer: "sum",
        expression: field(net.id),
      },
    },
    5,
  );
  const fields = { credit, net, quantity, gross, customerCredit, ordered };
  model.fields.push(...Object.values(fields).map((entry) => ({ ...entry, publishedSummary: false })));
  await runWithTenant(admin, () => runInTransaction(() => repo.saveModel(model, admin.id), { timeout: 30000 }));

  const as = <T>(fn: () => Promise<T>, user: TenantUser = admin) => runWithTenant(user, fn);
  const revision = async () =>
    (await runWithoutTenant(() => prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId } }))).revision;
  const configure = async (operations: ConfigurationChange["operations"]) => {
    const result = await as(async () =>
      apply.invoke({ expectedRevision: await revision(), idempotencyKey: randomUUID(), operations }),
    );
    if (!result.ok) throw new Error(JSON.stringify(result));
    return result.data;
  };
  const getModel = () => as(() => repo.getModel());
  const remove = async (target: ConfigurationTarget) => {
    const result = await configure([{ operation: "delete", target }]);
    if (result.status !== "completed") throw new Error(JSON.stringify(result));
    const item = await runWithoutTenant(() =>
      prisma.trashItem.findFirstOrThrow({ where: { companyId, targetId: target.id } }),
    );
    return item.id;
  };
  const restore = (itemIds: string[], user: TenantUser = admin) => as(() => trash.restore.invoke({ itemIds }), user);
  const items = () =>
    runWithoutTenant(() => prisma.trashItem.findMany({ where: { companyId }, orderBy: { deletedAt: "asc" } }));
  const complete = async (operationId: string) => {
    let done = false;
    for (let step = 0; step < 2000 && !done; step++) done = (await as(() => worker.advance(operationId))).done;
    expect(done).toBe(true);
    return as(() => createTestRecordRepo().getOperation(operationId));
  };
  const value = async (ref: RecordRef, target: { id: string }) => {
    const result = await as(() => read.invoke(ref));
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    return result.data.fields.find((candidate) => candidate.fieldId === target.id)?.result;
  };
  const stored = async (fieldIds: string[]) => {
    const rows = await runWithoutTenant(() =>
      prisma.recordValue.findMany({
        where: { companyId, fieldId: { in: fieldIds } },
        select: { recordId: true, fieldId: true, decimalValue: true },
      }),
    );
    return new Map(rows.map((row) => [`${row.fieldId}:${row.recordId}`, row.decimalValue?.toString()]));
  };
  const version = async (ref: RecordRef) =>
    (
      await runWithoutTenant(() =>
        prisma.crmRecord.findUniqueOrThrow({
          where: { companyId_typeId_id: { companyId, typeId: ref.typeId, id: ref.recordId } },
          select: { version: true },
        }),
      )
    ).version;
  const mutation = async (input: Parameters<typeof mutate.invoke>[0]["mutation"]) => {
    const result = await as(async () =>
      mutate.invoke({ expectedRevision: await revision(), idempotencyKey: randomUUID(), mutation: input }),
    );
    if (!result.ok || result.data.status !== "completed") throw new Error(JSON.stringify(result));
    return result.data;
  };
  const create = async (
    typeId: string,
    nameKey: string,
    values: Array<[{ id: string }, RecordScalar]>,
    links: Array<{ relationId: string; direction: "outgoing"; record: RecordRef }> = [],
  ) => {
    const result = await mutation({
      action: "create",
      typeId,
      fields: [
        { fieldId: id(nameKey), value: { kind: "text", value: "Record" } },
        ...values.map(([entry, scalar]) => ({ fieldId: entry.id, value: scalar })),
      ],
      links,
    });
    const ref = result.refs.find((candidate) => candidate.typeId === typeId);
    if (!ref) throw new Error("The created reference is missing");
    return ref;
  };
  const update = async (ref: RecordRef, values: Array<[{ id: string }, RecordScalar | null]>) =>
    mutation({
      action: "update",
      ref,
      expectedVersion: await version(ref),
      fields: values.map(([entry, scalar]) => ({ fieldId: entry.id, value: scalar })),
    });
  const trashRecord = async (ref: RecordRef) => {
    await mutation({ action: "delete", ref, expectedVersion: await version(ref) });
    return (
      await runWithoutTenant(() =>
        prisma.trashItem.findFirstOrThrow({ where: { companyId, kind: "record", targetId: ref.recordId } }),
      )
    ).id;
  };
  const organization = (amount: string) =>
    create(organizationTypeId, "organization.name", [[fields.credit, decimal(amount, "EUR")]]);
  const order = (
    organizationRef: RecordRef | null,
    netValue: string,
    quantityValue: string,
    extra: Array<[{ id: string }, RecordScalar]> = [],
  ) =>
    create(
      dealTypeId,
      "deal.name",
      [[net, decimal(netValue, "EUR")], [quantity, decimal(quantityValue)], ...extra],
      organizationRef ? [{ relationId: customer, direction: "outgoing", record: organizationRef }] : [],
    );
  const insertOrders = async (count: number, organizations: string[]) => {
    const deals = Array.from({ length: count }, () => randomUUID());
    await runWithoutTenant(() =>
      runInTransaction(async () => {
        await prisma.crmRecord.createMany({
          data: [
            ...organizations.map((recordId) => ({ companyId, typeId: organizationTypeId, id: recordId })),
            ...deals.map((recordId) => ({ companyId, typeId: dealTypeId, id: recordId })),
          ],
        });
        await prisma.recordValue.createMany({
          data: deals.flatMap((recordId, index) => [
            {
              companyId,
              typeId: dealTypeId,
              recordId,
              fieldId: net.id,
              state: "value" as const,
              decimalValue: 10,
              currency: "EUR",
              schemaRevision: 1,
            },
            {
              companyId,
              typeId: dealTypeId,
              recordId,
              fieldId: quantity.id,
              state: "value" as const,
              decimalValue: index + 1,
              schemaRevision: 1,
            },
          ]),
        });
        await prisma.recordLink.createMany({
          data: deals.map((recordId, index) => ({
            companyId,
            relationId: customer,
            sourceTypeId: dealTypeId,
            sourceId: recordId,
            targetTypeId: organizationTypeId,
            targetId: organizations[index % organizations.length],
          })),
        });
      }),
    );
    return deals;
  };
  let extraPosition = position + 20;
  const extraField = (typeId: string, label: string, rest: Partial<DefinedField> & Pick<DefinedField, "valueType">) =>
    ({
      ...base,
      id: randomUUID(),
      typeId,
      label,
      behavior: { kind: "input" },
      position: extraPosition++,
      ...rest,
    }) as DefinedField;
  return {
    ...fields,
    companyId,
    admin,
    member,
    schemaManager,
    id,
    customer,
    dealTypeId,
    organizationTypeId,
    as,
    trash,
    configure,
    getModel,
    remove,
    restore,
    items,
    complete,
    value,
    stored,
    mutation,
    create,
    update,
    trashRecord,
    organization,
    order,
    insertOrders,
    extraField,
  };
}

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

describeDatabase("restoring calculated fields from Trash", () => {
  it("recalculates a restored formula from the inputs changed while it was in Trash, also on records restored later", async () => {
    const f = await fixture();
    const acme = await f.organization("100");
    const first = await f.order(acme, "10", "2");
    const second = await f.order(acme, "5", "3");
    const third = await f.order(null, "7", "1");
    expect(await f.value(first, f.gross)).toEqual(money("20"));

    const itemId = await f.remove({ kind: "field", id: f.gross.id });
    await f.update(first, [[f.quantity, decimal("4")]]);
    await f.update(third, [[f.net, null]]);
    const fourth = await f.order(acme, "3", "3");
    const trashed = await f.trashRecord(second);

    expect(await f.restore([itemId])).toMatchObject({
      ok: true,
      data: { status: "completed", restoredItemIds: [itemId], blocked: [] },
    });
    expect((await f.items()).map((item) => item.id)).toEqual([trashed]);
    expect(await f.value(first, f.gross)).toEqual(money("40"));
    expect(await f.value(third, f.gross)).toEqual({ state: "missing" });
    expect(await f.value(fourth, f.gross)).toEqual(money("9"));

    expect(await f.restore([trashed])).toMatchObject({ ok: true, data: { status: "completed", blocked: [] } });
    expect(await f.value(second, f.gross)).toEqual(money("15"));
  }, 180_000);

  it("keeps a restored formula, lookup and rollup up to date when their inputs change afterwards", async () => {
    const f = await fixture();
    const acme = await f.organization("100");
    const globex = await f.organization("200");
    const deal = await f.order(acme, "10", "2");
    const itemIds = [];
    for (const target of [f.gross, f.customerCredit, f.ordered])
      itemIds.push(await f.remove({ kind: "field", id: target.id }));
    expect(await f.restore(itemIds)).toMatchObject({ ok: true, data: { status: "completed", blocked: [] } });

    await f.update(deal, [
      [f.net, decimal("20", "EUR")],
      [f.quantity, decimal("3")],
    ]);
    await f.update(acme, [[f.credit, decimal("150", "EUR")]]);
    expect(await f.value(deal, f.gross)).toEqual(money("60"));
    expect(await f.value(deal, f.customerCredit)).toEqual(money("150"));
    expect(await f.value(acme, f.ordered)).toEqual(money("20"));

    await f.mutation({ action: "unlink", relationId: f.customer, source: deal, target: acme });
    await f.mutation({ action: "link", relationId: f.customer, source: deal, target: globex });
    expect(await f.value(deal, f.customerCredit)).toEqual(money("200"));
    expect(await f.value(acme, f.ordered)).toEqual(money("0"));
    expect(await f.value(globex, f.ordered)).toEqual(money("20"));
  }, 180_000);

  it("recalculates restored lookups and rollups from the links and values changed while they were in Trash", async () => {
    const f = await fixture();
    const acme = await f.organization("100");
    const globex = await f.organization("200");
    const first = await f.order(acme, "10", "1");
    const second = await f.order(acme, "5", "1");
    const third = await f.order(globex, "7", "1");
    expect(await f.value(first, f.customerCredit)).toEqual(money("100"));
    expect(await f.value(acme, f.ordered)).toEqual(money("15"));

    const lookup = await f.remove({ kind: "field", id: f.customerCredit.id });
    const rollup = await f.remove({ kind: "field", id: f.ordered.id });
    await f.mutation({ action: "unlink", relationId: f.customer, source: first, target: acme });
    await f.mutation({ action: "link", relationId: f.customer, source: first, target: globex });
    await f.update(globex, [[f.credit, decimal("250", "EUR")]]);
    await f.update(second, [[f.net, decimal("6", "EUR")]]);
    await f.trashRecord(third);
    const fourth = await f.order(acme, "1", "1");

    expect(await f.restore([lookup, rollup])).toMatchObject({
      ok: true,
      data: { status: "completed", blocked: [], restoredItemIds: expect.arrayContaining([lookup, rollup]) },
    });
    expect(await f.value(first, f.customerCredit)).toEqual(money("250"));
    expect(await f.value(second, f.customerCredit)).toEqual(money("100"));
    expect(await f.value(fourth, f.customerCredit)).toEqual(money("100"));
    expect(await f.value(acme, f.ordered)).toEqual(money("7"));
    expect(await f.value(globex, f.ordered)).toEqual(money("10"));
  }, 180_000);

  it("recalculates restored option, date, count, minimum, maximum, average and rounded calculations together", async () => {
    const f = await fixture();
    const opened = f.extraField(f.dealTypeId, "Opened", { valueType: "date" });
    const closed = f.extraField(f.dealTypeId, "Closed", { valueType: "date" });
    const probability = f.extraField(f.dealTypeId, "Probability", {
      valueType: "number",
      behavior: {
        kind: "formula",
        expression: { kind: "optionAttribute", fieldId: f.id("deal.stage"), attribute: "probability" },
      },
    });
    const days = f.extraField(f.dealTypeId, "Days open", {
      valueType: "number",
      behavior: {
        kind: "formula",
        expression: { kind: "operation", operator: "daysBetween", arguments: [field(opened.id), field(closed.id)] },
      },
    });
    const rollup = (label: string, reducer: "count" | "min" | "max" | "average") =>
      f.extraField(f.organizationTypeId, label, {
        valueType: reducer === "count" ? "number" : "currency",
        ...(reducer === "count" ? {} : { format: { currency: "EUR", decimalPlaces: 2 } }),
        behavior: {
          kind: "rollup",
          expression: {
            kind: "related",
            relationId: f.customer,
            direction: "incoming",
            reducer,
            expression: field(f.net.id),
          },
        },
      });
    const count = rollup("Orders", "count");
    const lowest = rollup("Smallest order", "min");
    const highest = rollup("Largest order", "max");
    const average = rollup("Average order", "average");
    await f.configure(
      [opened, closed, probability, days, count, lowest, highest, average].map((entry) => ({
        operation: "putField" as const,
        field: entry,
      })),
    );
    const stage = (key: string) => choice(f.id(`deal.stage.${key}`));
    const acme = await f.organization("100");
    const globex = await f.organization("200");
    const first = await f.order(acme, "10", "1", [
      [{ id: f.id("deal.stage") }, stage("qualified")],
      [opened, date("2026-01-01")],
      [closed, date("2026-01-11")],
    ]);
    const second = await f.order(acme, "30", "2", [[{ id: f.id("deal.stage") }, stage("won")]]);
    const third = await f.order(globex, "5", "1", [[{ id: f.id("deal.stage") }, stage("new")]]);
    const precise = await f.order(globex, "0.115", "3");
    expect(await f.value(first, days)).toEqual(number("10"));
    expect(await f.value(precise, f.gross)).toEqual(money("0.35"));
    expect(await f.value(acme, average)).toEqual(money("20"));

    const restored = [];
    for (const target of [probability, days, f.gross, count, lowest, highest, average])
      restored.push(await f.remove({ kind: "field", id: target.id }));
    await f.update(first, [
      [{ id: f.id("deal.stage") }, stage("proposal")],
      [closed, date("2026-01-31")],
      [f.net, decimal("12", "EUR")],
    ]);
    await f.mutation({ action: "unlink", relationId: f.customer, source: second, target: acme });
    await f.mutation({ action: "link", relationId: f.customer, source: second, target: globex });
    const trashed = await f.trashRecord(third);
    const fifth = await f.order(acme, "7", "2", [[{ id: f.id("deal.stage") }, stage("lost")]]);
    await f.update(precise, [[f.quantity, decimal("4")]]);

    expect(await f.restore(restored)).toMatchObject({
      ok: true,
      data: { status: "completed", blocked: [], restoredItemIds: expect.arrayContaining(restored) },
    });
    expect(await f.items()).toHaveLength(1);
    expect(await f.value(first, probability)).toEqual(number("60"));
    expect(await f.value(first, days)).toEqual(number("30"));
    expect(await f.value(first, f.gross)).toEqual(money("12"));
    expect(await f.value(second, probability)).toEqual(number("100"));
    expect(await f.value(second, days)).toEqual({ state: "missing" });
    expect(await f.value(second, f.gross)).toEqual(money("60"));
    expect(await f.value(fifth, probability)).toEqual(number("0"));
    expect(await f.value(fifth, f.gross)).toEqual(money("14"));
    expect(await f.value(precise, f.gross)).toEqual(money("0.46"));
    expect(await f.value(acme, count)).toEqual(number("2"));
    expect(await f.value(acme, lowest)).toEqual(money("7"));
    expect(await f.value(acme, highest)).toEqual(money("12"));
    expect(await f.value(acme, average)).toEqual(money("9.5"));
    expect(await f.value(globex, count)).toEqual(number("2"));
    expect(await f.value(globex, lowest)).toEqual(money("0.12"));
    expect(await f.value(globex, highest)).toEqual(money("30"));
    expect(await f.value(globex, average)).toEqual(money("15.06"));

    expect(await f.restore([trashed])).toMatchObject({ ok: true, data: { status: "completed", blocked: [] } });
    expect(await f.value(third, probability)).toEqual(number("10"));
    expect(await f.value(third, f.gross)).toEqual(money("5"));
    expect(await f.value(globex, count)).toEqual(number("3"));
    expect(await f.value(globex, average)).toEqual(money("11.71"));
  }, 180_000);

  it("restores a calculation together with the calculation it reads in one request and names what is missing", async () => {
    const f = await fixture();
    const doubled = f.extraField(f.dealTypeId, "Doubled", {
      valueType: "currency",
      format: { currency: "EUR" },
      behavior: {
        kind: "formula",
        expression: {
          kind: "operation",
          operator: "multiply",
          arguments: [field(f.gross.id), { kind: "literal", value: decimal("2") }],
        },
      },
    });
    await f.configure([{ operation: "putField", field: doubled }]);
    const acme = await f.organization("100");
    const first = await f.order(acme, "10", "2");
    expect(await f.value(first, doubled)).toEqual(money("40"));

    const dependent = await f.remove({ kind: "field", id: doubled.id });
    const source = await f.remove({ kind: "field", id: f.gross.id });
    await f.update(first, [[f.quantity, decimal("3")]]);

    expect(await f.restore([dependent])).toMatchObject({
      ok: true,
      data: {
        status: "completed",
        restoredItemIds: [],
        blocked: [{ itemId: dependent, reason: "requiresRestore", typeId: f.dealTypeId }],
      },
    });
    expect((await f.items()).map((item) => item.id)).toEqual([dependent, source]);

    expect(await f.restore([dependent, source])).toMatchObject({
      ok: true,
      data: { status: "completed", blocked: [], restoredItemIds: expect.arrayContaining([dependent, source]) },
    });
    expect(await f.items()).toEqual([]);
    expect(await f.value(first, f.gross)).toEqual(money("30"));
    expect(await f.value(first, doubled)).toEqual(money("60"));
  }, 180_000);

  it("restores calculations on more than 500 records in one background operation and empties Trash", async () => {
    const f = await fixture();
    const grossOrdered = f.extraField(f.organizationTypeId, "Gross ordered", {
      valueType: "currency",
      format: { currency: "EUR" },
      behavior: {
        kind: "rollup",
        expression: {
          kind: "related",
          relationId: f.customer,
          direction: "incoming",
          reducer: "sum",
          expression: field(f.gross.id),
        },
      },
    });
    await f.configure([{ operation: "putField", field: grossOrdered }]);
    const organizations = Array.from({ length: 8 }, () => randomUUID());
    const deals = await f.insertOrders(520, organizations);
    const restored = [];
    for (const target of [grossOrdered, f.ordered, f.gross])
      restored.push(await f.remove({ kind: "field", id: target.id }));

    const result = await f.restore(restored);
    if (!result.ok || result.data.status !== "pending") throw new Error(JSON.stringify(result));
    expect(result.data).not.toHaveProperty("blocked");
    expect(await f.complete(result.data.operationId)).toMatchObject({ state: "completed" });
    expect(await f.items()).toEqual([]);
    const values = await f.stored([f.gross.id, f.ordered.id, grossOrdered.id]);
    deals.forEach((dealId, index) => expect(values.get(`${f.gross.id}:${dealId}`)).toBe(String((index + 1) * 10)));
    organizations.forEach((organizationId, position) => {
      const own = deals.map((_, index) => index).filter((index) => index % organizations.length === position);
      expect(values.get(`${f.ordered.id}:${organizationId}`)).toBe(String(own.length * 10));
      expect(values.get(`${grossOrdered.id}:${organizationId}`)).toBe(
        String(own.reduce((sum, index) => sum + (index + 1) * 10, 0)),
      );
    });
  }, 600_000);

  it("keeps the records of a mixed restore in Trash with operationPending while its fields restore in the background", async () => {
    const f = await fixture();
    const acme = await f.organization("100");
    const deal = await f.order(acme, "10", "2");
    await f.insertOrders(60, [randomUUID()]);
    const field = await f.remove({ kind: "field", id: f.gross.id });
    const record = await f.trashRecord(deal);

    const result = await f.restore([field, record]);
    if (!result.ok || result.data.status !== "pending") throw new Error(JSON.stringify(result));
    expect(result.data.blocked).toEqual([{ itemId: record, reason: "operationPending", typeId: f.dealTypeId }]);
    expect(await f.complete(result.data.operationId)).toMatchObject({ state: "completed" });
    expect((await f.items()).map((item) => item.id)).toEqual([record]);

    expect(await f.restore([record])).toMatchObject({
      ok: true,
      data: { status: "completed", restoredItemIds: [record], blocked: [] },
    });
    expect(await f.value(deal, f.gross)).toEqual(money("20"));
    await f.update(deal, [[f.quantity, decimal("3")]]);
    expect(await f.value(deal, f.gross)).toEqual(money("30"));
  }, 300_000);

  it("restores a rollup over more than 500 linked records in the background instead of failing", async () => {
    const f = await fixture();
    const serviceTypeId = f.id("service");
    const taskTypeId = f.id("task");
    const tasks = f.extraField(serviceTypeId, "Open tasks", {
      valueType: "number",
      behavior: {
        kind: "rollup",
        expression: {
          kind: "related",
          relationId: f.id("task.services"),
          direction: "incoming",
          reducer: "count",
          expression: field(f.id("task.name")),
        },
      },
    });
    await f.configure([{ operation: "putField", field: tasks }]);
    const service = await f.create(serviceTypeId, "service.name", []);
    expect(await f.value(service, tasks)).toEqual(number("0"));
    const itemId = await f.remove({ kind: "field", id: tasks.id });
    const taskIds = Array.from({ length: 520 }, () => randomUUID());
    await runWithoutTenant(async () => {
      await prisma.crmRecord.createMany({
        data: taskIds.map((recordId) => ({ companyId: f.companyId, typeId: taskTypeId, id: recordId })),
      });
      await prisma.recordLink.createMany({
        data: taskIds.map((recordId) => ({
          companyId: f.companyId,
          relationId: f.id("task.services"),
          sourceTypeId: taskTypeId,
          sourceId: recordId,
          targetTypeId: serviceTypeId,
          targetId: service.recordId,
        })),
      });
    });

    const result = await f.restore([itemId]);
    if (!result.ok || result.data.status !== "pending") throw new Error(JSON.stringify(result));
    expect(await f.complete(result.data.operationId)).toMatchObject({ state: "completed" });
    expect(await f.items()).toEqual([]);
    expect(await f.value(service, tasks)).toEqual(number("520"));
  }, 300_000);

  it("keeps the values a restored snapshot field captured, errors included", async () => {
    const f = await fixture();
    const unit = f.extraField(f.dealTypeId, "Unit at order", {
      valueType: "currency",
      format: { currency: "EUR" },
      behavior: {
        kind: "snapshot",
        capture: "create",
        expression: { kind: "operation", operator: "divide", arguments: [field(f.net.id), field(f.quantity.id)] },
      },
    });
    await f.configure([{ operation: "putField", field: unit }]);
    const acme = await f.organization("100");
    const zero = await f.order(acme, "10", "0");
    const two = await f.order(acme, "10", "2");
    expect(await f.value(zero, unit)).toEqual({ state: "error", code: "division_by_zero" });
    expect(await f.value(two, unit)).toEqual(money("5"));

    const itemId = await f.remove({ kind: "field", id: unit.id });
    await f.update(two, [[f.net, decimal("30", "EUR")]]);
    const later = await f.order(acme, "8", "2");

    expect(await f.restore([itemId])).toMatchObject({
      ok: true,
      data: { status: "completed", restoredItemIds: [itemId], blocked: [] },
    });
    expect(await f.value(zero, unit)).toEqual({ state: "error", code: "division_by_zero" });
    expect(await f.value(two, unit)).toEqual(money("5"));
    expect(await f.value(later, unit)).toEqual({ state: "missing" });
  }, 180_000);

  it("restores a snapshot field with the input field that triggers it and captures again afterwards", async () => {
    const f = await fixture();
    const status = f.extraField(f.dealTypeId, "Status", {
      valueType: "select",
      options: [
        { id: "open", label: "Open", color: null, attributes: [] },
        { id: "closed", label: "Closed", color: null, attributes: [] },
      ],
    });
    const closingNet = f.extraField(f.dealTypeId, "Net at closing", {
      valueType: "currency",
      format: { currency: "EUR" },
      behavior: {
        kind: "snapshot",
        capture: "whenChanged",
        triggerFieldId: status.id,
        triggerValue: choice("closed"),
        expression: field(f.net.id),
      },
    });
    await f.configure([
      { operation: "putField", field: status },
      { operation: "putField", field: closingNet },
    ]);
    const acme = await f.organization("100");
    const deal = await f.order(acme, "10", "1");
    await f.update(deal, [[status, choice("closed")]]);
    expect(await f.value(deal, closingNet)).toEqual(money("10"));

    const snapshot = await f.remove({ kind: "field", id: closingNet.id });
    const trigger = await f.remove({ kind: "field", id: status.id });
    await f.update(deal, [[f.net, decimal("20", "EUR")]]);

    expect(await f.restore([snapshot])).toMatchObject({
      ok: true,
      data: { restoredItemIds: [], blocked: [{ itemId: snapshot, reason: "requiresRestore" }] },
    });
    expect(await f.restore([snapshot, trigger])).toMatchObject({
      ok: true,
      data: { blocked: [], restoredItemIds: expect.arrayContaining([snapshot, trigger]) },
    });
    expect(await f.value(deal, closingNet)).toEqual(money("10"));
    await f.update(deal, [[status, choice("open")]]);
    await f.update(deal, [[status, choice("closed")]]);
    expect(await f.value(deal, closingNet)).toEqual(money("20"));
  }, 180_000);

  it("explains a restore that no longer fits the data instead of claiming the item left Trash", async () => {
    const f = await fixture();
    const priority = f.extraField(f.dealTypeId, "Priority", { valueType: "number" });
    await f.configure([{ operation: "putField", field: priority }]);
    const acme = await f.organization("100");
    const deal = await f.order(acme, "10", "1", [[priority, decimal("1")]]);
    await f.configure([{ operation: "putField", field: { ...priority, required: true } }]);
    const required = await f.remove({ kind: "field", id: priority.id });
    await f.order(acme, "5", "1");
    const lookup = await f.remove({ kind: "field", id: f.customerCredit.id });
    const relationship = (await f.getModel()).relationships.find((relation) => relation.id === f.customer);
    if (!relationship) throw new Error("The relationship is missing");
    await f.configure([
      { operation: "putRelationship", relationship: { ...omit(relationship, "archived"), sourceCardinality: "many" } },
    ]);

    expect(await f.restore([required, lookup])).toMatchObject({
      ok: true,
      data: {
        status: "completed",
        restoredItemIds: [],
        blocked: expect.arrayContaining([
          { itemId: required, reason: "incompatible", typeId: f.dealTypeId },
          { itemId: lookup, reason: "incompatible", typeId: f.dealTypeId },
        ]),
      },
    });
    expect((await f.items()).map((item) => item.id).sort()).toEqual([required, lookup].sort());
    expect(await f.value(deal, priority)).toBeUndefined();
  }, 180_000);

  it("gives the name role back in undo order when name fields are restored together", async () => {
    const f = await fixture();
    const code = f.extraField(f.dealTypeId, "Code", { valueType: "text" });
    const alias = f.extraField(f.dealTypeId, "Alias", { valueType: "text" });
    await f.configure([
      { operation: "putField", field: code },
      { operation: "putField", field: alias },
    ]);
    const primary = async () => (await f.getModel()).types.find((type) => type.id === f.dealTypeId)?.primaryFieldId;
    const name = await f.remove({ kind: "field", id: f.id("deal.name") });
    expect(await primary()).toBe(code.id);
    const replacement = await f.remove({ kind: "field", id: code.id });
    expect(await primary()).toBe(alias.id);

    expect(await f.restore([name, replacement])).toMatchObject({
      ok: true,
      data: { blocked: [], restoredItemIds: expect.arrayContaining([name, replacement]) },
    });
    expect(await primary()).toBe(f.id("deal.name"));
  }, 180_000);
});

describeDatabase("restoring lists and relationships from Trash", () => {
  it("restores a list, then the calculations of other lists that read it, from the current data", async () => {
    const f = await fixture();
    const acme = await f.organization("100");
    const first = await f.order(acme, "10", "1");
    const second = await f.order(acme, "5", "1");
    const lookup = await f.remove({ kind: "field", id: f.customerCredit.id });
    const list = await f.remove({ kind: "type", id: f.organizationTypeId });
    expect((await f.getModel()).relationships.find((relation) => relation.id === f.customer)?.archived).toBe(true);
    await f.update(first, [[f.net, decimal("12", "EUR")]]);
    const trashed = await f.trashRecord(second);
    expect(await f.restore([trashed])).toMatchObject({ ok: true, data: { blocked: [] } });
    const third = await f.order(null, "3", "1");

    expect(await f.restore([lookup, list])).toMatchObject({
      ok: true,
      data: { status: "completed", blocked: [], restoredItemIds: expect.arrayContaining([lookup, list]) },
    });
    const model = await f.getModel();
    expect(model.types.find((type) => type.id === f.organizationTypeId)?.archived).toBe(false);
    expect(model.relationships.filter((relation) => relation.archived)).toEqual([]);
    expect(await f.value(acme, f.ordered)).toEqual(money("17"));
    expect(await f.value(first, f.customerCredit)).toEqual(money("100"));
    expect(await f.value(second, f.customerCredit)).toEqual(money("100"));
    expect(await f.value(third, f.customerCredit)).toEqual({ state: "missing" });
  }, 180_000);

  it("recalculates the rollups and lookups of a list restored on its own from the records changed meanwhile", async () => {
    const f = await fixture();
    const acme = await f.organization("100");
    const first = await f.order(acme, "10", "1");
    const second = await f.order(acme, "5", "1");
    await f.remove({ kind: "field", id: f.customerCredit.id });
    const organizations = await f.remove({ kind: "type", id: f.organizationTypeId });
    await f.update(first, [[f.net, decimal("12", "EUR")]]);
    await f.trashRecord(second);
    expect(await f.restore([organizations])).toMatchObject({ ok: true, data: { blocked: [] } });
    expect(await f.value(acme, f.ordered)).toEqual(money("12"));

    const g = await fixture();
    const globex = await g.organization("200");
    const deal = await g.order(globex, "10", "1");
    await g.remove({ kind: "field", id: g.ordered.id });
    const deals = await g.remove({ kind: "type", id: g.dealTypeId });
    await g.update(globex, [[g.credit, decimal("250", "EUR")]]);
    expect(await g.restore([deals])).toMatchObject({ ok: true, data: { blocked: [] } });
    expect(await g.value(deal, g.customerCredit)).toEqual(money("250"));
  }, 180_000);

  it("keeps the relationship between two lists restored in deletion order, together or one at a time", async () => {
    const f = await fixture();
    const between = f.id("contact.organizations");
    await f.remove({ kind: "field", id: f.customerCredit.id });
    for (const separately of [false, true]) {
      const organizations = await f.remove({ kind: "type", id: f.organizationTypeId });
      const contacts = await f.remove({ kind: "type", id: f.id("contact") });
      const requests = separately ? [[organizations], [contacts]] : [[organizations, contacts]];
      for (const itemIds of requests)
        expect(await f.restore(itemIds)).toMatchObject({ ok: true, data: { blocked: [] } });
      const model = await f.getModel();
      expect(model.relationships.find((relation) => relation.id === between)?.archived).toBe(false);
      expect(model.relationships.filter((relation) => relation.archived)).toEqual([]);
    }
  }, 180_000);

  it("brings back the relationship columns that deleting a list or a relationship removed from other lists", async () => {
    const f = await fixture();
    const deals = (await f.getModel()).types.find((type) => type.id === f.dealTypeId);
    if (!deals) throw new Error("The deal list is missing");
    const contactsPath = {
      id: randomUUID(),
      label: "Customer contacts",
      archived: false,
      path: [
        { relationId: f.customer, direction: "outgoing" as const },
        { relationId: f.id("contact.organizations"), direction: "incoming" as const },
      ],
    };
    await f.configure([
      {
        operation: "putType",
        type: { ...omit(deals, "archived"), relationshipPaths: [...(deals.relationshipPaths ?? []), contactsPath] },
      },
    ]);
    const paths = async () =>
      Object.fromEntries(
        (await f.getModel()).types.map((entry) => [entry.id, (entry.relationshipPaths ?? []).map((path) => path.id)]),
      );
    const before = await paths();
    expect(before[f.id("service")]).toEqual([f.id("service.deals.path")]);

    await f.remove({ kind: "field", id: f.ordered.id });
    const list = await f.remove({ kind: "type", id: f.dealTypeId });
    expect((await paths())[f.id("service")]).toEqual([]);
    expect(await f.restore([list])).toMatchObject({ ok: true, data: { blocked: [] } });
    expect(await paths()).toEqual(before);

    await f.remove({ kind: "field", id: f.customerCredit.id });
    const relationship = await f.remove({ kind: "relationship", id: f.customer });
    expect((await paths())[f.dealTypeId]).toEqual([f.id("deal.services.path")]);
    expect(await f.restore([relationship])).toMatchObject({ ok: true, data: { blocked: [] } });
    expect(await paths()).toEqual(before);
  }, 180_000);

  it("restores a relationship with its lookups and rollups, and keeps a lookup its changed cardinality no longer allows", async () => {
    const f = await fixture();
    const acme = await f.organization("100");
    const globex = await f.organization("200");
    const first = await f.order(acme, "10", "1");
    const second = await f.order(globex, "5", "1");
    const lookup = await f.remove({ kind: "field", id: f.customerCredit.id });
    const rollup = await f.remove({ kind: "field", id: f.ordered.id });
    const relationship = await f.remove({ kind: "relationship", id: f.customer });
    await f.update(acme, [[f.credit, decimal("150", "EUR")]]);
    await f.update(first, [[f.net, decimal("11", "EUR")]]);
    const trashed = await f.trashRecord(second);
    expect(await f.restore([trashed])).toMatchObject({ ok: true, data: { blocked: [] } });

    expect(await f.restore([lookup, rollup, relationship])).toMatchObject({
      ok: true,
      data: { blocked: [], restoredItemIds: expect.arrayContaining([lookup, rollup, relationship]) },
    });
    expect(await f.value(first, f.customerCredit)).toEqual(money("150"));
    expect(await f.value(second, f.customerCredit)).toEqual(money("200"));
    expect(await f.value(acme, f.ordered)).toEqual(money("11"));
    expect(await f.value(globex, f.ordered)).toEqual(money("5"));

    const lookupAgain = await f.remove({ kind: "field", id: f.customerCredit.id });
    const rollupAgain = await f.remove({ kind: "field", id: f.ordered.id });
    const relationshipAgain = await f.remove({ kind: "relationship", id: f.customer });
    const stored = (await f.getModel()).relationships.find((relation) => relation.id === f.customer);
    if (!stored) throw new Error("The relationship is missing");
    await f.configure([
      { operation: "putRelationship", relationship: { ...omit(stored, "archived"), sourceCardinality: "many" } },
    ]);
    expect(await f.restore([lookupAgain, rollupAgain, relationshipAgain])).toMatchObject({
      ok: true,
      data: {
        blocked: [{ itemId: lookupAgain, reason: "incompatible" }],
        restoredItemIds: expect.arrayContaining([rollupAgain, relationshipAgain]),
      },
    });
    expect(await f.value(globex, f.ordered)).toEqual(money("5"));
  }, 180_000);

  it("keeps a list in Trash with nameTaken while another list uses its name", async () => {
    const f = await fixture();
    const list = await f.remove({ kind: "type", id: f.id("contact") });
    await f.configure([
      {
        operation: "createType",
        reference: "$people",
        label: "Contact",
        pluralLabel: "Contacts",
        description: "",
        icon: "contact",
        embedded: false,
        accessPresetId: null,
      },
    ]);
    expect(await f.restore([list])).toMatchObject({
      ok: true,
      data: { restoredItemIds: [], blocked: [{ itemId: list, reason: "nameTaken" }] },
    });
    expect((await f.items()).map((item) => item.id)).toEqual([list]);
  }, 180_000);
});

describeDatabase("configuration Trash access and permanent deletion", () => {
  it("shows and restores calculated fields only for members who may change the data model", async () => {
    const f = await fixture();
    const acme = await f.organization("100");
    const deal = await f.order(acme, "10", "2");
    const itemId = await f.remove({ kind: "field", id: f.gross.id });
    await f.update(deal, [[f.quantity, decimal("5")]]);

    const listed = (user: TenantUser) => f.as(() => f.trash.query.invoke({ kinds: ["field"] } as never), user);
    expect(await listed(f.member)).toMatchObject({ ok: true, data: { total: 0 } });
    expect(await f.restore([itemId], f.member)).toMatchObject({ ok: false });
    expect((await f.items()).map((item) => item.id)).toEqual([itemId]);

    expect(await listed(f.schemaManager)).toMatchObject({ ok: true, data: { total: 1 } });
    expect(await f.restore([itemId], f.schemaManager)).toMatchObject({
      ok: true,
      data: { status: "completed", restoredItemIds: [itemId], blocked: [] },
    });
    expect(await f.value(deal, f.gross)).toEqual(money("50"));
  }, 180_000);

  it("deletes a calculation and the calculation it reads permanently in one request and when they expire", async () => {
    const f = await fixture();
    const doubled = f.extraField(f.dealTypeId, "Doubled", {
      valueType: "currency",
      format: { currency: "EUR" },
      behavior: {
        kind: "formula",
        expression: {
          kind: "operation",
          operator: "multiply",
          arguments: [field(f.gross.id), { kind: "literal", value: decimal("2") }],
        },
      },
    });
    const tripled = f.extraField(f.dealTypeId, "Tripled", {
      valueType: "currency",
      format: { currency: "EUR" },
      behavior: {
        kind: "formula",
        expression: {
          kind: "operation",
          operator: "multiply",
          arguments: [field(f.net.id), { kind: "literal", value: decimal("3") }],
        },
      },
    });
    await f.configure([
      { operation: "putField", field: doubled },
      { operation: "putField", field: tripled },
    ]);
    const dependent = await f.remove({ kind: "field", id: doubled.id });
    const source = await f.remove({ kind: "field", id: f.gross.id });
    const itemIds = [source, dependent];
    const preview = await f.as(() => f.trash.preview.invoke({ itemIds }));
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    expect(
      await f.as(() => f.trash.remove.invoke({ itemIds, expectedImpactHash: preview.data.impactHash })),
    ).toMatchObject({ ok: true, data: { deletedItemIds: expect.arrayContaining(itemIds), failedItemIds: [] } });
    expect((await f.getModel()).fields.some((entry) => [doubled.id, f.gross.id].includes(entry.id))).toBe(false);

    await f.remove({ kind: "field", id: tripled.id });
    await f.remove({ kind: "field", id: f.ordered.id });
    await f.remove({ kind: "field", id: f.net.id });
    await runWithoutTenant(
      () =>
        prisma.$executeRaw`UPDATE "TrashItem" SET "expiresAt" = "deletedAt" - interval '1 day' WHERE "companyId" = ${f.companyId}`,
    );
    expect(
      await f.trash.purge.invoke({ companyId: f.companyId, now: new Date().toISOString(), after: null }),
    ).toMatchObject({ deleted: 3, failed: 0 });
    expect(await f.items()).toEqual([]);
  }, 180_000);
});
