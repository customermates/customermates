import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { readWorkbookFile } from "../import/read-workbook-file";

async function workbookFile(headerCells: Array<[number, string]>): Promise<File> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Kontakte");

  const header = sheet.getRow(1);
  for (const [column, value] of headerCells) header.getCell(column).value = value;

  const row = sheet.getRow(2);
  row.getCell(1).value = "Ada";
  row.getCell(2).value = "middle";
  row.getCell(3).value = "Lovelace";

  const buffer = await workbook.xlsx.writeBuffer();

  return new File([buffer], "book.xlsx");
}

describe("readWorkbookFile header handling", () => {
  it("keeps a column whose header cell was never written, instead of leaving a hole", async () => {
    const parsed = await readWorkbookFile(
      await workbookFile([
        [1, "Vorname"],
        [3, "Nachname"],
      ]),
    );

    expect(parsed.sources).toHaveLength(3);
    expect(parsed.sources.map((source) => source.header)).toEqual(["Vorname", "", "Nachname"]);
    expect(parsed.sources.every((source) => source !== undefined)).toBe(true);
  });

  it("collects the samples for every column, including the unnamed one", async () => {
    const parsed = await readWorkbookFile(
      await workbookFile([
        [1, "Vorname"],
        [3, "Nachname"],
      ]),
    );

    expect(parsed.sources.map((source) => source.samples)).toEqual([["Ada"], ["middle"], ["Lovelace"]]);
  });

  it("still reads a fully populated header row", async () => {
    const parsed = await readWorkbookFile(
      await workbookFile([
        [1, "Vorname"],
        [2, "Mitte"],
        [3, "Nachname"],
      ]),
    );

    expect(parsed.sources.map((source) => source.header)).toEqual(["Vorname", "Mitte", "Nachname"]);
  });
});
