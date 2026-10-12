import type { CalculatedValue, RecordDto, RecordField, RecordModel } from "@/features/records/record-model.schema";

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import {
  DATE_NUMBER_FORMAT,
  DATE_TIME_NUMBER_FORMAT,
  neutralizeFormula,
  recordWorkbookSheets,
  richTextToPlainText,
  writeRecordWorkbook,
} from "../export/record-workbook";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const DEALS = uuid(1);
const LINES = uuid(2);
const COMPANIES = uuid(3);
const HIDDEN = uuid(4);
const OWNER = uuid(90);

const LABELS = {
  assignedTo: "Assigned to",
  createdAt: "Created at",
  updatedAt: "Updated at",
  rangeStart: "From",
  rangeEnd: "Until",
  recordId: "Record ID",
};

let position = 0;
function field(id: number, label: string, valueType: RecordField["valueType"], extra: Partial<RecordField> = {}) {
  return {
    id: uuid(id),
    typeId: DEALS,
    label,
    valueType,
    behavior: { kind: "input" },
    required: false,
    archived: false,
    publishedSummary: false,
    options: [],
    position: position++,
    ...extra,
  } as RecordField;
}

const fields = [
  field(10, "Name", "text"),
  field(11, "Notes", "richText"),
  field(12, "Quantity", "number", { format: { decimalPlaces: 0 } }),
  field(13, "Value", "currency", { format: { currency: "EUR" } }),
  field(14, "Won", "boolean"),
  field(15, "Close date", "date"),
  field(16, "Last call", "dateTime"),
  field(17, "Campaign", "dateRange"),
  field(18, "Stage", "select", {
    options: [
      { id: "won", label: "Won", color: null, attributes: [] },
      { id: "lost", label: "Lost", color: null, attributes: [] },
    ],
  }),
  field(19, "Tags", "select", {
    multiple: true,
    options: [
      { id: "vip", label: "VIP", color: null, attributes: [] },
      { id: "partner", label: "Partner", color: null, attributes: [] },
    ],
  }),
  field(20, "Emails", "email", { multiple: true }),
  field(21, "Owner", "member"),
  field(22, "Weighted", "currency", {
    behavior: { kind: "formula", expression: { kind: "field", fieldId: uuid(13) } },
  }),
  field(23, "Secret margin", "currency"),
  field(24, "Channels", "channels"),
  field(25, "Archived", "text", { archived: true }),
  { ...field(26, "Line name", "text"), typeId: LINES },
];

const model: RecordModel = {
  revision: 1,
  types: [
    {
      id: DEALS,
      label: "Deal",
      pluralLabel: "Deals",
      description: "",
      icon: "",
      primaryFieldId: uuid(10),
      parentRelationshipId: null,
      embedded: false,
      navigationVisible: true,
      archived: false,
      position: 0,
    },
    {
      id: LINES,
      label: "Line item",
      pluralLabel: "Line items",
      description: "",
      icon: "",
      primaryFieldId: uuid(26),
      parentRelationshipId: uuid(51),
      embedded: true,
      navigationVisible: false,
      archived: false,
      position: 1,
    },
    {
      id: COMPANIES,
      label: "Company",
      pluralLabel: "Companies",
      description: "",
      icon: "",
      primaryFieldId: null,
      parentRelationshipId: null,
      embedded: false,
      navigationVisible: true,
      archived: false,
      position: 2,
    },
    {
      id: HIDDEN,
      label: "Secret",
      pluralLabel: "Secrets",
      description: "",
      icon: "",
      primaryFieldId: null,
      parentRelationshipId: null,
      embedded: false,
      navigationVisible: true,
      archived: false,
      position: 3,
    },
  ],
  fields,
  relationships: [
    relation(50, DEALS, COMPANIES, "Company", "Deals"),
    relation(51, LINES, DEALS, "Deal", "Line items"),
    relation(52, DEALS, HIDDEN, "Secret", "Deals"),
  ],
  accessPresets: [],
  capabilities: [],
};

function relation(id: number, sourceTypeId: string, targetTypeId: string, sourceLabel: string, targetLabel: string) {
  return {
    id: uuid(id),
    sourceTypeId,
    targetTypeId,
    sourceLabel,
    targetLabel,
    sourceCardinality: "one" as const,
    targetCardinality: "many" as const,
    onSourceDelete: "unlink" as const,
    onTargetDelete: "unlink" as const,
    messagesOnSource: false,
    messagesOnTarget: false,
    archived: false,
  };
}

const value = (scalar: unknown): CalculatedValue => ({ state: "value", value: scalar }) as CalculatedValue;
const doc = JSON.stringify({
  type: "doc",
  content: [
    { type: "heading", content: [{ type: "text", text: "Summary" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "First " },
        { type: "text", text: "line" },
        { type: "hardBreak" },
        { type: "text", text: "second" },
      ],
    },
    {
      type: "bulletList",
      content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Point" }] }] }],
    },
  ],
});

function record(
  id: number,
  typeId: string,
  values: Record<number, CalculatedValue>,
  extra: Partial<RecordDto> = {},
): RecordDto {
  return {
    ref: { typeId, recordId: uuid(id) },
    version: 1,
    schemaRevision: 1,
    createdAt: "2026-01-02T03:04:05.000Z",
    updatedAt: "2026-02-03T04:05:06.000Z",
    fields: Object.entries(values).map(([fieldId, result]) => ({ fieldId: uuid(Number(fieldId)), result })),
    assignedUserIds: [],
    assignedUsers: [],
    memberUsers: [],
    relationships: [],
    ...extra,
  };
}

const full = record(
  100,
  DEALS,
  {
    10: value({ kind: "text", value: '=HYPERLINK("x")' }),
    11: value({ kind: "richText", documentJson: doc }),
    12: value({ kind: "decimal", value: "3", currency: null }),
    13: value({ kind: "decimal", value: "12500.5", currency: "EUR" }),
    14: value({ kind: "boolean", value: true }),
    15: value({ kind: "date", value: "2026-11-04" }),
    16: value({ kind: "dateTime", value: "2026-11-04T09:30:00.000Z" }),
    17: value({ kind: "range", start: "2026-03-01", end: "2026-03-31" }),
    18: value({ kind: "select", value: "won" }),
    19: value({ kind: "selectList", value: ["vip", "partner"] }),
    20: value({ kind: "textList", value: ["a@example.test", "b@example.test"] }),
    21: value({ kind: "member", value: OWNER }),
    22: value({ kind: "decimal", value: "6250.25", currency: "USD" }),
    23: { state: "restricted" },
  },
  {
    assignedUsers: [{ id: uuid(91), firstName: "Ada", lastName: "Lovelace", avatarUrl: null }],
    memberUsers: [{ id: OWNER, firstName: "Max", lastName: "Weber", avatarUrl: null }],
    identities: [{ value: "deal@example.test" }, { value: "+49 30 1234" }] as RecordDto["identities"],
    relationships: [
      {
        relationId: uuid(50),
        direction: "outgoing",
        readableCount: 2,
        hasMore: false,
        records: [
          { ref: { typeId: COMPANIES, recordId: uuid(200) }, title: value({ kind: "text", value: "Acme GmbH" }) },
          { ref: { typeId: COMPANIES, recordId: uuid(201) }, title: { state: "restricted" } },
        ],
      },
      {
        relationId: uuid(51),
        direction: "incoming",
        readableCount: 1,
        hasMore: false,
        records: [{ ref: { typeId: LINES, recordId: uuid(300) }, title: value({ kind: "text", value: "Setup" }) }],
      },
    ],
  },
);
const empty = record(101, DEALS, {
  10: value({ kind: "text", value: "Empty" }),
  22: { state: "error", code: "division_by_zero" },
  23: { state: "restricted" },
});
const line = record(300, LINES, { 26: value({ kind: "text", value: "Setup" }) });

async function load(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

describe("record workbook", () => {
  const canRead = (typeId: string) => typeId !== HIDDEN;

  it("lays out one sheet per list with readable fields in field order and labelled headers", () => {
    const sheets = recordWorkbookSheets(model, DEALS, [full, line, empty], LABELS, canRead);
    expect(sheets.map((sheet) => sheet.name)).toEqual(["Deals", "Line items"]);
    expect(sheets[0].columns.map((column) => column.header)).toEqual([
      "Name",
      "Notes",
      "Quantity",
      "Value (EUR)",
      "Won",
      "Close date",
      "Last call",
      "Campaign (From)",
      "Campaign (Until)",
      "Stage",
      "Tags",
      "Emails",
      "Owner",
      "Weighted",
      "Channels",
      "Company",
      "Line items",
      "Assigned to",
      "Created at",
      "Updated at",
      "Record ID",
    ]);
    expect(sheets[0].columns.at(-1)).toMatchObject({ hidden: true });
    expect(sheets[1].columns.map((column) => column.header)).toEqual([
      "Line name",
      "Deal",
      "Assigned to",
      "Created at",
      "Updated at",
      "Record ID",
    ]);
    expect(sheets[0].rows).toHaveLength(2);
  });

  it("keeps a field restricted on only some rows and blanks those cells", () => {
    const visible = record(102, DEALS, { 23: value({ kind: "decimal", value: "10", currency: "EUR" }) });
    const [sheet] = recordWorkbookSheets(model, DEALS, [full, visible], LABELS, canRead);
    const index = sheet.columns.findIndex((column) => column.header === "Secret margin");
    expect(index).toBeGreaterThan(-1);
    expect(sheet.rows.map((row) => row[index])).toEqual([null, { value: 10, numFmt: '#,##0.00 "EUR"' }]);
  });

  it("writes typed spreadsheet values for every field type", async () => {
    const buffer = await writeRecordWorkbook(recordWorkbookSheets(model, DEALS, [full, line, empty], LABELS, canRead));
    const workbook = await load(buffer);
    const sheet = workbook.getWorksheet("Deals");
    if (!sheet) throw new Error("Deals sheet missing");
    const headers = (sheet.getRow(1).values as unknown[]).slice(1);
    const cell = (header: string, row = 2) => sheet.getRow(row).getCell(headers.indexOf(header) + 1);

    expect(cell("Name").value).toBe('\'=HYPERLINK("x")');
    expect(cell("Notes").value).toBe("Summary\nFirst line\nsecond\nPoint");
    expect(cell("Quantity").value).toBe(3);
    expect(cell("Quantity").numFmt).toBe("#,##0");
    expect(cell("Value (EUR)").value).toBe(12500.5);
    expect(cell("Value (EUR)").numFmt).toBe('#,##0.00 "EUR"');
    expect(cell("Won").value).toBe(true);
    expect(cell("Close date").value).toEqual(new Date("2026-11-04T00:00:00.000Z"));
    expect(cell("Close date").numFmt).toBe(DATE_NUMBER_FORMAT);
    expect(cell("Last call").value).toEqual(new Date("2026-11-04T09:30:00.000Z"));
    expect(cell("Last call").numFmt).toBe(DATE_TIME_NUMBER_FORMAT);
    expect(cell("Campaign (From)").value).toEqual(new Date("2026-03-01T00:00:00.000Z"));
    expect(cell("Campaign (Until)").value).toEqual(new Date("2026-03-31T00:00:00.000Z"));
    expect(cell("Stage").value).toBe("Won");
    expect(cell("Tags").value).toBe("VIP, Partner");
    expect(cell("Emails").value).toBe("a@example.test, b@example.test");
    expect(cell("Owner").value).toBe("Max Weber");
    expect(cell("Weighted").value).toBe(6250.25);
    expect(cell("Weighted").numFmt).toBe('#,##0.00 "USD"');
    expect(cell("Channels").value).toBe("deal@example.test, +49 30 1234");
    expect(cell("Company").value).toBe("Acme GmbH");
    expect(cell("Line items").value).toBe("Setup");
    expect(cell("Assigned to").value).toBe("Ada Lovelace");
    expect(cell("Created at").value).toEqual(new Date("2026-01-02T03:04:05.000Z"));
    expect(cell("Record ID").value).toBe(uuid(100));
    expect(sheet.getColumn(headers.indexOf("Record ID") + 1).hidden).toBe(true);

    expect(headers).not.toContain("Secret margin");
    expect(headers).not.toContain("Secret");
    expect(headers).not.toContain("Archived");
    expect(cell("Name", 3).value).toBe("Empty");
    expect(cell("Weighted", 3).value).toBeNull();
    expect(cell("Value (EUR)", 3).value).toBeNull();

    const lines = workbook.getWorksheet("Line items");
    expect(lines?.getRow(2).getCell(1).value).toBe("Setup");
  });

  it("names sheets within spreadsheet limits and writes headers for empty lists", async () => {
    const long = {
      ...model,
      types: model.types.map((type) =>
        type.id === DEALS ? { ...type, pluralLabel: "Deals: [open/closed] pipeline and archive" } : type,
      ),
    };
    const sheets = recordWorkbookSheets(long, DEALS, [], LABELS, canRead);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].name).toBe("Deals open closed pipeline and");
    expect(sheets[0].columns.map((column) => column.header)).toContain("Secret margin");
    const workbook = await load(await writeRecordWorkbook(sheets));
    expect(workbook.worksheets[0].getRow(1).getCell(1).value).toBe("Name");
    expect(workbook.worksheets[0].rowCount).toBe(1);
  });

  it("converts formatted text to plain text and neutralizes formulas", () => {
    expect(richTextToPlainText(doc)).toBe("Summary\nFirst line\nsecond\nPoint");
    expect(richTextToPlainText("not json")).toBe("");
    expect(neutralizeFormula("=1+1")).toBe("'=1+1");
    expect(neutralizeFormula("+1")).toBe("+1");
  });
});
