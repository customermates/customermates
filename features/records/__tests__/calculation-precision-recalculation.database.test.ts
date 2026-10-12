import { PermissionService } from "@/core/base/permission.service";
import type { ConfigurationChange } from "../configuration.schema";
import type { RecordField, RecordRef, RecordScalar } from "../record-model.schema";

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
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { WebhookPauseNotifier } = await import("@/features/webhook/webhook-pause-notifier");
const { RecordAccessPolicy } = await import("../record-access");
const { RecordCalculationService, SYNCHRONOUS_RECORD_LIMIT } = await import("../record-calculation.service");
const { RecordWriteService } = await import("../record-write.service");
const { RecordConfigurationService } = await import("../configuration.service");
const { RecordConfigurationWriter } = await import("../record-configuration-writer");
const { RecordOperationService } = await import("../record-operation.service");
const { MutateRecordInteractor } = await import("../mutate-record.interactor");
const { RecordTrashService } = await import("../record-trash.service");
const { GetRecordInteractor } = await import("../get-record.interactor");
const { ApplyRecordConfigurationInteractor } = await import("../configure-records.interactor");
const { createCrmPreset, presetId } = await import("../crm-preset");
const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];
const noWebhooks = new WebhookPauseNotifier(
  { getWebhookByIdOrThrow: () => Promise.reject(new Error("No webhook expected")) },
  { publish: () => Promise.resolve() },
);

const decimal = (value: string, currency: string | null = null): RecordScalar => ({ kind: "decimal", value, currency });
const money = (value: string) => ({ state: "value", value: decimal(value, "EUR") });

type DefinedField = Omit<RecordField, "publishedSummary">;

async function fixture() {
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
  const admin = createMockUser({ ...seed.user, role: { ...seed.role, permissions: [] } });
  const repo = createTestRecordRepo();
  const policy = new RecordAccessPolicy(new PrismaUserRepo(new PermissionService()), repo);
  const configure = (records: typeof repo) =>
    new ApplyRecordConfigurationInteractor(
      records,
      policy,
      new RecordConfigurationService(records),
      new RecordConfigurationWriter(records, new RecordCalculationService(records), noWebhooks),
      { dispatch: () => Promise.resolve() },
    );
  const large = Object.assign(Object.create(repo) as typeof repo, {
    countRecordsCompanyWide: () => Promise.resolve(SYNCHRONOUS_RECORD_LIMIT + 1),
  });
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    new RecordWriteService(repo, policy, new RecordCalculationService(repo)),
    { dispatch: () => Promise.resolve() },
    new RecordTrashService(repo),
  );
  const read = new GetRecordInteractor(repo, policy);
  const worker = new RecordOperationService(repo, policy, new RecordConfigurationService(repo), noWebhooks);
  const id = (key: string) => presetId(seed.company.id, key);
  const dealTypeId = id("deal");
  const organizationTypeId = id("organization");
  const model = createCrmPreset(seed.company.id);
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
  const credit: DefinedField = {
    ...base,
    id: randomUUID(),
    typeId: organizationTypeId,
    label: "Credit",
    valueType: "currency",
    behavior: { kind: "input" },
    format: { currency: "EUR" },
    position,
  };
  const net: DefinedField = {
    ...base,
    id: randomUUID(),
    typeId: dealTypeId,
    label: "Net",
    valueType: "currency",
    behavior: { kind: "input" },
    format: { currency: "EUR" },
    position: position + 1,
  };
  const quantity: DefinedField = {
    ...base,
    id: randomUUID(),
    typeId: dealTypeId,
    label: "Quantity",
    valueType: "number",
    behavior: { kind: "input" },
    position: position + 2,
  };
  const gross: DefinedField = {
    ...base,
    id: randomUUID(),
    typeId: dealTypeId,
    label: "Gross",
    valueType: "currency",
    behavior: {
      kind: "formula",
      expression: {
        kind: "operation",
        operator: "multiply",
        arguments: [
          { kind: "field", fieldId: net.id },
          { kind: "field", fieldId: quantity.id },
        ],
      },
    },
    format: { currency: "EUR", decimalPlaces: 2 },
    position: position + 3,
  };
  const customerCredit: DefinedField = {
    ...base,
    id: randomUUID(),
    typeId: dealTypeId,
    label: "Customer credit",
    valueType: "currency",
    behavior: {
      kind: "lookup",
      expression: {
        kind: "related",
        relationId: customer,
        direction: "outgoing",
        reducer: "one",
        expression: { kind: "field", fieldId: credit.id },
      },
    },
    format: { currency: "EUR", decimalPlaces: 2 },
    position: position + 4,
  };
  const ordered: DefinedField = {
    ...base,
    id: randomUUID(),
    typeId: organizationTypeId,
    label: "Ordered",
    valueType: "currency",
    behavior: {
      kind: "rollup",
      expression: {
        kind: "related",
        relationId: customer,
        direction: "incoming",
        reducer: "sum",
        expression: { kind: "field", fieldId: gross.id },
      },
    },
    format: { currency: "EUR", decimalPlaces: 3 },
    position: position + 5,
  };
  const fields = { credit, net, quantity, gross, customerCredit, ordered };
  model.fields.push(...Object.values(fields).map((field) => ({ ...field, publishedSummary: false })));
  await runWithTenant(admin, () => runInTransaction(() => repo.saveModel(model, admin.id), { timeout: 30000 }));
  const run = <T>(fn: () => Promise<T>) => runWithTenant(admin, fn);
  const revision = async () =>
    (
      await runWithoutTenant(() =>
        prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId: seed.company.id } }),
      )
    ).revision;
  const record = async (ref: RecordRef) => {
    const result = await run(() => read.invoke(ref));
    if (!result.ok) throw result.error;
    return result.data;
  };
  const value = async (ref: RecordRef, field: DefinedField) =>
    (await record(ref)).fields.find((candidate) => candidate.fieldId === field.id)?.result;
  const create = async (
    typeId: string,
    nameKey: string,
    values: Array<[DefinedField, RecordScalar]>,
    links: Array<{ relationId: string; direction: "outgoing"; record: RecordRef }> = [],
  ) => {
    const result = await run(async () =>
      mutate.invoke({
        expectedRevision: await revision(),
        idempotencyKey: randomUUID(),
        mutation: {
          action: "create",
          typeId,
          fields: [
            { fieldId: id(nameKey), value: { kind: "text", value: "Precision" } },
            ...values.map(([field, value]) => ({ fieldId: field.id, value })),
          ],
          links,
        },
      }),
    );
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true, data: { status: "completed" } });
    if (!result.ok || result.data.status !== "completed") throw new Error("The record was not created");
    const ref = result.data.refs.find((candidate) => candidate.typeId === typeId);
    if (!ref) throw new Error("The created reference is missing");
    return ref;
  };
  const organization = () => create(organizationTypeId, "organization.name", [[credit, decimal("11.005", "EUR")]]);
  const order = (organizationRef: RecordRef) =>
    create(
      dealTypeId,
      "deal.name",
      [
        [net, decimal("0.115", "EUR")],
        [quantity, decimal("3")],
      ],
      [{ relationId: customer, direction: "outgoing", record: organizationRef }],
    );
  const change = async (updates: Array<[DefinedField, DefinedField["format"]]>): Promise<ConfigurationChange> => ({
    expectedRevision: await revision(),
    idempotencyKey: randomUUID(),
    operations: updates.map(([field, format]) => ({ operation: "putField" as const, field: { ...field, format } })),
  });
  const preview = (records: typeof repo, input: ConfigurationChange) =>
    run(() =>
      runInTransaction(
        async () => {
          const prepared = await new RecordConfigurationService(records).prepare(
            input,
            await records.getModel(),
            await policy.load(),
          );
          return { ok: true as const, data: prepared.preview };
        },
        { timeout: 30000 },
      ),
    );
  const version = (ref: RecordRef) =>
    runWithoutTenant(() =>
      prisma.crmRecord.findUniqueOrThrow({
        where: { companyId_typeId_id: { companyId: seed.company.id, typeId: ref.typeId, id: ref.recordId } },
        select: { version: true, updatedAt: true },
      }),
    );
  return { ...fields, repo, large, configure, worker, run, value, organization, order, change, preview, version };
}

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

describeDatabase("changing calculation precision recalculates stored results", () => {
  it("rewrites a formula, a lookup and the rollup reading them, and matches a freshly calculated record", async () => {
    const f = await fixture();
    const customer = await f.organization();
    const first = await f.order(customer);
    expect(await f.value(first, f.gross)).toEqual(money("0.35"));
    expect(await f.value(first, f.customerCredit)).toEqual(money("11.01"));
    expect(await f.value(customer, f.ordered)).toEqual(money("0.35"));

    const input = await f.change([
      [f.gross, { currency: "EUR", decimalPlaces: 3 }],
      [f.customerCredit, { currency: "EUR", decimalPlaces: 3 }],
    ]);
    const previewed = await f.preview(f.repo, input);
    expect(previewed).toMatchObject({ ok: true, data: { valid: true, execution: "synchronous" } });
    expect(previewed.ok && previewed.data.affectedRecords).toBeGreaterThanOrEqual(2);
    expect(await f.run(() => f.configure(f.repo).invoke(input))).toMatchObject({
      ok: true,
      data: { status: "completed" },
    });
    expect(await f.value(first, f.gross)).toEqual(money("0.345"));
    expect(await f.value(first, f.customerCredit)).toEqual(money("11.005"));
    expect(await f.value(customer, f.ordered)).toEqual(money("0.345"));

    expect(
      await f.run(async () =>
        f.configure(f.repo).invoke(await f.change([[f.ordered, { currency: "EUR", decimalPlaces: 2 }]])),
      ),
    ).toMatchObject({ ok: true, data: { status: "completed" } });
    expect(await f.value(customer, f.ordered)).toEqual(money("0.35"));

    const second = await f.order(customer);
    for (const field of [f.net, f.quantity, f.gross, f.customerCredit])
      expect(await f.value(second, field)).toEqual(await f.value(first, field));
    expect(await f.value(customer, f.ordered)).toEqual(money("0.69"));
  }, 180_000);

  it("keeps stored input values and their records untouched when only an input's decimal places change", async () => {
    const f = await fixture();
    const customer = await f.organization();
    const order = await f.order(customer);
    const before = await f.version(order);
    const input = await f.change([[f.net, { currency: "EUR", decimalPlaces: 1 }]]);
    expect(await f.preview(f.repo, input)).toMatchObject({ ok: true, data: { valid: true, affectedRecords: 0 } });
    expect(await f.run(() => f.configure(f.repo).invoke(input))).toMatchObject({
      ok: true,
      data: { status: "completed" },
    });
    expect(await f.version(order)).toEqual(before);
    expect(await f.value(order, f.net)).toEqual(money("0.115"));
    expect(await f.value(order, f.gross)).toEqual(money("0.35"));
  }, 180_000);

  it("recalculates a large list through the background record operation", async () => {
    const f = await fixture();
    const customer = await f.organization();
    const order = await f.order(customer);
    const input = await f.change([[f.gross, { currency: "EUR", decimalPlaces: 3 }]]);
    expect(await f.preview(f.large, input)).toMatchObject({ ok: true, data: { valid: true, execution: "background" } });
    const staged = await f.run(() => f.configure(f.large).invoke(input));
    if (!staged.ok || staged.data.status !== "pending") throw new Error(JSON.stringify(staged));
    expect(await f.value(order, f.gross)).toEqual(money("0.35"));
    const { operationId } = staged.data;
    let done = false;
    for (let step = 0; step < 100 && !done; step++) done = (await f.run(() => f.worker.advance(operationId))).done;
    expect(done).toBe(true);
    expect(await f.value(order, f.gross)).toEqual(money("0.345"));
    expect(await f.value(customer, f.ordered)).toEqual(money("0.345"));
  }, 180_000);
});
