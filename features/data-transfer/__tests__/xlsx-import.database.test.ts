import { PermissionService } from "@/core/base/permission.service";
import type { RecordScalar } from "@/features/records/record-model.schema";
import type { RecordMutation } from "@/features/records/record-query.schema";
import type { XlsxWizardPorts } from "@/app/[locale]/(protected)/records/[typeId]/components/xlsx-import-wizard.store";

import ExcelJS from "exceljs";
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
const { PrismaRecordRepo } = await import("@/features/records/prisma-record.repository");
const { RecordTrashService } = await import("@/features/records/record-trash.service");
const { PrismaUserRepo } = await import("@/features/user/prisma-user.repository");
const { RecordAccessPolicy } = await import("@/features/records/record-access");
const { RecordCalculationService } = await import("@/features/records/record-calculation.service");
const { RecordWriteService } = await import("@/features/records/record-write.service");
const { MutateRecordInteractor } = await import("@/features/records/mutate-record.interactor");
const { QueryRecordsInteractor } = await import("@/features/records/query-records.interactor");
const { GetRecordChoicesInteractor } = await import("@/features/records/get-record-choices.interactor");
const { ImportRecordsInteractor } = await import("@/features/data-transfer/import/import-records.interactor");
const { createCrmPreset, presetId } = await import("@/features/records/crm-preset");
const { XlsxImportWizardStore } = await import(
  "@/app/[locale]/(protected)/records/[typeId]/components/xlsx-import-wizard.store"
);

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
    const memberRole = await prisma.userRole.create({ data: { companyId: company.id, name: "Member" } });
    const [admin, member] = await Promise.all(
      [adminRole, memberRole].map((role, index) =>
        prisma.user.create({
          data: {
            companyId: company.id,
            roleId: role.id,
            firstName: index ? "Mia" : "Ada",
            lastName: index ? "Member" : "Admin",
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
  const mutate = new MutateRecordInteractor(
    repo,
    policy,
    writer,
    { dispatch: () => Promise.resolve() },
    new RecordTrashService(repo),
  );
  const query = new QueryRecordsInteractor(repo, policy);
  const importer = new ImportRecordsInteractor(repo, policy, writer);
  const choices = new GetRecordChoicesInteractor(repo, policy, query);
  const id = (key: string) => presetId(seed.company.id, key);
  await runWithTenant(admin, () =>
    runInTransaction(
      async () => {
        await repo.saveModel(createCrmPreset(seed.company.id), admin.id);
        await repo.setGrants(id("deal"), [{ roleId: seed.memberRole.id, actions: ["readAll"] }]);
        await repo.setGrants(id("organization"), [{ roleId: seed.memberRole.id, actions: ["readAll"] }]);
      },
      { timeout: 30000 },
    ),
  );
  const stored = await runWithTenant(admin, () => runInTransaction(() => repo.getModel()));
  const model = { ...stored, types: stored.types.filter((type) => type.id === id("deal")) };
  const create = async (mutation: Extract<RecordMutation, { action: "create" }>) => {
    const state = await runWithoutTenant(() =>
      prisma.recordSchemaState.findUniqueOrThrow({ where: { companyId: seed.company.id } }),
    );
    const result = await runWithTenant(admin, () =>
      mutate.invoke({ mutation, expectedRevision: state.revision, idempotencyKey: randomUUID() }),
    );
    if (!result.ok || result.data.status !== "completed") throw new Error(JSON.stringify(result));
    const ref = result.data.refs.find((candidate) => candidate.typeId === mutation.typeId);
    if (!ref) throw new Error("Fixture creation returned no reference");
    return ref;
  };
  const ports = (user: typeof admin): XlsxWizardPorts => ({
    queryRecords: async (input) => {
      const result = await runWithTenant(user, () => query.invoke(input));
      return result.ok ? { ok: true, data: result.data } : { ok: false };
    },
    listMembers: () =>
      Promise.resolve({
        members: [seed.admin, seed.member].map((user) => ({
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
        })),
        totalPages: 1,
      }),
    listChoices: async (typeId, page, pageSize) => {
      const result = await runWithTenant(user, () => choices.invoke({ typeId, page, pageSize }));
      return result.ok ? { ok: true, data: { records: result.data.records, total: result.data.total } } : { ok: false };
    },
    importRecords: async (input) => {
      const result = await runWithTenant(user, () => importer.invoke(input));
      return result.ok ? { ok: true, data: result.data } : { ok: false, message: result.error.message, fatal: false };
    },
  });
  const deals = () =>
    runWithoutTenant(() =>
      prisma.crmRecord.findMany({ where: { companyId: seed.company.id, typeId: id("deal") }, select: { id: true } }),
    );
  return { seed, admin, member, id, model, create, ports, query, deals };
}

async function workbook(rows: unknown[][]): Promise<ArrayBuffer> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet("Deals");
  for (const row of rows) sheet.addRow(row);
  const written = await book.xlsx.writeBuffer();
  return new Uint8Array(written as ArrayBuffer).slice().buffer;
}

async function runWizard(
  store: InstanceType<typeof XlsxImportWizardStore>,
  file: ArrayBuffer,
  mode: "create" | "update" = "create",
) {
  await store.load("deals.xlsx", Promise.resolve(file));
  await store.advance(String);
  await store.advance(String);
  await store.advance(String);
  store.setMode(mode);
  await store.advance((issue) => `${issue.code}:${issue.value ?? ""}`);
  return store.summary;
}

afterAll(async () => {
  if (companies.length) await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
});

describeDatabase("XLSX import through the generic record import", () => {
  it("creates and updates records with typed values, members and links, and refuses callers without access", async () => {
    const f = await fixture();
    const acme = await f.create({
      action: "create",
      typeId: f.id("organization"),
      fields: [{ fieldId: f.id("organization.name"), value: text("Acme GmbH") }],
    });
    const labels = { recordId: "Record ID", assignedTo: "Assigned to", rangeStart: "From", rangeEnd: "Until" };
    const file = await workbook([
      ["Name", "Stage", "Organizations", "Notes", "Assigned to"],
      ["Atlas", "qualified", "ACME GmbH", "First line\nSecond line", f.seed.admin.email],
      ["Borealis", "Won", "", "", ""],
      ["Cyclone", "Unknown", "Initech", "", ""],
    ]);

    const refused = new XlsxImportWizardStore(f.model, f.id("deal"), labels, f.ports(f.member));
    const denied = await runWizard(refused, file);
    expect(denied?.created).toBe(0);
    expect(denied?.failed.map((failure) => failure.sheetRow)).toEqual([2, 3, 4]);
    expect(await f.deals()).toEqual([]);

    const store = new XlsxImportWizardStore(f.model, f.id("deal"), labels, f.ports(f.admin));
    const summary = await runWizard(store, file);
    expect(store.mapping).toEqual([
      `field:${f.id("deal.name")}`,
      `field:${f.id("deal.stage")}`,
      `relationship:${f.id("deal.organizations")}`,
      `field:${f.id("deal.notes")}`,
      "assignedTo",
    ]);
    expect(summary).toEqual({
      created: 2,
      updated: 0,
      skipped: 0,
      failed: [{ sheetRow: 4, reasons: ["unknownOption:Unknown", "unknownRecord:Initech"] }],
    });

    const result = await runWithTenant(f.admin, () =>
      f.query.invoke({
        typeId: f.id("deal"),
        filters: [],
        relationships: [],
        sort: [{ fieldId: f.id("deal.name"), direction: "asc" }],
        page: 1,
        pageSize: 25,
      }),
    );
    if (!result.ok) throw new Error("Deals could not be read");
    const [atlas, borealis] = result.data.records;
    const value = (record: typeof atlas, key: string) =>
      record.fields.find((field) => field.fieldId === f.id(key))?.result;
    expect(value(atlas, "deal.name")).toEqual({ state: "value", value: text("Atlas") });
    expect(value(atlas, "deal.stage")).toEqual({
      state: "value",
      value: { kind: "select", value: f.id("deal.stage.qualified") },
    });
    expect(value(borealis, "deal.stage")).toEqual({
      state: "value",
      value: { kind: "select", value: f.id("deal.stage.won") },
    });
    const notes = value(atlas, "deal.notes");
    expect(notes?.state === "value" && notes.value.kind === "richText" && notes.value.documentJson).toContain(
      "Second line",
    );
    expect(atlas.assignedUserIds).toEqual([f.seed.admin.id]);
    const links = await runWithoutTenant(() =>
      prisma.recordLink.findMany({
        where: { companyId: f.seed.company.id, relationId: f.id("deal.organizations") },
        select: { sourceId: true, targetId: true },
      }),
    );
    expect(links).toEqual([{ sourceId: atlas.ref.recordId, targetId: acme.recordId }]);

    const update = new XlsxImportWizardStore(f.model, f.id("deal"), labels, f.ports(f.admin));
    const updated = await runWizard(
      update,
      await workbook([
        ["Name", "Stage"],
        ["atlas", "Won"],
        ["Zephyr", "Lost"],
      ]),
      "update",
    );
    expect(update.matchKey).toBe(`field:${f.id("deal.name")}`);
    expect(updated).toEqual({ created: 0, updated: 1, skipped: 1, failed: [] });
    expect(await f.deals()).toHaveLength(2);
    const after = await runWithTenant(f.admin, () =>
      f.query.invoke({
        typeId: f.id("deal"),
        filters: [],
        relationships: [],
        sort: [{ fieldId: f.id("deal.name"), direction: "asc" }],
        page: 1,
        pageSize: 25,
      }),
    );
    if (!after.ok) throw new Error("Deals could not be read");
    expect(value(after.data.records[0], "deal.stage")).toEqual({
      state: "value",
      value: { kind: "select", value: f.id("deal.stage.won") },
    });
    expect(value(after.data.records[0], "deal.notes")).toEqual(value(atlas, "deal.notes"));
  }, 120_000);
});
