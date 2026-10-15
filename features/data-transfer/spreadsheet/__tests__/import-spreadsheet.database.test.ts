import { randomUUID } from "node:crypto";

import ExcelJS from "exceljs";
import { afterAll, describe, expect, it, vi } from "vitest";

import type { RecordRef } from "@/features/records/record-model.schema";
import type { SpreadsheetTable } from "../spreadsheet.schema";

import { PermissionService } from "@/core/base/permission.service";
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
const { QueryRecordsInteractor } = await import("@/features/records/query-records.interactor");
const { GetRecordInteractor } = await import("@/features/records/get-record.interactor");
const { RecordQuerySchema } = await import("@/features/records/record-query.schema");
const { ImportRecordsInteractor } = await import("@/features/data-transfer/import/import-records.interactor");
const { ImportSpreadsheetInteractor } = await import("../import-spreadsheet.interactor");
const { readSpreadsheet } = await import("../read-spreadsheet");
const { ImportSpreadsheetSchema } = await import("../spreadsheet.schema");
const { spreadsheetRecordId } = await import("../spreadsheet-conversion");
const { createCrmPreset, presetId } = await import("@/features/records/crm-preset");

const describeDatabase = getLocalDatabaseTestUrl() ? describe : describe.skip;
const companies: string[] = [];

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
  const query = new QueryRecordsInteractor(repo, policy);
  const importer = new ImportRecordsInteractor(
    repo,
    policy,
    new RecordWriteService(repo, policy, new RecordCalculationService(repo)),
  );
  const spreadsheet = new ImportSpreadsheetInteractor(repo, query, importer);
  const read = new GetRecordInteractor(repo, policy);
  await runWithTenant(admin, () =>
    runInTransaction(() => repo.saveModel(createCrmPreset(seed.company.id), admin.id), { timeout: 30000 }),
  );
  const id = (key: string) => presetId(seed.company.id, key);
  const run = <T>(fn: () => Promise<T>) => runWithTenant(admin, fn);
  const list = async (type: string) => {
    const result = await run(() =>
      query.invoke(RecordQuerySchema.parse({ typeId: id(type), pageSize: 500, includeIdentities: type === "contact" })),
    );
    if (!result.ok) throw result.error;
    return result.data;
  };
  const record = async (ref: RecordRef) => {
    const result = await run(() =>
      read.invoke({
        ...ref,
        includeRelationships: [{ relationId: id("contact.organizations"), direction: "outgoing", limit: 25 }],
      }),
    );
    if (!result.ok) throw result.error;
    return result.data;
  };
  return { id, run, spreadsheet, list, record };
}

async function table(bytes: Uint8Array): Promise<SpreadsheetTable> {
  const result = await readSpreadsheet(bytes);
  if (!result.ok) throw new Error(result.code);
  return result.table;
}

describeDatabase("ImportSpreadsheetInteractor", () => {
  afterAll(async () => {
    await runWithoutTenant(() => prisma.company.deleteMany({ where: { id: { in: companies } } }));
    await prisma.$disconnect();
  }, 120000);

  it("imports a converted sheet into a preset workspace through the record importer", async () => {
    const f = await fixture();
    const organizations = await table(
      new TextEncoder().encode("Firma;Notizen\nAlpha GmbH;Erster Kontakt\nBeta AG;\n;nur Notiz\n"),
    );
    const organizationKey = randomUUID();
    const organizationImport = ImportSpreadsheetSchema.parse({
      table: organizations,
      mapping: {
        typeId: f.id("organization"),
        locale: "de",
        columns: [
          { column: "Firma", fieldId: f.id("organization.name") },
          { column: "Notizen", fieldId: f.id("organization.notes") },
        ],
      },
      idempotencyKey: organizationKey,
    });
    const first = await f.run(() => f.spreadsheet.invoke(organizationImport));
    expect(first, JSON.stringify(first)).toEqual({
      ok: true,
      data: {
        rowCount: 3,
        created: 2,
        linked: 0,
        errorCount: 1,
        errors: [{ rowNumber: 4, column: "Firma", code: "required" }],
        schemaRevision: 1,
        records: [
          { typeId: f.id("organization"), recordId: spreadsheetRecordId(organizationKey, "record:2") },
          { typeId: f.id("organization"), recordId: spreadsheetRecordId(organizationKey, "record:3") },
        ],
      },
    });
    expect(await f.run(() => f.spreadsheet.invoke(organizationImport))).toEqual(first);
    const imported = await f.list("organization");
    expect(imported.total).toBe(2);
    const names = new Map(
      imported.records.map((row) => {
        const name = row.fields.find((field) => field.fieldId === f.id("organization.name"))?.result;
        return [name?.state === "value" && name.value.kind === "text" ? name.value.value : "", row.ref];
      }),
    );
    expect([...names.keys()].sort()).toEqual(["Alpha GmbH", "Beta AG"]);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Kontakte");
    sheet.addRow(["Vorname", "Nachname", "E-Mail", "Firma"]);
    sheet.addRow(["Ada", "Lovelace", "ada@example.test", "Alpha GmbH; Beta AG"]);
    sheet.addRow(["Grace", "Hopper", null, "Gamma"]);
    sheet.addRow(["Alan", "Turing", "alan@example.test", null]);
    const contacts = await table(new Uint8Array(await workbook.xlsx.writeBuffer()));
    const result = await f.run(() =>
      f.spreadsheet.invoke(
        ImportSpreadsheetSchema.parse({
          table: contacts,
          mapping: {
            typeId: f.id("contact"),
            locale: "de",
            columns: [
              { column: "Vorname", fieldId: f.id("contact.firstName") },
              { column: "Nachname", fieldId: f.id("contact.lastName") },
              { column: "E-Mail", fieldId: f.id("capability.identity") },
            ],
            relationships: [{ column: "Firma", relationId: f.id("contact.organizations") }],
          },
          idempotencyKey: randomUUID(),
        }),
      ),
    );
    expect(result, JSON.stringify(result)).toMatchObject({
      ok: true,
      data: {
        rowCount: 3,
        created: 2,
        linked: 2,
        errors: [{ rowNumber: 3, column: "Firma", code: "relatedNotFound" }],
      },
    });
    const people = await f.list("contact");
    expect(people.total).toBe(2);
    const ada = people.records.find((row) =>
      row.fields.some(
        (field) =>
          field.fieldId === f.id("contact.name") &&
          field.result.state === "value" &&
          field.result.value.kind === "text" &&
          field.result.value.value === "Ada Lovelace",
      ),
    );
    if (!ada) throw new Error("Imported contact missing");
    const detail = await f.record(ada.ref);
    expect(detail.identities?.map((identity) => identity.value)).toEqual(["ada@example.test"]);
    expect(
      detail.relationships
        .filter((summary) => summary.relationId === f.id("contact.organizations"))
        .flatMap((summary) => summary.records.map((linked) => linked.ref.recordId))
        .sort(),
    ).toEqual([names.get("Alpha GmbH")?.recordId, names.get("Beta AG")?.recordId].sort());
  });

  it("splits a full-name column so the contact's formula name reads the whole name", async () => {
    const f = await fixture();
    const people = await table(new TextEncoder().encode("Name\nAda Lovelace\nUrsula von der Leyen\nCher\n"));
    const result = await f.run(() =>
      f.spreadsheet.invoke(
        ImportSpreadsheetSchema.parse({
          table: people,
          mapping: {
            typeId: f.id("contact"),
            locale: "en",
            columns: [
              { column: "Name", fieldId: f.id("contact.firstName"), namePart: "first" },
              { column: "Name", fieldId: f.id("contact.lastName"), namePart: "last" },
            ],
          },
          idempotencyKey: randomUUID(),
        }),
      ),
    );
    expect(result, JSON.stringify(result)).toMatchObject({ ok: true, data: { created: 3, errorCount: 0 } });
    const text = (row: { fields: Array<{ fieldId: string; result: unknown }> }, key: string) => {
      const value = row.fields.find((field) => field.fieldId === f.id(key))?.result;
      return value && typeof value === "object" && "value" in value ? (value.value as { value: string }).value : null;
    };
    const contacts = (await f.list("contact")).records.map((row) => [
      text(row, "contact.name"),
      text(row, "contact.firstName"),
      text(row, "contact.lastName"),
    ]);
    expect(contacts.sort()).toEqual([
      ["Ada Lovelace", "Ada", "Lovelace"],
      ["Cher", "Cher", null],
      ["Ursula von der Leyen", "Ursula", "von der Leyen"],
    ]);
  });

  it("rejects a mapping the importer cannot honour without writing", async () => {
    const f = await fixture();
    const result = await f.run(() =>
      f.spreadsheet.invoke(
        ImportSpreadsheetSchema.parse({
          table: { sheetName: "S", headers: ["Notes"], rows: [{ rowNumber: 2, cells: ["x"] }] },
          mapping: {
            typeId: f.id("organization"),
            locale: "en",
            columns: [{ column: "Notes", fieldId: f.id("organization.notes") }],
          },
          idempotencyKey: randomUUID(),
        }),
      ),
    );
    expect(result).toMatchObject({ ok: false });
    expect((await f.list("organization")).total).toBe(0);
  });
});
