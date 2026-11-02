import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import ExcelJS from "exceljs";
import * as XLSX from "xlsx";
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

  it.each(["contacts", "blank-rows", "multiple-sheets", "unicode"])(
    "reads prefixed %s XML with the separately packaged browser reader",
    async (scenario) => {
      const require = createRequire(import.meta.url);
      const { browser } = require("exceljs/package.json") as { browser: string };
      const BrowserExcelJS = require(`exceljs/${browser}`) as typeof ExcelJS;
      const workbook = new BrowserExcelJS.Workbook();
      await workbook.xlsx.load(fixture(`namespace-${scenario}-prefixed.xlsx`));
      expect(workbook.worksheets[0].name).toBe("Kontakte");
      expect(workbook.worksheets[0].getCell("A2").value).toBe(
        scenario === "blank-rows" ? null : scenario === "unicode" ? "李 🧑🏽‍💻" : "Jürgen",
      );
      expect(workbook.worksheets[0].getCell(scenario === "blank-rows" ? "B5" : "B2").value).toBe(
        scenario === "unicode" ? "山田 e\u0301" : scenario === "blank-rows" ? "Strauß" : "Müller",
      );
    },
  );

  it.each(["contacts", "blank-rows", "multiple-sheets", "unicode"])(
    "reads identical %s workbooks with default and prefixed XML namespaces",
    async (scenario) => {
      const read = (namespace: string) => {
        const name = `namespace-${scenario}-${namespace}.xlsx`;
        return readSpreadsheetWorkbook(name, fixture(name));
      };
      const original = await read("default");
      const prefixed = await read("prefixed");
      expect(original.ok).toBe(true);
      expect(prefixed).toEqual(original);
      if (!prefixed.ok) return;
      const [sheet] = prefixed.workbook.sheets;
      expect(sheet.name).toBe("Kontakte");
      expect(sheet.headers).toEqual(["Vorname", "Nachname", "E-Mail", "Firma"]);
      expect(sheet.rows.map((row) => row.cells.slice(0, 2))).toEqual(
        scenario === "unicode"
          ? [["李 🧑🏽‍💻", "山田 e\u0301"]]
          : [
              ["Jürgen", "Müller"],
              ["Ölaf", "Strauß"],
            ],
      );
      expect(sheet.rows.map((row) => row.sheetRow)).toEqual(
        scenario === "blank-rows" ? [3, 5] : scenario === "unicode" ? [2] : [2, 3],
      );
      if (scenario === "multiple-sheets") {
        expect(prefixed.workbook.sheets[1]).toEqual({
          name: "Types",
          headers: ["Name", "Amount", "Since", "Active", "Double"],
          rows: [
            {
              sheetRow: 2,
              cells: ["x:literal & <tag>", 12.5, new Date("2026-01-02T00:00:00Z"), true, 25],
            },
          ],
        });
      }
    },
  );

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
    "legacy-biff8.xls",
    "excel95-biff5.xls",
    "xml-2003.xls",
    "html-table.xls",
  ])("reads the German contacts of %s", async (file) => {
    const result = await readSpreadsheetWorkbook(file, fixture(file));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [sheet] = result.workbook.sheets;
    expect(sheet.headers).toEqual(["Vorname", "Nachname", "E-Mail", "Telefon", "Firma", "Notiz"]);
    expect(sheet.rows.map((row) => row.cells)).toEqual(contacts);
    expect(sheet.rows.map((row) => row.sheetRow)).toEqual([2, 3]);
  });

  it("reads a workbook saved by Excel 95", async () => {
    const result = await readSpreadsheetWorkbook("excel95-genuine.xls", fixture("excel95-genuine.xls"));
    expect(result.ok && result.workbook.sheets.map((sheet) => sheet.name)).toEqual(["Feuil1"]);
    expect(result.ok && result.workbook.sheets[0].rows[1].cells.slice(1, 3)).toEqual([1, 1]);
  });

  it("reads a workbook saved by Excel 16 for Mac", async () => {
    const result = await readSpreadsheetWorkbook("excel-mac-16.xlsx", fixture("excel-mac-16.xlsx"));
    expect(result.ok && result.workbook.sheets).toEqual([
      {
        name: "File",
        headers: ["Title", "Country", "Position"],
        rows: [
          { sheetRow: 2, cells: ["Title1", "USA", "QA"] },
          { sheetRow: 3, cells: ["Title2", "Europe", "Development"] },
        ],
      },
    ]);
  });

  it("takes a CSV file up to the row limit, with blank lines, and refuses one row more", async () => {
    const csv = (rows: number, blankLines = 0) => {
      const blanks = Array.from({ length: blankLines }, () => "");
      const values = Array.from({ length: rows }, (_, index) => `Row ${index}`);
      return new TextEncoder().encode(["Name", ...blanks, ...values].join("\n")).buffer;
    };
    const full = await readSpreadsheetWorkbook("full.csv", csv(5000, 100));
    expect(full.ok && full.workbook.sheets[0].rows.length).toBe(5000);
    expect(await readSpreadsheetWorkbook("over.csv", csv(5001))).toEqual({ ok: false, problem: "tooManyRows" });
    expect(await readSpreadsheetWorkbook("far-over.csv", csv(60000))).toEqual({ ok: false, problem: "tooManyRows" });
  });

  it("names a CSV sheet after its file and rejects an empty one", async () => {
    const csv = new TextEncoder().encode("Name;Notes\nAtlas;\n").buffer;
    const result = await readSpreadsheetWorkbook("Leads.csv", csv);
    expect(result.ok && result.workbook.sheets[0]).toMatchObject({ name: "Leads", rows: [{ cells: ["Atlas", null] }] });
    expect(await readSpreadsheetWorkbook("Leads.csv", new TextEncoder().encode("Name\n").buffer)).toEqual({
      ok: false,
      problem: "empty",
    });
  });

  it("reads every sheet of an Excel 97-2003 workbook with its dates, numbers and booleans", async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet(
        [
          ["Name", "Start", "Budget", "Active"],
          ["Atlas", new Date(Date.UTC(2026, 0, 2)), 1200.5, true],
          [],
          ["Borealis", null, 7, false],
        ],
        { cellDates: true, UTC: true },
      ),
      "Projects",
    );
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([]), "Empty");
    const bytes = XLSX.write(book, { bookType: "biff8", type: "array" }) as ArrayBuffer;
    const result = await readSpreadsheetWorkbook("projects.XLS", bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workbook.sheets.map((sheet) => sheet.name)).toEqual(["Projects"]);
    const [projects] = result.workbook.sheets;
    expect(projects.headers).toEqual(["Name", "Start", "Budget", "Active"]);
    expect(projects.rows).toEqual([
      { sheetRow: 2, cells: ["Atlas", new Date(Date.UTC(2026, 0, 2)), 1200.5, true] },
      { sheetRow: 4, cells: ["Borealis", null, 7, false] },
    ]);
    expect(await readSpreadsheetWorkbook("renamed.xlsx", fixture("legacy-biff8.xls"))).toMatchObject({ ok: true });
    const broken = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1, 2]).buffer;
    expect(await readSpreadsheetWorkbook("broken.xls", broken)).toEqual({ ok: false, problem: "unreadable" });
  });
});
