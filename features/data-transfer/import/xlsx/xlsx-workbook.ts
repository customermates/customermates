import { readCsvRows } from "@/features/data-transfer/spreadsheet/spreadsheet-csv";
import { isLegacyWorkbook, isZipArchive } from "@/features/data-transfer/spreadsheet/spreadsheet-signature";

export type XlsxCell = string | number | boolean | Date | null;

export type XlsxRow = { sheetRow: number; cells: XlsxCell[] };

type XlsxSheet = { name: string; headers: string[]; rows: XlsxRow[] };

export type XlsxWorkbook = { sheets: XlsxSheet[] };

export type XlsxFileProblem = "tooLarge" | "tooManyRows" | "empty" | "unreadable";

const XLSX_MAX_FILE_BYTES = 10 * 1024 * 1024;

const XLSX_MAX_ROWS = 5_000;

const XLSX_MAX_COLUMNS = 200;

type RichTextRun = { text?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function plainCellText(value: string): string {
  return value.startsWith("'=") ? value.slice(1) : value;
}

export function xlsxCellValue(raw: unknown): XlsxCell {
  if (raw === undefined || raw === null) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") return plainCellText(raw);
  if (!isRecord(raw) || "error" in raw) return null;
  if ("result" in raw) return xlsxCellValue(raw.result);
  if ("text" in raw && "hyperlink" in raw) return xlsxCellValue(raw.text);
  if ("richText" in raw && Array.isArray(raw.richText)) {
    return plainCellText(
      (raw.richText as RichTextRun[]).map((run) => (typeof run?.text === "string" ? run.text : "")).join(""),
    );
  }
  return null;
}

export function xlsxCellText(cell: XlsxCell): string {
  if (cell === null) return "";
  if (cell instanceof Date) return cell.toISOString();
  return String(cell).trim();
}

export function isSpreadsheetFileName(name: string): boolean {
  return /\.(xlsx|xls|csv)$/i.test(name.trim());
}

type ReadableSheet = {
  name: string;
  rowCount: number;
  getRow: (index: number) => { values: unknown };
};

function rowValues(sheet: ReadableSheet, index: number): unknown[] {
  const values = sheet.getRow(index).values;
  return Array.isArray(values) ? values.slice(1, XLSX_MAX_COLUMNS + 1) : [];
}

function readSheet(sheet: ReadableSheet): XlsxSheet {
  const headerCells = rowValues(sheet, 1).map(xlsxCellValue);
  const rows: XlsxRow[] = [];
  let width = headerCells.length;
  for (let index = 2; index <= sheet.rowCount; index += 1) {
    const cells = rowValues(sheet, index).map(xlsxCellValue);
    if (cells.every((cell) => cell === null || xlsxCellText(cell) === "")) continue;
    if (rows.length >= XLSX_MAX_ROWS) throw new Error("tooManyRows");
    width = Math.max(width, cells.length);
    rows.push({ sheetRow: index, cells });
  }
  const headers = Array.from({ length: width }, (_, index) => xlsxCellText(headerCells[index] ?? null));
  return {
    name: sheet.name,
    headers,
    rows: rows.map((row) => ({
      sheetRow: row.sheetRow,
      cells: Array.from({ length: width }, (_, index) => row.cells[index] ?? null),
    })),
  };
}

type WorkbookResult = { ok: true; workbook: XlsxWorkbook } | { ok: false; problem: XlsxFileProblem };

function collectSheets(readable: ReadableSheet[]): WorkbookResult {
  const sheets: XlsxSheet[] = [];
  for (const sheet of readable) {
    try {
      const read = readSheet(sheet);
      if (read.headers.some(Boolean) && read.rows.length > 0) sheets.push(read);
    } catch {
      return { ok: false, problem: "tooManyRows" };
    }
  }
  return sheets.length ? { ok: true, workbook: { sheets } } : { ok: false, problem: "empty" };
}

function rowsSheet(name: string, rows: unknown[][]): ReadableSheet {
  return { name, rowCount: rows.length, getRow: (index) => ({ values: [undefined, ...(rows[index - 1] ?? [])] }) };
}

function readCsvWorkbook(bytes: Uint8Array, name: string): WorkbookResult {
  const csv = readCsvRows(bytes, XLSX_MAX_ROWS + 1);
  if (!csv) return { ok: false, problem: "unreadable" };
  const rows = csv.rows.map((row) => row.cells.map((cell) => cell || null));
  return collectSheets([rowsSheet(name.trim().replace(/\.[^.]+$/, "") || "Sheet", rows)]);
}

async function readLegacyWorkbook(bytes: Uint8Array): Promise<WorkbookResult> {
  const XLSX = await import("xlsx");
  const book = (() => {
    try {
      return XLSX.read(bytes, { type: "array", cellDates: true, dense: true });
    } catch {
      return null;
    }
  })();
  if (!book) return { ok: false, problem: "unreadable" };
  return collectSheets(
    book.SheetNames.map((name) =>
      rowsSheet(
        name,
        XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], {
          header: 1,
          raw: true,
          defval: null,
          blankrows: true,
          UTC: true,
        }),
      ),
    ),
  );
}

export async function readSpreadsheetWorkbook(name: string, buffer: ArrayBuffer): Promise<WorkbookResult> {
  if (buffer.byteLength > XLSX_MAX_FILE_BYTES) return { ok: false, problem: "tooLarge" };
  const bytes = new Uint8Array(buffer);
  if (isZipArchive(bytes)) return readXlsxWorkbook(buffer);
  if (isLegacyWorkbook(bytes) || /\.xls$/i.test(name.trim())) return readLegacyWorkbook(bytes);
  return readCsvWorkbook(bytes, name);
}

export async function readXlsxWorkbook(buffer: ArrayBuffer): Promise<WorkbookResult> {
  if (buffer.byteLength > XLSX_MAX_FILE_BYTES) return { ok: false, problem: "tooLarge" };
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch {
    return { ok: false, problem: "unreadable" };
  }
  return collectSheets(workbook.worksheets);
}
