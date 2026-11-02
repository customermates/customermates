import type { SpreadsheetCell } from "./spreadsheet.schema";
import type { RawSpreadsheetRow } from "./spreadsheet-table";

import { SPREADSHEET_MAX_COLUMNS, SPREADSHEET_MAX_ROWS, SPREADSHEET_MAX_SHEETS } from "./spreadsheet.schema";
import { readXlsBook } from "./spreadsheet-xls-book";
import { dateCell } from "./spreadsheet-xlsx";

function xlsCell(value: unknown): SpreadsheetCell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return dateCell(value);
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  return null;
}

export function readXlsRows(
  bytes: Uint8Array,
  sheetName?: string,
):
  | {
      ok: true;
      sheetName: string;
      sheetNames: string[];
      rows: RawSpreadsheetRow[];
      truncated: boolean;
      tooWide: boolean;
    }
  | { ok: false; code: "unreadableFile" | "sheetNotFound" } {
  const book = readXlsBook(bytes);
  if (!book) return { ok: false, code: "unreadableFile" };
  const name = sheetName
    ? book.sheetNames.find((candidate) => candidate === sheetName)
    : (book.sheetNames.find((candidate) => !book.hidden(candidate)) ?? book.sheetNames[0]);
  if (!name) return { ok: false, code: sheetName ? "sheetNotFound" : "unreadableFile" };
  const rows: RawSpreadsheetRow[] = [];
  let truncated = false;
  let tooWide = false;
  for (const [index, row] of book.rows(name).entries()) {
    if (row.every((value) => value === null || value === "")) continue;
    if (rows.length > SPREADSHEET_MAX_ROWS + 1) {
      truncated = true;
      break;
    }
    if (row.findLastIndex((value) => value !== null && value !== "") >= SPREADSHEET_MAX_COLUMNS) tooWide = true;
    rows.push({ rowNumber: index + 1, cells: row.slice(0, SPREADSHEET_MAX_COLUMNS + 1).map(xlsCell) });
  }
  return {
    ok: true,
    sheetName: name,
    sheetNames: book.sheetNames.slice(0, SPREADSHEET_MAX_SHEETS),
    rows,
    truncated,
    tooWide,
  };
}
