import type { SpreadsheetCell, SpreadsheetReadFailureCode, SpreadsheetTable } from "./spreadsheet.schema";

import {
  SPREADSHEET_MAX_CELL_LENGTH,
  SPREADSHEET_MAX_COLUMNS,
  SPREADSHEET_MAX_HEADER_LENGTH,
  SPREADSHEET_MAX_ROWS,
} from "./spreadsheet.schema";
import { cellIsEmpty, cellText } from "./spreadsheet-values";

export type RawSpreadsheetRow = { rowNumber: number; cells: SpreadsheetCell[] };

function normalizeCell(cell: SpreadsheetCell): SpreadsheetCell {
  if (typeof cell === "string") {
    const text = cell.trim();
    return text === "" ? null : text;
  }
  if (typeof cell === "number" && !Number.isFinite(cell)) return null;
  return cell;
}

function uniqueHeaders(cells: SpreadsheetCell[], width: number): string[] {
  const used = new Set<string>();
  return Array.from({ length: width }, (_, index) => {
    const raw = cellText(cells[index] ?? null)
      .replace(/\s+/g, " ")
      .slice(0, SPREADSHEET_MAX_HEADER_LENGTH - 8)
      .trim();
    const base = raw || `Column ${index + 1}`;
    let header = base;
    for (let suffix = 2; used.has(header.toLowerCase()); suffix += 1) header = `${base} (${suffix})`;
    used.add(header.toLowerCase());
    return header;
  });
}

export function buildSpreadsheetTable(
  sheetName: string,
  rows: RawSpreadsheetRow[],
): { ok: true; table: SpreadsheetTable } | { ok: false; code: SpreadsheetReadFailureCode } {
  const filled = rows
    .map((row) => ({ rowNumber: row.rowNumber, cells: row.cells.map(normalizeCell) }))
    .filter((row) => row.cells.some((cell) => !cellIsEmpty(cell)));
  const [header, ...data] = filled;
  if (!header) return { ok: false, code: "noHeader" };
  if (data.length > SPREADSHEET_MAX_ROWS) return { ok: false, code: "tooManyRows" };
  let width = 0;
  for (const row of filled) {
    for (let index = row.cells.length - 1; index >= width; index -= 1) {
      if (!cellIsEmpty(row.cells[index])) {
        width = index + 1;
        break;
      }
    }
    if (row.cells.some((cell) => typeof cell === "string" && cell.length > SPREADSHEET_MAX_CELL_LENGTH))
      return { ok: false, code: "cellTooLong" };
  }
  if (width > SPREADSHEET_MAX_COLUMNS) return { ok: false, code: "tooManyColumns" };
  return {
    ok: true,
    table: {
      sheetName: sheetName.slice(0, SPREADSHEET_MAX_HEADER_LENGTH),
      headers: uniqueHeaders(header.cells, width),
      rows: data.map((row) => ({
        rowNumber: row.rowNumber,
        cells: Array.from({ length: width }, (_, index) => row.cells[index] ?? null),
      })),
    },
  };
}
