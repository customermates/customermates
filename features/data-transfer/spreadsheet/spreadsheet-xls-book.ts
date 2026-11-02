import * as XLSX from "xlsx";

import { isLegacyWorkbook } from "./spreadsheet-signature";

export type XlsBook = { sheetNames: string[]; hidden: (name: string) => boolean; rows: (name: string) => unknown[][] };

export function readXlsBook(bytes: Uint8Array): XlsBook | null {
  let book: XLSX.WorkBook;
  try {
    if (isLegacyWorkbook(bytes)) XLSX.CFB.read(bytes, { type: "array" });
    book = XLSX.read(bytes, { type: "array", cellDates: true, dense: true });
  } catch {
    return null;
  }
  return {
    sheetNames: book.SheetNames,
    hidden: (name) => Boolean(book.Workbook?.Sheets?.[book.SheetNames.indexOf(name)]?.Hidden),
    rows: (name) => {
      const sheet = book.Sheets[name];
      if (!sheet) return [];
      const firstRow = sheet["!ref"] ? XLSX.utils.decode_range(sheet["!ref"]).s.r : 0;
      const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: true,
        defval: null,
        blankrows: true,
        UTC: true,
      });
      return [...Array.from({ length: firstRow }, () => []), ...rows];
    },
  };
}
