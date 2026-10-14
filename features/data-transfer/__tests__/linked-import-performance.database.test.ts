import { PermissionService } from "@/core/base/permission.service";
import type { RecordExport } from "@/features/data-transfer/record-transfer.schema";
import type { RecordField, RecordRef } from "@/features/records/record-model.schema";

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
const { createTestRecordRepo } = await import("@/tests/helpers/record-repository");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("@/features/records/record-access");
const { RecordCalculationService } = await import("@/features/records/record-calculation.service");
const { RecordWriteService } = await import("@/features/records/record-write.service");
const { RecordTrashService } = await import("@/features/records/record-trash.service");
const { MutateRecordInteractor } = await import("@/features/records/mutate-record.interactor");
const { ExportRecordsInteractor } = await import("@/features/data-transfer/export/export-records.interactor");
const { EventService } = await import("@/features/event/event.service");
const { PrismaEventLogRepo } = await import("@/features/event/prisma-event-log.repository");
const { ImportRecordsInteractor } = await import("@/features/data-transfer/import/import-records.interactor");
const { createCrmPreset, presetId } = await import("@/features/records/crm-preset");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];
const BATCH = 100;
const BATCH_BUDGET_MS = 15_000;

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

async function fixture(withRollup: boolean) {
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
        firstName: "Ada",
        lastName: "Import",
        email: `${randomUUID()}@example.test`,
        status: "active",
      },
    });
    return { company, role, user };
  });
  const admin = createMockUser({ ...seed.user, role: { ...seed.role, permissions: [] } });
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
  const importer = new ImportRecordsInteractor(repo, policy, writer);
  const id = (key: string) => presetId(seed.company.id, key);
  const relationId = randomUUID();
  const lookupId = randomUUID();
  const rollupId = randomUUID();
  const field = (
    fieldId: string,
    typeId: string,
    valueType: RecordField["valueType"],
    behavior: RecordField["behavior"],
  ): RecordField => ({
    id: fieldId,
    typeId,
    label: fieldId,
    valueType,
    ...(valueType === "currency" ? { format: { currency: "EUR", decimalPlaces: 3 } } : {}),
    behavior,
    required: false,
    archived: false,
    publishedSummary: false,
    options: [],
    position: 90,
  });
  const preset = createCrmPreset(seed.company.id);
  preset.relationships.push({
    id: relationId,
    sourceTypeId: id("organization"),
    targetTypeId: id("service"),
    sourceLabel: "Provider",
    targetLabel: "Clients",
    sourceCardinality: "one",
    targetCardinality: "many",
    onSourceDelete: "unlink",
    onTargetDelete: "restrict",
    messagesOnSource: false,
    messagesOnTarget: false,
    archived: false,
  });
  preset.fields.push(
    field(lookupId, id("organization"), "currency", {
      kind: "lookup",
      expression: {
        kind: "related",
        relationId,
        direction: "outgoing",
        reducer: "one",
        expression: { kind: "field", fieldId: id("service.amount") },
      },
    }),
  );
  if (withRollup) {
    preset.fields.push(
      field(rollupId, id("service"), "number", {
        kind: "rollup",
        expression: {
          kind: "related",
          relationId,
          direction: "incoming",
          reducer: "count",
          expression: { kind: "field", fieldId: id("organization.name") },
        },
      }),
    );
  }
  await runWithTenant(admin, () => runInTransaction(() => repo.saveModel(preset, admin.id), { timeout: 30000 }));
  const run = <T>(fn: () => Promise<T>) => runWithTenant(admin, fn);
  const create = async (typeId: string, fields: Array<{ fieldId: string; value: unknown }>) => {
    const result = await run(() =>
      mutate.invoke({
        mutation: { action: "create", typeId, fields } as never,
        expectedRevision: 1,
        idempotencyKey: randomUUID(),
      }),
    );
    if (!result.ok || result.data.status !== "completed") throw new Error(JSON.stringify(result));
    const ref = result.data.refs.find((candidate: RecordRef) => candidate.typeId === typeId);
    if (!ref) throw new Error("No reference");
    return ref;
  };
  const target = await create(id("service"), [
    { fieldId: id("service.name"), value: { kind: "text", value: "Shared provider" } },
    { fieldId: id("service.amount"), value: { kind: "decimal", value: "11.005", currency: "EUR" } },
  ]);
  await create(id("organization"), [{ fieldId: id("organization.name"), value: { kind: "text", value: "Template" } }]);
  const exported = await run(() =>
    new ExportRecordsInteractor(
      repo,
      policy,
      new EventService([], new PrismaEventLogRepo({ dispatch: () => Promise.resolve() })),
    ).invoke({
      typeId: id("organization"),
      filters: [],
      relationships: [],
      sort: [],
    }),
  );
  if (!exported.ok) throw new Error("Export failed");
  const template = exported.data;
  const [row] = template.records;
  let sequence = 0;
  const name = () => ({ kind: "text" as const, value: `Client ${++sequence}` });
  const amount = { kind: "decimal" as const, value: "11.005", currency: "EUR" };
  const seedChildren = (count: number) =>
    run(() =>
      runInTransaction(
        async () => {
          for (let index = 0; index < count; index += 1) {
            const ref = { typeId: id("organization"), recordId: randomUUID() };
            await repo.create(ref, [admin.id]);
            await repo.setValue(ref, id("organization.name"), { state: "value", value: name() }, 1);
            await repo.setValue(ref, lookupId, { state: "value", value: amount }, 1);
            await repo.link(relationId, ref, target);
          }
        },
        { timeout: 120_000 },
      ),
    );
  const document = (count: number): RecordExport => {
    const records = Array.from({ length: count }, () => {
      const record = structuredClone(row);
      record.ref = { ...record.ref, recordId: randomUUID() };
      record.fields = record.fields.map((value) =>
        value.fieldId === id("organization.name") ? { ...value, result: { state: "value", value: name() } } : value,
      );
      return record;
    });
    return { ...template, records, links: records.map((record) => ({ relationId, source: record.ref, target })) };
  };
  const importDocument = (input: { document: RecordExport; idempotencyKey: string }) =>
    run(() => importer.invoke({ ...input, mode: "create" }));
  const timedImport = async (count: number) => {
    const started = performance.now();
    const result = await importDocument({ document: document(count), idempotencyKey: randomUUID() });
    return { result, ms: performance.now() - started };
  };
  const children = () =>
    runWithoutTenant(() =>
      prisma.recordLink.count({ where: { companyId: seed.company.id, relationId, deletedAt: null } }),
    );
  const lookups = () =>
    runWithoutTenant(() =>
      prisma.recordValue.count({ where: { companyId: seed.company.id, fieldId: lookupId, decimalValue: "11.005" } }),
    );
  const rollup = async () =>
    (
      await runWithoutTenant(() =>
        prisma.recordValue.findFirst({
          where: { companyId: seed.company.id, fieldId: rollupId, recordId: target.recordId },
        }),
      )
    )?.decimalValue?.toNumber();
  return { seedChildren, document, importDocument, timedImport, children, lookups, rollup };
}

describeDatabase("linked record import into a heavily linked target", () => {
  it("imports a linked batch into a target with 1,000 children within budget, atomically and idempotently", async () => {
    const f = await fixture(false);
    await f.seedChildren(1000);

    const imported = await f.timedImport(BATCH);
    expect(imported.result, JSON.stringify(imported.result)).toMatchObject({
      ok: true,
      data: { created: BATCH, linked: BATCH },
    });
    expect(imported.ms).toBeLessThan(BATCH_BUDGET_MS);
    expect(await f.children()).toBe(1000 + BATCH);
    expect(await f.lookups()).toBe(1000 + BATCH);

    const replay = { document: f.document(BATCH), idempotencyKey: randomUUID() };
    const first = await f.importDocument(replay);
    expect(first).toMatchObject({ ok: true, data: { created: BATCH, linked: BATCH } });
    expect(await f.importDocument(replay)).toEqual(first);
    expect(await f.children()).toBe(1000 + 2 * BATCH);

    const failing = f.document(BATCH);
    failing.records[BATCH - 1] = { ...failing.records[BATCH - 1], ref: failing.records[0].ref };
    expect(await f.importDocument({ document: failing, idempotencyKey: randomUUID() })).toMatchObject({ ok: false });
    expect(await f.children()).toBe(1000 + 2 * BATCH);
    expect(await f.lookups()).toBe(1000 + 2 * BATCH);
  }, 300_000);

  it("recalculates a rollup over the target's children once per linked import, not once per link", async () => {
    const f = await fixture(true);
    await f.seedChildren(300);

    for (const expected of [300 + BATCH, 300 + 2 * BATCH]) {
      const imported = await f.timedImport(BATCH);
      expect(imported.result, JSON.stringify(imported.result)).toMatchObject({
        ok: true,
        data: { created: BATCH, linked: BATCH },
      });
      expect(imported.ms).toBeLessThan(BATCH_BUDGET_MS);
      expect(await f.rollup()).toBe(expected);
    }
    expect(await f.lookups()).toBe(300 + 2 * BATCH);
  }, 300_000);
});
