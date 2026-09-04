import type { ExportColumn, SchemaSheetRow } from "./workbook-columns";
import type { WorkbookCellValue } from "./workbook-cell";

import { PassThrough } from "node:stream";

import { toWorkbookCell } from "./workbook-cell";
import { SCHEMA_SHEET_NAME } from "./data-transfer.schema";

export type WorkbookRow = Record<string, WorkbookCellValue>;

export type RelationSheet = {
  name: string;
  headers: string[];
  rows: WorkbookRow[];
};

export type WorkbookPage = {
  rows: WorkbookRow[];
  relations: RelationSheet[];
  total: number;
};

export type WorkbookBuildInput = {
  sheetName: string;
  columns: ExportColumn[];
  schemaRows: SchemaSheetRow[];
  relationSheetNames: string[];
  fetchPage: (skip: number) => Promise<WorkbookPage | null>;
  pageSize: number;
  rowLimit: number;
};

export type WorkbookBuildResult = {
  buffer: Buffer;
  rowCount: number;
  truncated: boolean;
};

const SCHEMA_HEADERS = [
  "position",
  "header",
  "key",
  "customColumnId",
  "customColumnType",
  "optionValues",
  "optionLabels",
];

function collect(stream: PassThrough): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    stream.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export async function buildWorkbook(input: WorkbookBuildInput): Promise<WorkbookBuildResult> {
  const ExcelJS = await import("exceljs");

  const stream = new PassThrough();
  const collected = collect(stream);

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true, useSharedStrings: false });

  const sheet = workbook.addWorksheet(input.sheetName);
  sheet.columns = input.columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.hidden ? 38 : 22,
    hidden: column.hidden,
    style: column.numFmt ? { numFmt: column.numFmt } : {},
  }));

  const relationSheets = new Map<string, ReturnType<typeof workbook.addWorksheet>>();
  for (const name of input.relationSheetNames) relationSheets.set(name, workbook.addWorksheet(name));

  const relationHeadersWritten = new Set<string>();

  let rowCount = 0;
  let matchingTotal = 0;

  for (let skip = 0; skip < input.rowLimit; skip += input.pageSize) {
    const page = await input.fetchPage(skip);
    if (!page || page.rows.length === 0) break;

    matchingTotal = page.total;

    let reachedLimit = false;
    for (const row of page.rows) {
      if (rowCount >= input.rowLimit) {
        reachedLimit = true;
        break;
      }

      const cells: WorkbookRow = {};
      for (const column of input.columns) cells[column.key] = toWorkbookCell(row[column.key]);
      sheet.addRow(cells).commit();
      rowCount += 1;
    }

    for (const relation of page.relations) {
      const target = relationSheets.get(relation.name);
      if (!target) continue;

      if (!relationHeadersWritten.has(relation.name)) {
        target.addRow(relation.headers).commit();
        relationHeadersWritten.add(relation.name);
      }

      for (const row of relation.rows)
        target.addRow(relation.headers.map((header) => toWorkbookCell(row[header]))).commit();
    }

    if (reachedLimit) break;
    if (page.rows.length < input.pageSize) break;
  }

  const truncated = matchingTotal > rowCount;

  const schemaSheet = workbook.addWorksheet(SCHEMA_SHEET_NAME);
  schemaSheet.addRow(SCHEMA_HEADERS).commit();
  for (const row of input.schemaRows) {
    schemaSheet
      .addRow([
        row.position,
        row.header,
        row.key,
        row.customColumnId,
        row.customColumnType,
        row.optionValues,
        row.optionLabels,
      ])
      .commit();
  }
  schemaSheet.commit();

  sheet.commit();
  for (const target of relationSheets.values()) target.commit();

  await workbook.commit();

  return { buffer: await collected, rowCount, truncated };
}
