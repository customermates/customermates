import type { Workbook } from "exceljs";

export {
  docxFixture,
  pdfFixture,
  zipArchive,
  zipFixture,
  type DocxBlock,
  type ZipArchiveEntry,
} from "../../prisma/seeds/document-builders";

type ExcelModule = { Workbook: typeof Workbook; default?: { Workbook: typeof Workbook } };

export async function xlsxFixture(sheets: Record<string, unknown[][]>): Promise<Uint8Array> {
  const exceljs = (await import("exceljs")) as unknown as ExcelModule;
  const workbook = new (exceljs.default?.Workbook ?? exceljs.Workbook)();
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = workbook.addWorksheet(name);
    for (const row of rows) sheet.addRow(row);
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
