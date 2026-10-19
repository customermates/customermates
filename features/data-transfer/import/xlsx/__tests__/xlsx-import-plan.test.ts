import { describe, expect, it } from "vitest";

import type { RecordDto } from "@/features/records/record-model.schema";
import type { ImportRecordsInput } from "@/features/data-transfer/record-transfer.schema";
import type { XlsxImportPort, XlsxPlanInput } from "../xlsx-import-plan";

import { RecordExportSchema } from "@/features/data-transfer/record-transfer.schema";

import { planXlsxImport, runXlsxImport, xlsxImportBatches } from "../xlsx-import-plan";
import { xlsxTargetOptions, XLSX_CHANNELS_KEY } from "../xlsx-mapping";
import {
  addressField,
  COMPANY,
  fields,
  labels,
  model,
  PERSON,
  personFields,
  personModel,
  PROJECT,
  PROJECT_COMPANY,
} from "./xlsx-fixture";

const acme = { typeId: COMPANY, recordId: "40000000-0000-4000-8000-000000000001" };
const now = "2026-10-12T10:00:00.000Z";
let counter = 0;
const newId = () => `50000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

function input(headers: string[], mapping: string[], rows: XlsxPlanInput["rows"]): XlsxPlanInput {
  return {
    model,
    typeId: PROJECT,
    headers,
    rows,
    mapping,
    options: xlsxTargetOptions(model, PROJECT, labels),
    lookups: {
      members: [],
      relations: new Map([
        [
          PROJECT_COMPANY,
          { byTitle: new Map([["acme", [acme]]]), byId: new Map([[acme.recordId, acme]]), complete: true },
        ],
      ]),
    },
  };
}

const describeIssue = (issue: { code: string }) => issue.code;

describe("xlsx import planning", () => {
  it("builds complete create documents with defaults, links and per-row issues", () => {
    const plan = planXlsxImport(
      input(
        ["Name", "Budget", "Companies"],
        [`field:${fields.name.id}`, `field:${fields.budget.id}`, `relationship:${PROJECT_COMPANY}`],
        [
          { sheetRow: 2, cells: ["Atlas", 1200, "Acme"] },
          { sheetRow: 3, cells: ["", "twelve", null] },
          { sheetRow: 4, cells: ["Borealis", null, "Initech"] },
        ],
      ),
      "create",
      null,
      null,
      newId,
      now,
    );
    expect(plan[0].issues).toEqual([]);
    const record = plan[0].record;
    expect(record?.fields).toContainEqual({
      fieldId: fields.budget.id,
      result: { state: "value", value: { kind: "decimal", value: "1200", currency: "EUR" } },
    });
    expect(record?.fields).toContainEqual({
      fieldId: fields.priority.id,
      result: { state: "value", value: { kind: "select", value: "normal" } },
    });
    expect(record?.fields.some((field) => field.fieldId === fields.score.id)).toBe(false);
    expect(plan[0].links).toEqual([{ relationId: PROJECT_COMPANY, source: record?.ref, target: acme }]);
    expect(plan[1].record).toBeNull();
    expect(plan[1].issues.map((issue) => issue.code)).toEqual(["invalidNumber"]);
    expect(plan[2].issues).toEqual([
      { sheetRow: 4, column: "Companies", columnIndex: 2, code: "unknownRecord", value: "Initech" },
    ]);
    const document = {
      format: "customermates-records",
      version: 1,
      typeId: PROJECT,
      schemaRevision: model.revision,
      exportedAt: now,
      records: [record],
      links: plan[0].links,
    };
    expect(RecordExportSchema.safeParse(document).success).toBe(true);
  });

  it("fills first and last name from one full-name column", () => {
    const plan = planXlsxImport(
      {
        model: personModel,
        typeId: PERSON,
        headers: ["Full name"],
        rows: [
          { sheetRow: 2, cells: ["Ada Lovelace"] },
          { sheetRow: 3, cells: ["Hopper, Grace"] },
          { sheetRow: 4, cells: ["Cher"] },
        ],
        mapping: [`nameParts:${personFields.first.id}:${personFields.last.id}`],
        options: xlsxTargetOptions(personModel, PERSON, labels),
        lookups: { members: [], relations: new Map() },
      },
      "create",
      null,
      null,
      newId,
      now,
    );
    const names = plan.map((row) =>
      [personFields.first.id, personFields.last.id].map(
        (fieldId) => row.record?.fields.find((field) => field.fieldId === fieldId)?.result,
      ),
    );
    const text = (value: string) => ({ state: "value", value: { kind: "text", value } });
    expect(names).toEqual([
      [text("Ada"), text("Lovelace")],
      [text("Grace"), text("Hopper")],
      [text("Cher"), { state: "missing" }],
    ]);
    expect(plan.flatMap((row) => row.issues)).toEqual([]);
  });

  it("puts a one-word name into the required name part and drops titles", () => {
    const requiredLast = {
      ...personModel,
      fields: personModel.fields.map((field) =>
        field.id === personFields.last.id ? { ...field, required: true } : field,
      ),
    };
    const plan = planXlsxImport(
      {
        model: requiredLast,
        typeId: PERSON,
        headers: ["Full name"],
        rows: [
          { sheetRow: 2, cells: ["Cher"] },
          { sheetRow: 3, cells: ["Dr. Anna Schmidt"] },
        ],
        mapping: [`nameParts:${personFields.first.id}:${personFields.last.id}`],
        options: xlsxTargetOptions(requiredLast, PERSON, labels),
        lookups: { members: [], relations: new Map() },
      },
      "create",
      null,
      null,
      newId,
      now,
    );
    const text = (value: string) => ({ state: "value", value: { kind: "text", value } });
    expect(
      plan.map((row) =>
        [personFields.first.id, personFields.last.id].map(
          (fieldId) => row.record?.fields.find((field) => field.fieldId === fieldId)?.result,
        ),
      ),
    ).toEqual([
      [{ state: "missing" }, text("Cher")],
      [text("Anna"), text("Schmidt")],
    ]);
    expect(plan.flatMap((row) => row.issues)).toEqual([]);
  });

  it("reports a missing required value in create mode", () => {
    const plan = planXlsxImport(
      input(["Hours"], [`field:${fields.hours.id}`], [{ sheetRow: 2, cells: [3] }]),
      "create",
      null,
      null,
      newId,
      now,
    );
    expect(plan[0].issues).toEqual([{ sheetRow: 2, column: null, code: "required", value: "Name" }]);
  });

  it("updates matched records, keeps values of empty cells and skips rows without a match", () => {
    const existing: RecordDto = {
      ref: { typeId: PROJECT, recordId: "60000000-0000-4000-8000-000000000001" },
      version: 4,
      schemaRevision: model.revision,
      createdAt: now,
      updatedAt: now,
      fields: [
        { fieldId: fields.name.id, result: { state: "value", value: { kind: "text", value: "Atlas" } } },
        {
          fieldId: fields.hours.id,
          result: { state: "value", value: { kind: "decimal", value: "2", currency: null } },
        },
        {
          fieldId: fields.budget.id,
          result: { state: "value", value: { kind: "decimal", value: "9", currency: "EUR" } },
        },
      ],
      assignedUserIds: [],
      assignedUsers: [],
      memberUsers: [],
      relationships: [],
    };
    const plan = planXlsxImport(
      input(
        ["Name", "Hours", "Budget"],
        [`field:${fields.name.id}`, `field:${fields.hours.id}`, `field:${fields.budget.id}`],
        [
          { sheetRow: 2, cells: ["ATLAS", 5, null] },
          { sheetRow: 3, cells: ["Zephyr", 1, null] },
          { sheetRow: 4, cells: ["atlas", 6, null] },
        ],
      ),
      "update",
      `field:${fields.name.id}`,
      { records: [existing] },
      newId,
      now,
    );
    expect(plan[0].record?.version).toBe(4);
    expect(plan[0].record?.fields.find((field) => field.fieldId === fields.hours.id)?.result).toEqual({
      state: "value",
      value: { kind: "decimal", value: "5", currency: null },
    });
    expect(plan[0].record?.fields.find((field) => field.fieldId === fields.budget.id)).toEqual(existing.fields[2]);
    expect(plan[1]).toMatchObject({ record: null, skipped: "noMatch" });
    expect(plan[2].issues.map((issue) => issue.code)).toEqual(["duplicateMatch"]);
  });

  it("adds the numbers of Channels columns as identities and keeps a record's other identities", () => {
    const created = planXlsxImport(
      {
        ...input(
          ["Name", "Phone", "Mobile"],
          [`field:${fields.name.id}`, XLSX_CHANNELS_KEY, XLSX_CHANNELS_KEY],
          [{ sheetRow: 2, cells: ["Atlas", "0621 123456", "+49 621 123456; ada@example.test"] }],
        ),
        region: "de",
      },
      "create",
      null,
      null,
      newId,
      now,
    );
    expect(
      created[0].record?.identities?.map(({ provider, value, channelClass }) => ({ provider, value, channelClass })),
    ).toEqual([
      { provider: "phone", value: "+49621123456", channelClass: "phone" },
      { provider: "mail", value: "ada@example.test", channelClass: "email" },
    ]);
    expect(
      RecordExportSchema.safeParse({
        format: "customermates-records",
        version: 1,
        typeId: PROJECT,
        schemaRevision: model.revision,
        exportedAt: now,
        records: [created[0].record],
        links: [],
      }).success,
    ).toBe(true);

    const whatsapp = {
      id: "70000000-0000-4000-8000-000000000001",
      provider: "whatsapp" as const,
      value: "+491701234567",
      channelClass: "phone",
      messagingId: null,
      displayName: "Atlas",
      profileUrl: null,
      createdAt: now,
      updatedAt: now,
    };
    const existing: RecordDto = {
      ref: { typeId: PROJECT, recordId: "60000000-0000-4000-8000-000000000002" },
      version: 2,
      schemaRevision: model.revision,
      createdAt: now,
      updatedAt: now,
      fields: [{ fieldId: fields.name.id, result: { state: "value", value: { kind: "text", value: "Atlas" } } }],
      assignedUserIds: [],
      assignedUsers: [],
      memberUsers: [],
      relationships: [],
      identities: [whatsapp],
    };
    const update = (record: RecordDto, cells: string[]) =>
      planXlsxImport(
        {
          ...input(["Name", "Phone"], [`field:${fields.name.id}`, XLSX_CHANNELS_KEY], [{ sheetRow: 2, cells }]),
          region: "de",
        },
        "update",
        `field:${fields.name.id}`,
        { records: [record] },
        newId,
        now,
      )[0];
    expect(update(existing, ["Atlas", "0170 1234567, 0621 123456"]).record?.identities).toEqual([
      whatsapp,
      expect.objectContaining({ provider: "phone", value: "+49621123456" }),
    ]);
    expect(update(existing, ["Atlas", ""]).record?.identities).toEqual([whatsapp]);
    expect(update({ ...existing, identities: undefined }, ["Atlas", "0621 123456"])).toMatchObject({
      record: null,
      issues: [{ code: "lookupUnavailable", column: "Phone", value: "Phone" }],
    });
  });

  it("splits large imports into batches of at most 100 records and 500 links", () => {
    const rows = Array.from({ length: 250 }, (_, index) => ({
      sheetRow: index + 2,
      record: { ref: { typeId: PROJECT, recordId: newId() } } as RecordDto,
      links:
        index < 2
          ? Array.from({ length: 300 }, () => ({ relationId: PROJECT_COMPANY, source: acme, target: acme }))
          : [],
      issues: [],
      skipped: null,
    }));
    expect(xlsxImportBatches(rows).map((batch) => batch.length)).toEqual([1, 100, 100, 49]);
  });

  it("isolates failing rows of a rejected batch and stops on a fatal failure", async () => {
    const rows = Array.from({ length: 3 }, (_, index) => ({
      sheetRow: index + 2,
      record: { ref: { typeId: PROJECT, recordId: newId() } } as RecordDto,
      links: [],
      issues: [],
      skipped: null,
    }));
    const calls: ImportRecordsInput[] = [];
    const port: XlsxImportPort = (request) => {
      calls.push(request);
      const bad = request.document.records.some((record) => record.ref.recordId === rows[1].record.ref.recordId);
      return Promise.resolve(
        bad
          ? { ok: false, message: "Name must be unique", fatal: false }
          : { ok: true, data: { created: request.document.records.length, updated: 0, linked: 0, schemaRevision: 7 } },
      );
    };
    const summary = await runXlsxImport({
      rows: [
        ...rows,
        {
          sheetRow: 9,
          record: null,
          links: [],
          issues: [{ sheetRow: 9, column: "Name", code: "required" }],
          skipped: null,
        },
      ],
      mode: "create",
      typeId: PROJECT,
      schemaRevision: 7,
      sessionKey: "session-key",
      now,
      importRecords: port,
      describeIssue,
    });
    expect(summary).toEqual({
      created: 2,
      updated: 0,
      skipped: 0,
      failed: [
        { sheetRow: 3, reasons: ["Name must be unique"] },
        { sheetRow: 9, reasons: ["required"] },
      ],
      warned: [],
    });
    expect(calls.map((call) => call.idempotencyKey)).toEqual([
      "session-key:0",
      "session-key:0:0",
      "session-key:0:1",
      "session-key:0:2",
    ]);

    const fatal = await runXlsxImport({
      rows,
      mode: "create",
      typeId: PROJECT,
      schemaRevision: 7,
      sessionKey: "other",
      now,
      importRecords: () => Promise.resolve({ ok: false, message: "No permission", fatal: true }),
      describeIssue,
    });
    expect(fatal.failed.map((failure) => failure.reasons)).toEqual([
      ["No permission"],
      ["No permission"],
      ["No permission"],
    ]);
  });

  it("joins address part columns into one address value and refuses an unknown country", () => {
    const withAddress = { ...model, fields: [...model.fields, addressField] };
    const options = xlsxTargetOptions(withAddress, PROJECT, labels);
    const part = (name: string) => `field:${addressField.id}:${name}`;
    const plan = planXlsxImport(
      {
        ...input([], [], []),
        model: withAddress,
        options,
        headers: ["Name", "Street", "ZIP", "City", "Country"],
        mapping: [`field:${fields.name.id}`, part("street"), part("postalCode"), part("city"), part("countryCode")],
        rows: [
          { sheetRow: 2, cells: ["Atlas", "Hauptstraße 5", "68259", "Mannheim", "Deutschland"] },
          { sheetRow: 3, cells: ["Borealis", null, null, null, null] },
          { sheetRow: 4, cells: ["Cygnus", "1 Infinite Loop", "95014", "Cupertino", "Atlantis"] },
        ],
      },
      "create",
      null,
      null,
      newId,
      now,
    );
    expect(plan[0].record?.fields).toContainEqual({
      fieldId: addressField.id,
      result: {
        state: "value",
        value: {
          kind: "address",
          value: {
            street: "Hauptstraße 5",
            line2: null,
            postalCode: "68259",
            city: "Mannheim",
            region: null,
            countryCode: "de",
            formatted: "",
            location: null,
            verification: { status: "unverified", provider: null, checkedAt: null },
          },
        },
      },
    });
    expect(plan[1].record?.fields).toContainEqual({ fieldId: addressField.id, result: { state: "missing" } });
    expect(plan[2]).toMatchObject({
      record: null,
      issues: [{ sheetRow: 4, column: "Country", code: "unknownCountry", value: "Atlantis" }],
    });
  });

  it("reports the address warnings of imported rows by sheet row", async () => {
    const plan = planXlsxImport(
      input(
        ["Name"],
        [`field:${fields.name.id}`],
        [
          { sheetRow: 2, cells: ["Atlas"] },
          { sheetRow: 3, cells: ["Borealis"] },
        ],
      ),
      "create",
      null,
      null,
      newId,
      now,
    );
    const second = plan[1].record?.ref.recordId ?? "";
    const summary = await runXlsxImport({
      rows: plan,
      mode: "create",
      typeId: PROJECT,
      schemaRevision: 7,
      sessionKey: "warnings",
      now,
      importRecords: () =>
        Promise.resolve({
          ok: true,
          data: {
            created: 2,
            updated: 0,
            linked: 0,
            schemaRevision: 7,
            warnings: [
              {
                code: "cityMismatch",
                fieldId: "office",
                recordIds: [second],
                part: "city",
                expected: ["Mannheim"],
                message: "Office: the city does not match the postal code, which belongs to Mannheim.",
              },
            ],
          },
        }),
      describeIssue,
      describeWarning: (warning) => `${warning.code}:${(warning.expected ?? []).join(",")}`,
    });
    expect(summary).toMatchObject({
      created: 2,
      failed: [],
      warned: [{ sheetRow: 3, reasons: ["cityMismatch:Mannheim"] }],
    });
  });
});
