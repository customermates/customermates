import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { WorkbookPage } from "../workbook-writer";

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { CustomColumnType, EntityType } from "@/generated/prisma";

import {
  DATE_TIME_NUMBER_FORMAT,
  buildExportColumns,
  buildSchemaSheetRows,
  RECORD_ID_COLUMN_KEY,
} from "../workbook-columns";
import { buildWorkbook } from "../workbook-writer";

const STATUS_ID = "aaaa1111-0000-4000-8000-00000000000a";
const QUALIFIED_OPTION = "11111111-0000-4000-8000-000000000001";

const statusColumn: CustomColumnDto = {
  id: STATUS_ID,
  label: "Status",
  entityType: EntityType.contact,
  type: CustomColumnType.singleSelect,
  options: {
    options: [{ value: QUALIFIED_OPTION, label: "Qualified", color: "success", isDefault: false, index: 0 }],
  },
};

function setup(pages: Array<Omit<WorkbookPage, "total">>) {
  const total = pages.reduce((count, page) => count + page.rows.length, 0);

  const columns = buildExportColumns(
    [
      { key: "name", header: "Name" },
      { key: STATUS_ID, header: "Status" },
      { key: "renewal", header: "Renewal" },
      { key: "value", header: "Deal Value" },
    ],
    [statusColumn],
  );

  return {
    sheetName: "Contacts",
    columns,
    schemaRows: buildSchemaSheetRows(columns),
    relationSheetNames: ["Organizations"],
    pageSize: 2,
    rowLimit: 100,
    fetchPage: (skip: number) => {
      const page = pages[skip / 2];
      return Promise.resolve(page ? { ...page, total } : null);
    },
  };
}

async function read(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

describe("buildWorkbook", () => {
  it("writes every page, hides the record id, and types dates and numbers so the reader formats them", async () => {
    const renewal = new Date("2026-11-04T00:00:00.000Z");
    const result = await buildWorkbook(
      setup([
        {
          rows: [
            { [RECORD_ID_COLUMN_KEY]: "id-1", name: "Max Weber", [STATUS_ID]: "Qualified", renewal, value: 12500.5 },
            { [RECORD_ID_COLUMN_KEY]: "id-2", name: "Ada Lovelace", [STATUS_ID]: null, renewal: null, value: 0 },
          ],
          relations: [
            {
              name: "Organizations",
              headers: ["contactId", "organizationId", "organizationName"],
              rows: [{ contactId: "id-1", organizationId: "org-1", organizationName: "Acme GmbH" }],
            },
          ],
        },
        {
          rows: [{ [RECORD_ID_COLUMN_KEY]: "id-3", name: "Grace Hopper", [STATUS_ID]: null, renewal: null, value: 7 }],
          relations: [],
        },
      ]),
    );

    expect(result.rowCount).toBe(3);
    expect(result.truncated).toBe(false);

    const workbook = await read(result.buffer);
    const sheet = workbook.getWorksheet("Contacts");

    expect(workbook.worksheets.map((worksheet) => worksheet.name)).toEqual(["Contacts", "Organizations", "Schema"]);
    expect(sheet?.getColumn(1).hidden).toBe(true);
    expect(sheet?.getRow(1).values).toEqual([undefined, "ID", "Name", "Status", "Renewal", "Deal Value"]);
    expect(sheet?.getRow(2).getCell(3).value).toBe("Qualified");
    expect(sheet?.getRow(2).getCell(4).value).toBeInstanceOf(Date);
    expect(sheet?.getRow(2).getCell(5).value).toBe(12500.5);
    expect(sheet?.getRow(4).getCell(2).value).toBe("Grace Hopper");
  });

  it("shows the time on a timestamp column, and still reads back as the same instant", async () => {
    const updatedAt = new Date("2026-11-04T15:37:09.123Z");
    const columns = buildExportColumns([{ key: "updatedAt", header: "Updated at" }], []);

    const result = await buildWorkbook({
      sheetName: "Contacts",
      columns,
      schemaRows: buildSchemaSheetRows(columns),
      relationSheetNames: [],
      pageSize: 10,
      rowLimit: 100,
      fetchPage: (skip: number) =>
        Promise.resolve(
          skip === 0 ? { rows: [{ [RECORD_ID_COLUMN_KEY]: "id-1", updatedAt }], relations: [], total: 1 } : null,
        ),
    });

    const sheet = (await read(result.buffer)).getWorksheet("Contacts");
    const cell = sheet?.getRow(2).getCell(2);

    expect(cell?.numFmt).toBe(DATE_TIME_NUMBER_FORMAT);
    expect(cell?.value).toBeInstanceOf(Date);
    expect((cell?.value as Date).getTime()).toBe(updatedAt.getTime());
  });

  it("writes the relation sheet with its header exactly once across pages", async () => {
    const relation = {
      name: "Organizations",
      headers: ["contactId", "organizationId", "organizationName"],
      rows: [{ contactId: "id-1", organizationId: "org-1", organizationName: "Acme GmbH" }],
    };

    const result = await buildWorkbook(
      setup([
        {
          rows: [
            { [RECORD_ID_COLUMN_KEY]: "id-1", name: "A" },
            { [RECORD_ID_COLUMN_KEY]: "id-2", name: "B" },
          ],
          relations: [relation],
        },
        { rows: [{ [RECORD_ID_COLUMN_KEY]: "id-3", name: "C" }], relations: [relation] },
      ]),
    );

    const sheet = (await read(result.buffer)).getWorksheet("Organizations");

    expect(sheet?.getRow(1).values).toEqual([undefined, "contactId", "organizationId", "organizationName"]);
    expect(sheet?.rowCount).toBe(3);
    expect(sheet?.getRow(3).getCell(3).value).toBe("Acme GmbH");
  });

  it("neutralizes a value that would otherwise read as a formula", async () => {
    const result = await buildWorkbook(
      setup([{ rows: [{ [RECORD_ID_COLUMN_KEY]: "id-1", name: '=HYPERLINK("http://evil.example")' }], relations: [] }]),
    );

    const sheet = (await read(result.buffer)).getWorksheet("Contacts");

    expect(sheet?.getRow(2).getCell(2).value).toBe('\'=HYPERLINK("http://evil.example")');
  });

  it("stops at the row limit and reports truncation rather than producing a partial file silently", async () => {
    const input = setup([
      {
        rows: [
          { [RECORD_ID_COLUMN_KEY]: "id-1", name: "A" },
          { [RECORD_ID_COLUMN_KEY]: "id-2", name: "B" },
        ],
        relations: [],
      },
      { rows: [{ [RECORD_ID_COLUMN_KEY]: "id-3", name: "C" }], relations: [] },
    ]);

    const result = await buildWorkbook({ ...input, rowLimit: 2 });

    expect(result.rowCount).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it("describes every column on the schema sheet so a re-import can bind by position", async () => {
    const result = await buildWorkbook(
      setup([{ rows: [{ [RECORD_ID_COLUMN_KEY]: "id-1", name: "A" }], relations: [] }]),
    );

    const sheet = (await read(result.buffer)).getWorksheet("Schema");

    expect(sheet?.getRow(1).values).toEqual([
      undefined,
      "position",
      "header",
      "key",
      "customColumnId",
      "customColumnType",
      "optionValues",
      "optionLabels",
    ]);
    expect(sheet?.getRow(4).getCell(3).value).toBe(STATUS_ID);
    expect(sheet?.getRow(4).getCell(4).value).toBe(STATUS_ID);
    expect(sheet?.getRow(4).getCell(6).value).toBe(QUALIFIED_OPTION);
  });
});
