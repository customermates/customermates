import type { RecordAddress, RecordField, RecordModel, RecordScalar } from "../record-model.schema";

import { describe, expect, it } from "vitest";

import { RecordFieldAssignmentSchema, RecordScalarSchema } from "../record-model.schema";
import type { ModelIssue } from "../record-model-validation";
import { calculationExpressionIssues, scalarMatchesType, validateRecordModel } from "../record-model-validation";
import { configurationTypeChanges } from "../configuration-consumer-impact";
import { recordColumns } from "../record-columns";
import { recordInvariant } from "../record-invariant";
import {
  formatRecordAddress,
  sameAddressParts,
  unverifiedRecordAddress,
  verifiedRecordAddress,
} from "../record-address";
import { addressDisplayText, addressFromText } from "../record-address-value";
import { recordFilterOperators } from "../record-filter";
import { invalidRecordQueryPart, isRecordSortField } from "../record-query-validation";
import { RecordQuerySchema } from "../record-query.schema";
import { configurationInputValue } from "../record-configuration-values";
import { recordDraftValue, recordInputValue } from "../record-input-value";
import { encodeRecordValue } from "../record-storage";
import { recordValueDescriptor } from "@/features/messaging/activities/change-value-descriptor";
import { parseXlsxFieldCell } from "@/features/data-transfer/import/xlsx/xlsx-values";
import { xlsxImportFields } from "@/features/data-transfer/import/xlsx/xlsx-mapping";
import { recordWorkbookSheets } from "@/features/data-transfer/export/record-workbook";

const TYPE = "00000000-0000-4000-8000-000000000001";
const OTHER_TYPE = "00000000-0000-4000-8000-000000000002";
const FILE = "00000000-0000-4000-8000-000000000011";
const ADDRESS = "00000000-0000-4000-8000-000000000012";
const TEXT = "00000000-0000-4000-8000-000000000013";
const RELATION = "00000000-0000-4000-8000-000000000021";
const FILE_A = "00000000-0000-4000-8000-0000000000a1";
const FILE_B = "00000000-0000-4000-8000-0000000000b2";

function field(id: string, valueType: RecordField["valueType"], extra: Partial<RecordField> = {}): RecordField {
  return {
    id,
    typeId: TYPE,
    label: valueType,
    valueType,
    behavior: { kind: "input" },
    required: false,
    archived: false,
    publishedSummary: false,
    options: [],
    position: 0,
    ...extra,
  };
}

function model(fields: RecordField[]): RecordModel {
  const type = (id: string, label: string) => ({
    id,
    label,
    pluralLabel: `${label}s`,
    description: "",
    icon: "building",
    primaryFieldId: null,
    parentRelationshipId: null,
    embedded: false,
    navigationVisible: true,
    archived: false,
    position: 0,
  });
  return {
    revision: 1,
    types: [type(TYPE, "Company"), type(OTHER_TYPE, "Office")],
    fields,
    relationships: [
      {
        id: RELATION,
        sourceTypeId: OTHER_TYPE,
        targetTypeId: TYPE,
        sourceLabel: "Company",
        targetLabel: "Offices",
        sourceCardinality: "one",
        targetCardinality: "many",
        onSourceDelete: "unlink",
        onTargetDelete: "unlink",
        messagesOnSource: false,
        messagesOnTarget: false,
        archived: false,
      },
    ],
    accessPresets: [],
    capabilities: [],
  };
}

const MANNHEIM: RecordAddress = verifiedRecordAddress(
  {
    street: "Hauptstraße 5",
    line2: "c/o Studio",
    postalCode: "68159",
    city: "Mannheim",
    region: null,
    countryCode: "de",
  },
  { provider: "photon", checkedAt: "2026-10-14T12:00:00.000Z", location: { lat: 49.48, lon: 8.46 } },
);

describe("file and address scalars", () => {
  it("accepts ordered unique file ids and rejects empty, duplicate, oversized or non-uuid lists", () => {
    expect(RecordScalarSchema.parse({ kind: "file", value: [FILE_B, FILE_A] })).toEqual({
      kind: "file",
      value: [FILE_B, FILE_A],
    });
    for (const value of [[], [FILE_A, FILE_A], ["not-a-uuid"], Array.from({ length: 21 }, (_, i) => FILE_A + i)])
      expect(RecordScalarSchema.safeParse({ kind: "file", value }).success, JSON.stringify(value)).toBe(false);
  });

  it("fills address defaults, bounds part lengths and only accepts lowercase two-letter countries", () => {
    expect(RecordScalarSchema.parse({ kind: "address", value: { city: "Mannheim" } })).toEqual({
      kind: "address",
      value: {
        street: null,
        line2: null,
        postalCode: null,
        city: "Mannheim",
        region: null,
        countryCode: null,
        formatted: "",
        location: null,
        verification: { status: "unverified", provider: null, checkedAt: null },
      },
    });
    for (const value of [
      { street: "x".repeat(201) },
      { postalCode: "1".repeat(21) },
      { countryCode: "DE" },
      { countryCode: "deu" },
      { location: { lat: 91, lon: 0 } },
      { unknown: true },
    ])
      expect(RecordScalarSchema.safeParse({ kind: "address", value }).success, JSON.stringify(value)).toBe(false);
  });

  it("accepts a candidate token only on the write side and never together with a value", () => {
    const write = (value: unknown) => RecordFieldAssignmentSchema.safeParse({ fieldId: ADDRESS, value }).success;
    expect(write({ kind: "address", candidateToken: "token" })).toBe(true);
    expect(write({ kind: "address", candidateToken: "token", value: { city: "Mannheim" } })).toBe(false);
    expect(write({ kind: "text", candidateToken: "token" })).toBe(false);
    expect(RecordScalarSchema.safeParse({ kind: "address", candidateToken: "token" }).success).toBe(false);
  });

  it("matches a single file field to exactly one file and a multiple one to up to twenty", () => {
    expect(scalarMatchesType({ kind: "file", value: [FILE_A] }, "file")).toBe(true);
    expect(scalarMatchesType({ kind: "file", value: [FILE_A, FILE_B] }, "file")).toBe(false);
    expect(scalarMatchesType({ kind: "file", value: [FILE_A, FILE_B] }, "file", true)).toBe(true);
    expect(scalarMatchesType({ kind: "text", value: FILE_A }, "file", true)).toBe(false);
    expect(scalarMatchesType({ kind: "address", value: MANNHEIM }, "address")).toBe(true);
    expect(scalarMatchesType({ kind: "text", value: "Mannheim" }, "address")).toBe(false);
  });

  it("stores file ids in the list column and an address in json with its formatted line as text", () => {
    expect(encodeRecordValue({ state: "value", value: { kind: "file", value: [FILE_B, FILE_A] } })).toMatchObject({
      textListValue: [FILE_B, FILE_A],
      textValue: null,
      jsonValue: null,
    });
    expect(encodeRecordValue({ state: "value", value: { kind: "address", value: MANNHEIM } })).toMatchObject({
      textValue: MANNHEIM.formatted,
      jsonValue: MANNHEIM,
      textListValue: [],
    });
  });
});

describe("address formatting and server-owned verification", () => {
  it("formats per country template with line 2 after the street and without the country name", () => {
    expect(MANNHEIM.formatted).toBe("Hauptstraße 5, c/o Studio, 68159 Mannheim");
    expect(
      formatRecordAddress({
        street: "1600 Pennsylvania Ave NW",
        line2: null,
        postalCode: "20500",
        city: "Washington",
        region: "DC",
        countryCode: "us",
      }),
    ).toBe("1600 Pennsylvania Ave NW, Washington, DC 20500");
    expect(addressDisplayText(MANNHEIM, "de")).toBe("Hauptstraße 5, c/o Studio, 68159 Mannheim, Deutschland");
    const countryOnly = unverifiedRecordAddress({
      ...recordInvariant(addressFromText("x")),
      formatted: "",
      countryCode: "at",
    });
    expect(countryOnly).toMatchObject({ formatted: "", countryCode: "at" });
    expect(addressDisplayText(recordInvariant(countryOnly), "en")).toBe("Austria");
  });

  it("recomputes the formatted line, drops client verification and location and clears empty addresses", () => {
    const sent = { ...MANNHEIM, street: "  Hauptstraße   7 ", formatted: "Forged text" };
    expect(unverifiedRecordAddress(sent)).toEqual({
      ...MANNHEIM,
      street: "Hauptstraße 7",
      formatted: "Hauptstraße 7, c/o Studio, 68159 Mannheim",
      location: null,
      verification: { status: "unverified", provider: null, checkedAt: null },
    });
    expect(unverifiedRecordAddress({ ...recordInvariant(addressFromText("x")), formatted: "  " })).toBeNull();
    expect(unverifiedRecordAddress(recordInvariant(addressFromText("Somewhere 1, Town")))?.formatted).toBe(
      "Somewhere 1, Town",
    );
  });

  it("treats addresses with the same parts as unchanged regardless of verification", () => {
    expect(sameAddressParts(MANNHEIM, recordInvariant(unverifiedRecordAddress(MANNHEIM)))).toBe(true);
    expect(sameAddressParts(MANNHEIM, { ...MANNHEIM, postalCode: "68161" })).toBe(false);
    expect(sameAddressParts(recordInvariant(addressFromText("A")), recordInvariant(addressFromText("B")))).toBe(false);
  });
});

describe("file and address field definitions", () => {
  const issues = (fields: RecordField[]) => validateRecordModel(model(fields)).issues;

  it("allows file fields as plain multiple input and refuses defaults, options or calculations", () => {
    expect(issues([field(FILE, "file", { multiple: true, required: true })])).toEqual([]);
    expect(
      issues([field(FILE, "file", { behavior: { kind: "input", defaultValue: { kind: "file", value: [FILE_A] } } })]),
    ).toContainEqual({ code: "invalid_file_field", fieldId: FILE });
    expect(
      issues([field(FILE, "file", { behavior: { kind: "formula", expression: { kind: "field", fieldId: FILE } } })]),
    ).toContainEqual({ code: "invalid_file_field", fieldId: FILE });
    expect(
      calculationExpressionIssues(
        {
          kind: "related",
          relationId: RELATION,
          direction: "outgoing",
          reducer: "one",
          expression: { kind: "field", fieldId: FILE },
        },
        OTHER_TYPE,
        model([field(FILE, "file")]),
      ).issues,
    ).toContain("file_not_calculable");
  });

  it("allows address input and lookups but refuses multiple, defaults, formulas and arithmetic", () => {
    const lookup = field(TEXT, "address", {
      typeId: OTHER_TYPE,
      behavior: {
        kind: "lookup",
        expression: {
          kind: "related",
          relationId: RELATION,
          direction: "outgoing",
          reducer: "one",
          expression: { kind: "field", fieldId: ADDRESS },
        },
      },
    });
    expect(issues([field(ADDRESS, "address", { format: { onClick: "copy" } }), lookup])).toEqual([]);
    expect(issues([field(ADDRESS, "address", { multiple: true })])).toContainEqual({
      code: "invalid_multiple_value_type",
      fieldId: ADDRESS,
    });
    expect(
      issues([
        field(ADDRESS, "address", { behavior: { kind: "formula", expression: { kind: "field", fieldId: ADDRESS } } }),
      ]),
    ).toContainEqual({ code: "invalid_address_field", fieldId: ADDRESS });
    expect(
      calculationExpressionIssues(
        { kind: "operation", operator: "concat", arguments: [{ kind: "field", fieldId: ADDRESS }] },
        TYPE,
        model([field(ADDRESS, "address")]),
      ).issues,
    ).toContain("address_not_calculable");
    expect(issues([field(FILE, "file", { format: { onClick: "open" } })])).toContainEqual({
      code: "invalid_click_action",
      fieldId: FILE,
    });
  });

  it("refuses file and address fields as snapshot triggers", () => {
    const snapshot = (triggerFieldId: string, triggerValue: RecordScalar) =>
      field(TEXT, "text", {
        behavior: {
          kind: "snapshot",
          expression: { kind: "literal", value: { kind: "text", value: "Captured" } },
          capture: "whenChanged",
          triggerFieldId,
          triggerValue,
        },
      });
    expect(issues([field(ADDRESS, "address"), snapshot(ADDRESS, { kind: "address", value: MANNHEIM })])).toContainEqual(
      { code: "invalid_snapshot_trigger", fieldId: TEXT },
    );
    expect(issues([field(FILE, "file"), snapshot(FILE, { kind: "file", value: [FILE_A] })])).toContainEqual({
      code: "invalid_snapshot_trigger",
      fieldId: TEXT,
    });
  });

  it("never offers file columns for sorting", () => {
    const columns = recordColumns(TYPE, model([field(FILE, "file", { multiple: true }), field(ADDRESS, "address")]));
    expect(columns.filter((column) => column.kind === "field").map((column) => [column.id, column.sortable])).toEqual([
      [FILE, false],
      [ADDRESS, true],
    ]);
  });
});

describe("type changes", () => {
  const row = (value: object) => ({
    id: "record",
    typeId: TYPE,
    version: 1,
    protectedKind: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    assignments: [],
    values: [
      {
        companyId: "company",
        typeId: TYPE,
        recordId: "record",
        fieldId: ADDRESS,
        state: "value",
        textValue: null,
        textListValue: [],
        lexicalValue: null,
        decimalValue: null,
        currency: null,
        booleanValue: null,
        instantValue: null,
        rangeStart: null,
        rangeEnd: null,
        jsonValue: null,
        errorCode: null,
        schemaRevision: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...value,
      },
    ],
  });

  it("keeps the formatted line when an address becomes text and stores text as an unverified address", () => {
    const stored = row({ textValue: MANNHEIM.formatted, jsonValue: MANNHEIM });
    expect(configurationInputValue(stored as never, field(ADDRESS, "address"), field(ADDRESS, "text"))).toEqual({
      kind: "text",
      value: MANNHEIM.formatted,
    });
    expect(
      configurationInputValue(
        row({ textValue: " Hauptstraße 5, Mannheim " }) as never,
        field(ADDRESS, "text"),
        field(ADDRESS, "address"),
      ),
    ).toEqual({ kind: "address", value: addressFromText("Hauptstraße 5, Mannheim") });
  });

  it("refuses converting a field to or from file but lets text and address convert", () => {
    const change = (before: RecordField["valueType"], after: RecordField["valueType"]) => {
      const issues: ModelIssue[] = [];
      configurationTypeChanges(model([field(TEXT, before)]), model([field(TEXT, after)]), undefined, issues);
      return issues.map((issue) => issue.code);
    };
    expect(change("text", "file")).toContain("file_type_change");
    expect(change("file", "text")).toContain("file_type_change");
    expect(change("file", "address")).toContain("file_type_change");
    expect(change("text", "address")).toEqual([]);
    expect(change("address", "text")).toEqual([]);
  });
});

describe("filters, sorting and editor values", () => {
  it("offers presence filters for files and text filters for addresses", () => {
    expect(recordFilterOperators({ valueType: "file", multiple: true })).toEqual(["empty", "notEmpty"]);
    expect(recordFilterOperators({ valueType: "address", multiple: false })).toEqual([
      "contains",
      "startsWith",
      "empty",
      "notEmpty",
    ]);
    expect(isRecordSortField({ valueType: "address", multiple: false })).toBe(true);
    expect(isRecordSortField({ valueType: "file", multiple: true })).toBe(false);
  });

  it("validates file and address filters and sorts against the model", () => {
    const fields = [field(FILE, "file", { multiple: true }), field(ADDRESS, "address")];
    const invalid = (query: object) =>
      invalidRecordQueryPart(RecordQuerySchema.parse({ typeId: TYPE, ...query }), model(fields));
    expect(invalid({ filters: [{ fieldId: FILE, operator: "notEmpty", value: null }] })).toBeNull();
    expect(invalid({ filters: [{ fieldId: FILE, operator: "contains", value: { kind: "text", value: "a" } }] })).toBe(
      "filters",
    );
    expect(
      invalid({ filters: [{ fieldId: ADDRESS, operator: "contains", value: { kind: "text", value: "Mann" } }] }),
    ).toBeNull();
    expect(invalid({ filters: [{ fieldId: ADDRESS, operator: "eq", value: { kind: "text", value: "Mann" } }] })).toBe(
      "filters",
    );
    expect(invalid({ sort: [{ fieldId: ADDRESS, direction: "asc" }] })).toBeNull();
    expect(invalid({ sort: [{ fieldId: FILE, direction: "asc" }] })).toBe("sort");
  });

  it("round-trips editor drafts for files and addresses", () => {
    const fileField = { ...field(FILE, "file", { multiple: true }) };
    const addressField = field(ADDRESS, "address");
    expect(recordInputValue(recordDraftValue({ kind: "file", value: [FILE_A, FILE_B] }, fileField), fileField)).toEqual(
      {
        kind: "file",
        value: [FILE_A, FILE_B],
      },
    );
    expect(recordDraftValue(null, addressField)).toEqual({
      street: null,
      line2: null,
      postalCode: null,
      city: null,
      region: null,
      countryCode: null,
    });
    expect(recordInputValue(recordDraftValue(null, addressField), addressField)).toBeNull();
    expect(recordInputValue({ city: " Mannheim ", countryCode: "de" }, addressField)).toMatchObject({
      kind: "address",
      value: { city: "Mannheim", countryCode: "de", street: null, verification: { status: "unverified" } },
    });
  });
});

describe("workbooks and history", () => {
  it("exports file names and the displayed address and imports addresses as unverified text", () => {
    const fields = [
      field(FILE, "file", { multiple: true, label: "Files" }),
      field(ADDRESS, "address", { label: "Address" }),
    ];
    const [sheet] = recordWorkbookSheets(
      model(fields),
      TYPE,
      [
        {
          ref: { typeId: TYPE, recordId: "00000000-0000-4000-8000-000000000099" },
          version: 1,
          schemaRevision: 1,
          createdAt: "2026-10-14T12:00:00.000Z",
          updatedAt: "2026-10-14T12:00:00.000Z",
          fields: [
            { fieldId: FILE, result: { state: "value", value: { kind: "file", value: [FILE_B, FILE_A] } } },
            { fieldId: ADDRESS, result: { state: "value", value: { kind: "address", value: MANNHEIM } } },
          ],
          assignedUserIds: [],
          assignedUsers: [],
          memberUsers: [],
          relationships: [],
          files: [
            {
              id: FILE_A,
              name: "Offer.pdf",
              mimeType: "application/pdf",
              size: 10,
              uploadedAt: "2026-10-14T12:00:00.000Z",
              uploadedById: null,
            },
            {
              id: FILE_B,
              name: "Contract.pdf",
              mimeType: "application/pdf",
              size: 10,
              uploadedAt: "2026-10-14T12:00:00.000Z",
              uploadedById: null,
            },
          ],
        },
      ],
      {
        assignedTo: "Assigned",
        createdAt: "Created",
        updatedAt: "Updated",
        rangeStart: "Start",
        rangeEnd: "End",
        recordId: "ID",
        locale: "en",
      },
    );
    const files = sheet.columns.findIndex((column) => column.header === "Files");
    const address = sheet.columns.findIndex((column) => column.header === "Address");
    expect(sheet.rows[0][files]).toBe("Contract.pdf, Offer.pdf");
    expect(sheet.rows[0][address]).toBe("Hauptstraße 5, c/o Studio, 68159 Mannheim, Germany");

    expect(parseXlsxFieldCell("Hauptstraße 5, Mannheim", field(ADDRESS, "address"), null)).toEqual({
      ok: true,
      value: { kind: "address", value: addressFromText("Hauptstraße 5, Mannheim") },
    });
    expect(parseXlsxFieldCell("Offer.pdf", field(FILE, "file"), null)).toEqual({
      ok: false,
      code: "fileNotImportable",
      value: "Offer.pdf",
    });
    expect(xlsxImportFields(model(fields), TYPE).map((entry) => entry.id)).toEqual([ADDRESS]);
  });

  it("describes file history with the names stored at change time and addresses as their value", () => {
    expect(
      recordValueDescriptor(
        {
          fieldId: FILE,
          label: "Files",
          valueType: "file",
          format: undefined,
          options: [],
          value: { state: "value", value: { kind: "file", value: [FILE_A, FILE_B] } },
          files: [{ id: FILE_A, name: "Offer.pdf" }],
        },
        TYPE,
        [],
        "Former member",
      ),
    ).toEqual({
      kind: "choices",
      choices: [
        { id: FILE_A, label: "Offer.pdf" },
        { id: FILE_B, label: FILE_B },
      ],
    });
    expect(
      recordValueDescriptor(
        {
          fieldId: ADDRESS,
          label: "Address",
          valueType: "address",
          format: undefined,
          options: [],
          value: { state: "value", value: { kind: "address", value: MANNHEIM } },
        },
        TYPE,
        [],
        "Former member",
      ),
    ).toMatchObject({ kind: "field", result: { state: "value", value: { kind: "address", value: MANNHEIM } } });
  });
});
