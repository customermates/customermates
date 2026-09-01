"use client";

import type { SchemaSheetRow } from "../workbook-columns";
import type { SourceColumn } from "./import-mapping";
import type { SourceRow } from "./import-plan";

import { IMPORT_ROW_LIMIT } from "../data-transfer.schema";
import { columnLetter } from "./import-mapping";
import { fromWorkbookCell } from "../workbook-cell";

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

export const MAX_IMPORT_SHEETS = 12;

export const SCHEMA_SHEET_NAME = "Schema";

export type RelationSheetRows = Record<string, Array<Record<string, string>>>;

export type ParsedWorkbook = {
  sheetName: string;
  sources: SourceColumn[];
  rows: SourceRow[];
  schemaRows: SchemaSheetRow[];
  relationSheets: RelationSheetRows;
};

export class ImportFileError extends Error {
  constructor(readonly reason: "tooLarge" | "tooManySheets" | "tooManyRows" | "empty" | "unreadable") {
    super(reason);
    this.name = "ImportFileError";
  }
}

function readSchemaSheet(sheet: { rowCount: number; getRow: (n: number) => { values: unknown } }): SchemaSheetRow[] {
  const rows: SchemaSheetRow[] = [];

  for (let index = 2; index <= sheet.rowCount; index += 1) {
    const values = sheet.getRow(index).values as unknown[];
    const cells = values.slice(1).map((value) => fromWorkbookCell(value));
    const position = Number(cells[0]);

    if (!Number.isFinite(position)) continue;

    rows.push({
      position,
      header: String(cells[1] ?? ""),
      key: String(cells[2] ?? ""),
      customColumnId: String(cells[3] ?? ""),
      customColumnType: String(cells[4] ?? ""),
      optionValues: String(cells[5] ?? ""),
      optionLabels: String(cells[6] ?? ""),
    });
  }

  return rows;
}

type ReadableSheet = { name: string; rowCount: number; getRow: (n: number) => { values: unknown } };

function readNamedRows(sheet: ReadableSheet): Array<Record<string, string>> {
  const headers = (sheet.getRow(1).values as unknown[]).slice(1).map((value) => String(fromWorkbookCell(value) ?? ""));
  const rows: Array<Record<string, string>> = [];

  for (let index = 2; index <= sheet.rowCount; index += 1) {
    const values = (sheet.getRow(index).values as unknown[]).slice(1);
    const row: Record<string, string> = {};

    headers.forEach((header, column) => {
      if (header) row[header] = String(fromWorkbookCell(values[column]) ?? "");
    });

    if (Object.values(row).some((value) => value.length > 0)) rows.push(row);
  }

  return rows;
}

export async function readWorkbookFile(file: File): Promise<ParsedWorkbook> {
  if (file.size > MAX_IMPORT_FILE_BYTES) throw new ImportFileError("tooLarge");

  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    throw new ImportFileError("unreadable");
  }

  if (workbook.worksheets.length > MAX_IMPORT_SHEETS) throw new ImportFileError("tooManySheets");

  const dataSheet = workbook.worksheets.find((sheet) => sheet.name !== SCHEMA_SHEET_NAME);
  if (!dataSheet || dataSheet.rowCount < 2) throw new ImportFileError("empty");
  if (dataSheet.rowCount - 1 > IMPORT_ROW_LIMIT) throw new ImportFileError("tooManyRows");

  const headerValues = (dataSheet.getRow(1).values as unknown[]).slice(1);
  const sources: SourceColumn[] = [];

  for (let index = 0; index < headerValues.length; index += 1) {
    sources.push({
      index,
      letter: columnLetter(index),
      header: String(fromWorkbookCell(headerValues[index]) ?? ""),
      samples: [],
    });
  }

  const rows: SourceRow[] = [];

  for (let index = 2; index <= dataSheet.rowCount; index += 1) {
    const values = (dataSheet.getRow(index).values as unknown[]).slice(1);
    const cells = sources.map((_, column) => fromWorkbookCell(values[column]));

    if (cells.every((cell) => cell === null || cell === "")) continue;

    rows.push({ sourceIndex: rows.length, sheetRow: index, cells });
  }

  for (const source of sources) {
    source.samples = rows
      .slice(0, 20)
      .map((row) => row.cells[source.index])
      .filter((cell): cell is string => typeof cell === "string" && cell.length > 0)
      .slice(0, 3);
  }

  const schemaSheet = workbook.getWorksheet(SCHEMA_SHEET_NAME);

  const relationSheets: RelationSheetRows = {};
  for (const sheet of workbook.worksheets) {
    if (sheet.name === dataSheet.name || sheet.name === SCHEMA_SHEET_NAME) continue;

    relationSheets[sheet.name] = readNamedRows(sheet);
  }

  return {
    sheetName: dataSheet.name,
    sources,
    rows,
    schemaRows: schemaSheet ? readSchemaSheet(schemaSheet) : [],
    relationSheets,
  };
}
