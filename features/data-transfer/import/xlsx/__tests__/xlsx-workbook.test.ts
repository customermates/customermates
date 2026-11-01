import { readFileSync } from "node:fs";

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { isSpreadsheetFileName, readSpreadsheetWorkbook, readXlsxWorkbook, xlsxCellValue } from "../xlsx-workbook";

async function buffer(build: (workbook: ExcelJS.Workbook) => void): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  const written = await workbook.xlsx.writeBuffer();
  return new Uint8Array(written as ArrayBuffer).slice().buffer;
}

describe("xlsx workbook reading", () => {
  it("reads every sheet with a header row and skips empty rows", async () => {
    const result = await readXlsxWorkbook(
      await buffer((workbook) => {
        const projects = workbook.addWorksheet("Projects");
        projects.addRow(["Name", "Start", "Budget", "Link", "Total"]);
        projects.addRow([
          { richText: [{ text: "At" }, { text: "las" }] },
          new Date(Date.UTC(2026, 0, 2)),
          1200.5,
          { text: "Site", hyperlink: "https://example.test" },
          { formula: "C2*2", result: 2401 },
        ]);
        projects.addRow([]);
        projects.addRow(["'=SUM(1)"]);
        workbook.addWorksheet("Empty");
        const other = workbook.addWorksheet("Other");
        other.addRow(["Only"]);
        other.addRow(["value"]);
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workbook.sheets.map((sheet) => sheet.name)).toEqual(["Projects", "Other"]);
    const [projects] = result.workbook.sheets;
    expect(projects.headers).toEqual(["Name", "Start", "Budget", "Link", "Total"]);
    expect(projects.rows.map((row) => row.sheetRow)).toEqual([2, 4]);
    expect(projects.rows[0].cells).toEqual(["Atlas", new Date(Date.UTC(2026, 0, 2)), 1200.5, "Site", 2401]);
    expect(projects.rows[1].cells).toEqual(["=SUM(1)", null, null, null, null]);
  });

  it("rejects unreadable and empty workbooks", async () => {
    expect(await readXlsxWorkbook(new TextEncoder().encode("not a zip").buffer)).toEqual({
      ok: false,
      problem: "unreadable",
    });
    expect(await readXlsxWorkbook(await buffer((workbook) => workbook.addWorksheet("Blank")))).toEqual({
      ok: false,
      problem: "empty",
    });
  });

  it("recognizes workbook file names and cell error values", () => {
    expect(isSpreadsheetFileName("Leads.XLSX")).toBe(true);
    expect(isSpreadsheetFileName("Kontakte.csv")).toBe(true);
    expect(isSpreadsheetFileName("Kontakte.xls")).toBe(true);
    expect(isSpreadsheetFileName("leads.json")).toBe(false);
    expect(xlsxCellValue({ error: "#REF!" })).toBeNull();
  });

  const fixture = (file: string) => new Uint8Array(readFileSync(`tests/fixtures/spreadsheet-import/${file}`)).buffer;
  const contacts = [
    ["Jürgen", "Müller", "juergen.mueller@example.test", "+49 170 1111111", "Bäckerei Größl", "Grüße aus Köln"],
    ["Ölaf", "Strauß", "oelaf@example.test", "+49 170 2222222", "Äpfel & Söhne", "Straße 5, München"],
  ];

  it.each([
    "comma-utf8.csv",
    "comma-utf8-bom.csv",
    "comma-utf8-lf.csv",
    "semicolon-utf8.csv",
    "semicolon-utf8-bom.csv",
    "semicolon-macroman.csv",
    "semicolon-cp1252.csv",
    "libreoffice.xlsx",
  ])("reads the German contacts of %s", async (file) => {
    const result = await readSpreadsheetWorkbook(file, fixture(file));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [sheet] = result.workbook.sheets;
    expect(sheet.headers).toEqual(["Vorname", "Nachname", "E-Mail", "Telefon", "Firma", "Notiz"]);
    expect(sheet.rows.map((row) => row.cells)).toEqual(contacts);
    expect(sheet.rows.map((row) => row.sheetRow)).toEqual([2, 3]);
  });

  it("names a CSV sheet after its file and rejects empty or legacy files", async () => {
    const csv = new TextEncoder().encode("Name;Notes\nAtlas;\n").buffer;
    const result = await readSpreadsheetWorkbook("Leads.csv", csv);
    expect(result.ok && result.workbook.sheets[0]).toMatchObject({ name: "Leads", rows: [{ cells: ["Atlas", null] }] });
    expect(await readSpreadsheetWorkbook("Leads.csv", new TextEncoder().encode("Name\n").buffer)).toEqual({
      ok: false,
      problem: "empty",
    });
    expect(await readSpreadsheetWorkbook("contacts.xls", fixture("legacy-biff8.xls"))).toEqual({
      ok: false,
      problem: "legacyWorkbook",
    });
    expect(await readSpreadsheetWorkbook("renamed.xlsx", fixture("legacy-biff8.xls"))).toEqual({
      ok: false,
      problem: "legacyWorkbook",
    });
  });
});
