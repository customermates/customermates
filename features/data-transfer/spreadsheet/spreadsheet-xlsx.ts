import ExcelJS from "exceljs";

import type { SpreadsheetCell } from "./spreadsheet.schema";
import type { RawSpreadsheetRow } from "./spreadsheet-table";

import { zipEntries } from "@/core/utils/zip";

import { SPREADSHEET_MAX_COLUMNS, SPREADSHEET_MAX_ROWS, SPREADSHEET_MAX_SHEETS } from "./spreadsheet.schema";

type ZipInventory = { entries: string[]; unpackedBytes: number };

export function isZipArchive(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export function isLegacyWorkbook(bytes: Uint8Array): boolean {
  return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}

export function inspectZip(bytes: Uint8Array): ZipInventory | null {
  const entries = zipEntries(bytes);
  return entries
    ? {
        entries: entries.map((entry) => entry.name),
        unpackedBytes: entries.reduce((sum, entry) => sum + entry.size, 0),
      }
    : null;
}

export function hasMacros(inventory: ZipInventory): boolean {
  return inventory.entries.some((name) => /(^|\/)vbaProject\.bin$/i.test(name) || /(^|\/)vbaData\.xml$/i.test(name));
}

function dateCell(value: Date): SpreadsheetCell {
  const time = value.getTime();
  if (Number.isNaN(time)) return null;
  const iso = value.toISOString();
  if (iso.endsWith("T00:00:00.000Z")) return iso.slice(0, 10);
  return iso.replace(/\.000Z$/, "").replace(/Z$/, "");
}

function xlsxCellValue(value: ExcelJS.CellValue): { cell: SpreadsheetCell; formulaWithoutValue: boolean } {
  if (value === null || value === undefined) return { cell: null, formulaWithoutValue: false };
  if (typeof value === "number") return { cell: Number.isFinite(value) ? value : null, formulaWithoutValue: false };
  if (typeof value === "string" || typeof value === "boolean") return { cell: value, formulaWithoutValue: false };
  if (value instanceof Date) return { cell: dateCell(value), formulaWithoutValue: false };
  if ("error" in value) return { cell: null, formulaWithoutValue: false };
  if ("formula" in value || "sharedFormula" in value) {
    const result = (value as { result?: ExcelJS.CellValue }).result;
    if (result === undefined || result === null) return { cell: null, formulaWithoutValue: true };
    if (typeof result === "object" && !(result instanceof Date) && ("formula" in result || "sharedFormula" in result))
      return { cell: null, formulaWithoutValue: true };
    return xlsxCellValue(result);
  }
  if ("richText" in value)
    return { cell: value.richText.map((part) => part.text).join(""), formulaWithoutValue: false };
  if ("text" in value) {
    const text = value.text as unknown;
    if (typeof text === "string") return { cell: text, formulaWithoutValue: false };
    if (text && typeof text === "object" && "richText" in text) return xlsxCellValue(text as ExcelJS.CellRichTextValue);
    return { cell: null, formulaWithoutValue: false };
  }
  return { cell: null, formulaWithoutValue: false };
}

export async function readXlsxRows(
  bytes: Uint8Array,
  sheetName?: string,
): Promise<
  | {
      ok: true;
      sheetName: string;
      sheetNames: string[];
      rows: RawSpreadsheetRow[];
      formulaCellsWithoutValue: number;
      truncated: boolean;
      tooWide: boolean;
    }
  | { ok: false; code: "unreadableFile" | "sheetNotFound" }
> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) as unknown as ArrayBuffer);
  } catch {
    return { ok: false, code: "unreadableFile" };
  }
  const sheets = workbook.worksheets;
  const sheetNames = sheets.slice(0, SPREADSHEET_MAX_SHEETS).map((sheet) => sheet.name);
  const sheet = sheetName
    ? sheets.find((candidate) => candidate.name === sheetName)
    : (sheets.find((candidate) => candidate.state === "visible") ?? sheets[0]);
  if (!sheet) return { ok: false, code: sheetName ? "sheetNotFound" : "unreadableFile" };
  const rows: RawSpreadsheetRow[] = [];
  let formulaCellsWithoutValue = 0;
  let truncated = false;
  let tooWide = false;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (truncated) return;
    if (rows.length > SPREADSHEET_MAX_ROWS + 1) {
      truncated = true;
      return;
    }
    const values = Array.isArray(row.values) ? row.values.slice(1) : [];
    if (values.length > SPREADSHEET_MAX_COLUMNS) {
      const lastFilled = values.findLastIndex((value) => value !== null && value !== undefined);
      if (lastFilled >= SPREADSHEET_MAX_COLUMNS) tooWide = true;
    }
    const cells = values.slice(0, SPREADSHEET_MAX_COLUMNS + 1).map((value) => {
      const converted = xlsxCellValue(value);
      if (converted.formulaWithoutValue) formulaCellsWithoutValue += 1;
      return converted.cell;
    });
    rows.push({ rowNumber, cells });
  });
  return { ok: true, sheetName: sheet.name, sheetNames, rows, formulaCellsWithoutValue, truncated, tooWide };
}
