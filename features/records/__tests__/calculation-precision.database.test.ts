import { PermissionService } from "@/core/base/permission.service";
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
const { RecordAccessPolicy } = await import("../record-access");
const { RecordCalculationService } = await import("../record-calculation.service");
const { RecordWriteService } = await import("../record-write.service");
const { MutateRecordInteractor } = await import("../mutate-record.interactor");
const { RecordTrashService } = await import("../record-trash.service");
const { GetRecordInteractor } = await import("../get-record.interactor");
const { createCrmPreset, presetId } = await import("../crm-preset");
const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];

const decimal = (value: string, currency: string | null = null): RecordScalar => ({ kind: "decimal", value, currency });

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
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    new RecordWriteService(repo, policy, new RecordCalculationService(repo)),
    { dispatch: () => Promise.resolve() },
    new RecordTrashService(repo),
  );
  const read = new GetRecordInteractor(repo, policy);
  const id = (key: string) => presetId(seed.company.id, key);
  const typeId = id("deal");
  const model = createCrmPreset(seed.company.id);
  const position = model.fields.filter((field) => field.typeId === typeId).length;
  const base = { typeId, required: false, archived: false, publishedSummary: false, options: [] };
  const listPrice: RecordField = {
    ...base,
    id: randomUUID(),
    label: "List price",
    valueType: "currency",
    behavior: { kind: "input" },
    format: { currency: "EUR" },
    position,
  };
  const discount: RecordField = {
    ...base,
    id: randomUUID(),
    label: "Discount",
    valueType: "currency",
    behavior: { kind: "input" },
    format: { currency: "EUR" },
    position: position + 1,
  };
  const ratio = (field: RecordField) => ({
    kind: "operation" as const,
    operator: "divide" as const,
    arguments: [
      { kind: "field" as const, fieldId: discount.id },
      { kind: "field" as const, fieldId: field.id },
    ],
  });
  const percentage: RecordField = {
    ...base,
    id: randomUUID(),
    label: "Discount %",
    valueType: "number",
    behavior: {
      kind: "formula",
      expression: {
        kind: "operation",
        operator: "multiply",
        arguments: [ratio(listPrice), { kind: "literal", value: decimal("100") }],
      },
    },
    format: { decimalPlaces: 1 },
    position: position + 2,
  };
  const third: RecordField = {
    ...base,
    id: randomUUID(),
    label: "Third",
    valueType: "number",
    behavior: {
      kind: "formula",
      expression: {
        kind: "operation",
        operator: "divide",
        arguments: [
          { kind: "literal", value: decimal("1") },
          { kind: "literal", value: decimal("3") },
        ],
      },
    },
    format: { decimalPlaces: 2 },
    position: position + 3,
  };
  const share: RecordField = {
    ...base,
    id: randomUUID(),
    label: "Share",
    valueType: "currency",
    behavior: {
      kind: "formula",
      expression: {
        kind: "operation",
        operator: "divide",
        arguments: [
          { kind: "field", fieldId: listPrice.id },
          { kind: "literal", value: decimal("3") },
        ],
      },
    },
    format: { currency: "EUR", decimalPlaces: 2 },
    position: position + 4,
  };
  model.fields.push(listPrice, discount, percentage, third, share);
  await runWithTenant(admin, () => runInTransaction(() => repo.saveModel(model, admin.id), { timeout: 30000 }));
  const revision = async () =>
    (
      await runWithoutTenant(() =>
        prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId: seed.company.id } }),
      )
    ).revision;
  const record = async (ref: RecordRef) => {
    const result = await runWithTenant(admin, () => read.invoke(ref));
    if (!result.ok) throw result.error;
    return result.data;
  };
  const value = async (ref: RecordRef, field: RecordField) =>
    (await record(ref)).fields.find((candidate) => candidate.fieldId === field.id)?.result;
  const create = async (price: string, off: string) => {
    const result = await runWithTenant(admin, async () =>
      mutate.invoke({
        expectedRevision: await revision(),
        idempotencyKey: randomUUID(),
        mutation: {
          action: "create",
          typeId,
          fields: [
            { fieldId: id("deal.name"), value: { kind: "text", value: "Discounted" } },
            { fieldId: listPrice.id, value: decimal(price, "EUR") },
            { fieldId: discount.id, value: decimal(off, "EUR") },
          ],
        },
      }),
    );
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
    if (!result.ok || result.data.status !== "completed") throw new Error("The deal was not created");
    return recordRef(result.data.refs, typeId);
  };
  const update = async (ref: RecordRef, price: string) => {
    const result = await runWithTenant(admin, async () =>
      mutate.invoke({
        expectedRevision: await revision(),
        idempotencyKey: randomUUID(),
        mutation: {
          action: "update",
          ref,
          expectedVersion: (await record(ref)).version,
          fields: [{ fieldId: listPrice.id, value: decimal(price, "EUR") }],
        },
      }),
    );
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
  };
  return { create, update, value, percentage, third, share };
}

function recordRef(refs: RecordRef[], typeId: string): RecordRef {
  const ref = refs.find((candidate) => candidate.typeId === typeId);
  if (!ref) throw new Error("The created reference is missing");
  return ref;
}

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

describeDatabase("calculated fields round divisions to the field's precision", () => {
  it("stores 1 / 3 as 0.33 and a discount percentage that saves and recalculates", async () => {
    const f = await fixture();
    const deal = await f.create("45", "15");
    expect(await f.value(deal, f.third)).toEqual({ state: "value", value: decimal("0.33") });
    expect(await f.value(deal, f.percentage)).toEqual({ state: "value", value: decimal("33.3") });
    expect(await f.value(deal, f.share)).toEqual({ state: "value", value: decimal("15", "EUR") });

    await f.update(deal, "70");
    expect(await f.value(deal, f.percentage)).toEqual({ state: "value", value: decimal("21.4") });
    expect(await f.value(deal, f.share)).toEqual({ state: "value", value: decimal("23.33", "EUR") });
  }, 120_000);
});
