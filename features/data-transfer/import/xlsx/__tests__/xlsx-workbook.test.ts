import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { isXlsxFileName, readXlsxWorkbook, xlsxCellValue } from "../xlsx-workbook";

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
    expect(isXlsxFileName("Leads.XLSX")).toBe(true);
    expect(isXlsxFileName("leads.json")).toBe(false);
    expect(xlsxCellValue({ error: "#REF!" })).toBeNull();
  });
});
