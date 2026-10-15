import { randomUUID } from "node:crypto";

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import type { RecordField, RecordModel } from "@/features/records/record-model.schema";
import type { SpreadsheetMapping, SpreadsheetTable } from "../spreadsheet.schema";

import { ImportRecordsSchema } from "@/features/data-transfer/record-transfer.schema";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { readSpreadsheet } from "../read-spreadsheet";
import { SpreadsheetMappingSchema } from "../spreadsheet.schema";
import { convertSpreadsheet, spreadsheetMappingIssues, spreadsheetRelatedNames } from "../spreadsheet-conversion";

const companyId = randomUUID();
const id = (key: string) => presetId(companyId, key);

function field(key: string, label: string, valueType: RecordField["valueType"], extra: Partial<RecordField> = {}) {
  return {
    id: id(key),
    typeId: id("organization"),
    label,
    valueType,
    behavior: { kind: "input" as const },
    required: false,
    archived: false,
    publishedSummary: false,
    options: [],
    position: 10,
    ...extra,
  } satisfies RecordField;
}

function model(): RecordModel {
  const preset = createCrmPreset(companyId);
  const option = (key: string, label: string) => ({ id: key, label, color: null, attributes: [] });
  preset.fields.push(
    field("organization.revenue", "Revenue", "currency", { format: { currency: "EUR" } }),
    field("organization.employees", "Employees", "number"),
    field("organization.founded", "Founded", "date"),
    field("organization.lastContact", "Last contact", "dateTime"),
    field("organization.customer", "Customer", "boolean"),
    field("organization.tier", "Tier", "select", { options: [option("gold", "Gold"), option("silver", "Silver")] }),
    field("organization.tags", "Tags", "select", {
      multiple: true,
      options: [option("b2b", "B2B"), option("saas", "SaaS"), option("eu", "EU")],
    }),
    field("organization.phone", "Phone", "phone"),
    field("organization.emails", "Emails", "email", { multiple: true }),
    field("organization.website", "Website", "url"),
  );
  return preset;
}

const csv = (text: string) => new TextEncoder().encode(text);

async function tableOf(bytes: Uint8Array): Promise<SpreadsheetTable> {
  const result = await readSpreadsheet(bytes);
  if (!result.ok) throw new Error(result.code);
  return result.table;
}

function organizationMapping(columns: Array<[string, string]>, extra: Partial<SpreadsheetMapping> = {}) {
  return SpreadsheetMappingSchema.parse({
    typeId: id("organization"),
    locale: "de",
    timeZone: "Europe/Berlin",
    phoneCountryCode: "49",
    columns: columns.map(([column, key]) => ({ column, fieldId: id(key) })),
    ...extra,
  });
}

const organizationColumns: Array<[string, string]> = [
  ["Firma", "organization.name"],
  ["Umsatz", "organization.revenue"],
  ["Mitarbeiter", "organization.employees"],
  ["Gegründet", "organization.founded"],
  ["Letzter Kontakt", "organization.lastContact"],
  ["Kunde", "organization.customer"],
  ["Stufe", "organization.tier"],
  ["Tags", "organization.tags"],
  ["Telefon", "organization.phone"],
  ["E-Mail", "organization.emails"],
  ["Web", "organization.website"],
  ["Notizen", "organization.notes"],
];

const germanCsv = [
  "Firma;Umsatz;Mitarbeiter;Gegründet;Letzter Kontakt;Kunde;Stufe;Tags;Telefon;E-Mail;Web;Notizen",
  'Alpha GmbH;1.234,56 €;1.200;31.12.2026;31.12.2026 14:30;ja;gold;"b2b, SaaS";030 1234567;"a@alpha.de, b@alpha.de";alpha.de;Erster **Kontakt**',
  ";;;;;;;;;;;",
  "Beta AG;99,5;12,5;01.07.2026;01.07.2026 08:00;nein;SILVER;;+44 20 7946 0958;;https://beta.example;",
  "Gamma KG;viel;3;32.01.2026;;vielleicht;Bronze;B2B;12345;kein;;",
  ";5;;;;;;;;;;",
].join("\n");

function values(document: ReturnType<typeof convertSpreadsheet>["documents"][number], index: number) {
  return Object.fromEntries(document.records[index].fields.map((entry) => [entry.fieldId, entry.result]));
}

describe("convertSpreadsheet", () => {
  it("converts German values into the customermates-records payload the importer accepts", async () => {
    const table = await tableOf(csv(germanCsv));
    const mapping = organizationMapping(organizationColumns);
    const current = model();
    expect(spreadsheetMappingIssues(table.headers, mapping, current)).toEqual([]);
    const result = convertSpreadsheet(table, mapping, current, { idempotencyKey: "import-key-1", related: new Map() });
    expect(result.rowCount).toBe(4);
    expect(result.convertedRows).toBe(2);
    expect(result.documents).toHaveLength(1);
    const [document] = result.documents;
    expect(ImportRecordsSchema.safeParse({ document, mode: "create", idempotencyKey: "import-key-1:0" }).success).toBe(
      true,
    );
    const alpha = values(document, 0);
    expect(alpha[id("organization.name")]).toEqual({ state: "value", value: { kind: "text", value: "Alpha GmbH" } });
    expect(alpha[id("organization.revenue")]).toEqual({
      state: "value",
      value: { kind: "decimal", value: "1234.56", currency: "EUR" },
    });
    expect(alpha[id("organization.employees")]).toEqual({
      state: "value",
      value: { kind: "decimal", value: "1200", currency: null },
    });
    expect(alpha[id("organization.founded")]).toEqual({ state: "value", value: { kind: "date", value: "2026-12-31" } });
    expect(alpha[id("organization.lastContact")]).toEqual({
      state: "value",
      value: { kind: "dateTime", value: "2026-12-31T14:30:00+01:00" },
    });
    expect(alpha[id("organization.customer")]).toEqual({ state: "value", value: { kind: "boolean", value: true } });
    expect(alpha[id("organization.tier")]).toEqual({ state: "value", value: { kind: "select", value: "gold" } });
    expect(alpha[id("organization.tags")]).toEqual({
      state: "value",
      value: { kind: "selectList", value: ["b2b", "saas"] },
    });
    expect(alpha[id("organization.phone")]).toEqual({ state: "value", value: { kind: "text", value: "+49301234567" } });
    expect(alpha[id("organization.emails")]).toEqual({
      state: "value",
      value: { kind: "textList", value: ["a@alpha.de", "b@alpha.de"] },
    });
    expect(alpha[id("organization.website")]).toEqual({
      state: "value",
      value: { kind: "text", value: "https://alpha.de" },
    });
    expect(alpha[id("organization.notes")]).toMatchObject({ state: "value", value: { kind: "richText" } });
    const beta = values(document, 1);
    expect(beta[id("organization.revenue")]).toEqual({
      state: "value",
      value: { kind: "decimal", value: "99.5", currency: "EUR" },
    });
    expect(beta[id("organization.lastContact")]).toEqual({
      state: "value",
      value: { kind: "dateTime", value: "2026-07-01T08:00:00+02:00" },
    });
    expect(beta[id("organization.tier")]).toEqual({ state: "value", value: { kind: "select", value: "silver" } });
    expect(beta[id("organization.tags")]).toEqual({ state: "missing" });
    expect(document.records.map((record) => record.ref.typeId)).toEqual([id("organization"), id("organization")]);
    expect(result.errors).toEqual([
      { rowNumber: 5, column: "Umsatz", code: "invalidCurrency" },
      { rowNumber: 5, column: "Gegründet", code: "invalidDate" },
      { rowNumber: 5, column: "Kunde", code: "invalidBoolean" },
      { rowNumber: 5, column: "Stufe", code: "unknownOption" },
      { rowNumber: 5, column: "Telefon", code: "invalidPhone" },
      { rowNumber: 5, column: "E-Mail", code: "invalidEmail" },
      { rowNumber: 6, column: "Firma", code: "required" },
    ]);
  });

  it("keeps typed XLSX numbers and dates exact regardless of the mapping locale", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Orgs");
    sheet.addRow(["Firma", "Umsatz", "Mitarbeiter", "Gegründet", "Letzter Kontakt"]);
    sheet.addRow(["Delta", 1234.5, 1200, new Date(Date.UTC(2026, 11, 31)), new Date(Date.UTC(2026, 0, 2, 9, 30))]);
    const table = await tableOf(new Uint8Array(await workbook.xlsx.writeBuffer()));
    const result = convertSpreadsheet(table, organizationMapping(organizationColumns.slice(0, 5)), model(), {
      idempotencyKey: "xlsx-key-1",
      related: new Map(),
    });
    expect(result.errors).toEqual([]);
    const delta = values(result.documents[0], 0);
    expect(delta[id("organization.revenue")]).toEqual({
      state: "value",
      value: { kind: "decimal", value: "1234.5", currency: "EUR" },
    });
    expect(delta[id("organization.employees")]).toMatchObject({ value: { value: "1200" } });
    expect(delta[id("organization.founded")]).toEqual({ state: "value", value: { kind: "date", value: "2026-12-31" } });
    expect(delta[id("organization.lastContact")]).toEqual({
      state: "value",
      value: { kind: "dateTime", value: "2026-01-02T09:30:00+01:00" },
    });
  });

  it("maps duplicate headers independently and fills defaults for unmapped fields", async () => {
    const table = await tableOf(csv("Name;Name;Preis\nBeratung;Duplicate;\n"));
    expect(table.headers).toEqual(["Name", "Name (2)", "Preis"]);
    const mapping = SpreadsheetMappingSchema.parse({
      typeId: id("service"),
      locale: "de",
      columns: [{ column: "Name (2)", fieldId: id("service.name") }],
    });
    const result = convertSpreadsheet(table, mapping, model(), { idempotencyKey: "defaults-1", related: new Map() });
    const service = values(result.documents[0], 0);
    expect(service[id("service.name")]).toEqual({ state: "value", value: { kind: "text", value: "Duplicate" } });
    expect(service[id("service.amount")]).toEqual({
      state: "value",
      value: { kind: "decimal", value: "0", currency: "EUR" },
    });
    expect(service[id("service.notes")]).toEqual({ state: "missing" });
  });

  it("links related records by name, imports channel emails and reports unresolved names", async () => {
    const table = await tableOf(
      csv(
        [
          "Vorname,Nachname,E-Mail,Firma",
          "Ada,Lovelace,ada@example.com; ADA@example.com,Analytical Engines; Babbage Ltd",
          "Grace,Hopper,,Unknown Corp",
          "Alan,Turing,alan@example.com,Twins",
          "Bad,Mail,not-an-email,",
        ].join("\n"),
      ),
    );
    const current = model();
    const mapping = SpreadsheetMappingSchema.parse({
      typeId: id("contact"),
      locale: "en",
      columns: [
        { column: "Vorname", fieldId: id("contact.firstName") },
        { column: "Nachname", fieldId: id("contact.lastName") },
        { column: "E-Mail", fieldId: id("capability.identity") },
      ],
      relationships: [{ column: "Firma", relationId: id("contact.organizations") }],
    });
    expect(spreadsheetMappingIssues(table.headers, mapping, current)).toEqual([]);
    expect(spreadsheetRelatedNames(table, mapping, current)).toEqual(
      new Map([[id("contact.organizations"), ["Analytical Engines", "Babbage Ltd", "Unknown Corp", "Twins"]]]),
    );
    const engines = randomUUID();
    const babbage = randomUUID();
    const related = new Map([
      [
        id("contact.organizations"),
        new Map([
          ["Analytical Engines", [engines]],
          ["Babbage Ltd", [babbage]],
          ["Twins", [randomUUID(), randomUUID()]],
        ]),
      ],
    ]);
    const result = convertSpreadsheet(table, mapping, current, { idempotencyKey: "contacts-1", related });
    expect(result.errors).toEqual([
      { rowNumber: 3, column: "Firma", code: "relatedNotFound" },
      { rowNumber: 4, column: "Firma", code: "relatedAmbiguous" },
      { rowNumber: 5, column: "E-Mail", code: "invalidEmail" },
    ]);
    const [document] = result.documents;
    expect(document.records).toHaveLength(1);
    const ada = document.records[0];
    expect(ada.fields.some((entry) => entry.fieldId === id("contact.name"))).toBe(false);
    expect(ada.identities?.map(({ provider, value, channelClass }) => ({ provider, value, channelClass }))).toEqual([
      { provider: "mail", value: "ada@example.com", channelClass: "email" },
      { provider: "mail", value: "ADA@example.com", channelClass: "email" },
    ]);
    expect(document.links).toEqual([
      {
        relationId: id("contact.organizations"),
        source: ada.ref,
        target: { typeId: id("organization"), recordId: engines },
      },
      {
        relationId: id("contact.organizations"),
        source: ada.ref,
        target: { typeId: id("organization"), recordId: babbage },
      },
    ]);
  });

  it("fills first and last name from one full-name column", async () => {
    const table = await tableOf(
      csv(
        ["Name,E-Mail", "Ada Lovelace,ada@example.com", '"Hopper, Grace",', "Ludwig van Beethoven,", "Cher,"].join(
          "\n",
        ),
      ),
    );
    const current = model();
    const mapping = SpreadsheetMappingSchema.parse({
      typeId: id("contact"),
      locale: "en",
      columns: [
        { column: "Name", fieldId: id("contact.firstName"), namePart: "first" },
        { column: "Name", fieldId: id("contact.lastName"), namePart: "last" },
        { column: "E-Mail", fieldId: id("capability.identity") },
      ],
    });
    expect(spreadsheetMappingIssues(table.headers, mapping, current)).toEqual([]);
    const result = convertSpreadsheet(table, mapping, current, { idempotencyKey: "names-1", related: new Map() });
    expect(result.errors).toEqual([]);
    const names = result.documents[0].records.map((_record, index) => {
      const row = values(result.documents[0], index);
      return [row[id("contact.firstName")], row[id("contact.lastName")]];
    });
    const text = (value: string) => ({ state: "value", value: { kind: "text", value } });
    expect(names).toEqual([
      [text("Ada"), text("Lovelace")],
      [text("Grace"), text("Hopper")],
      [text("Ludwig"), text("van Beethoven")],
      [text("Cher"), { state: "missing" }],
    ]);
    expect(result.documents[0].records[0].fields.some((entry) => entry.fieldId === id("contact.name"))).toBe(false);
  });

  it("splits large sheets into importer-sized documents with stable record ids", async () => {
    const lines = ["Firma", ...Array.from({ length: 250 }, (_, index) => `Org ${index + 1}`)];
    const table = await tableOf(csv(lines.join("\n")));
    const mapping = organizationMapping([["Firma", "organization.name"]]);
    const first = convertSpreadsheet(table, mapping, model(), { idempotencyKey: "chunks-1", related: new Map() });
    expect(first.documents.map((document) => document.records.length)).toEqual([100, 100, 50]);
    for (const [index, document] of first.documents.entries()) {
      expect(
        ImportRecordsSchema.safeParse({ document, mode: "create", idempotencyKey: `chunks-1:${index}` }).success,
      ).toBe(true);
    }
    const again = convertSpreadsheet(table, mapping, model(), { idempotencyKey: "chunks-1", related: new Map() });
    expect(again.documents).toEqual(first.documents);
    const other = convertSpreadsheet(table, mapping, model(), { idempotencyKey: "chunks-2", related: new Map() });
    expect(other.documents[0].records[0].ref.recordId).not.toBe(first.documents[0].records[0].ref.recordId);
  });
});

describe("spreadsheetMappingIssues", () => {
  it("rejects mappings the importer cannot honour", () => {
    const current = model();
    const headers = ["Name", "Email", "Org"];
    const issues = (mapping: Record<string, unknown>) =>
      spreadsheetMappingIssues(headers, SpreadsheetMappingSchema.parse({ locale: "en", ...mapping }), current);
    expect(issues({ typeId: id("lineItem"), columns: [] })).toEqual([{ code: "typeNotImportable", path: ["typeId"] }]);
    expect(issues({ typeId: randomUUID(), columns: [] })).toEqual([{ code: "typeNotImportable", path: ["typeId"] }]);
    expect(
      issues({
        typeId: id("contact"),
        columns: [
          { column: "Name", fieldId: id("contact.name") },
          { column: "Missing", fieldId: id("contact.firstName") },
          { column: "Email", fieldId: id("contact.firstName") },
          { column: "Org", fieldId: id("organization.name") },
        ],
        relationships: [
          { column: "Org", relationId: id("deal.contacts") },
          { column: "Org", relationId: id("contact.organizations") },
        ],
      }),
    ).toEqual([
      { code: "fieldNotImportable", path: ["columns", 0, "fieldId"] },
      { code: "unknownColumn", path: ["columns", 1, "column"] },
      { code: "duplicateField", path: ["columns", 2, "fieldId"] },
      { code: "fieldNotImportable", path: ["columns", 3, "fieldId"] },
      { code: "relationshipNotImportable", path: ["relationships", 0, "relationId"] },
    ]);
    expect(issues({ typeId: id("organization"), columns: [] })).toEqual([
      { code: "requiredFieldUnmapped", path: ["fields", id("organization.name")] },
    ]);
    expect(
      issues({
        typeId: id("contact"),
        columns: [
          { column: "Name", fieldId: id("contact.firstName"), namePart: "first" },
          { column: "Name", fieldId: id("contact.avatarUrl"), namePart: "last" },
        ],
      }),
    ).toEqual([{ code: "fieldNotImportable", path: ["columns", 1, "namePart"] }]);
  });
});
