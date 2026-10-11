import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { readSpreadsheet } from "../read-spreadsheet";
import {
  SPREADSHEET_MAX_CELL_LENGTH,
  SPREADSHEET_MAX_COLUMNS,
  SPREADSHEET_MAX_FILE_BYTES,
  SPREADSHEET_MAX_ROWS,
} from "../spreadsheet.schema";

const utf8 = (text: string) => new TextEncoder().encode(text);

function windows1252(text: string): Uint8Array {
  const special: Record<string, number> = { "€": 0x80, "„": 0x84, "“": 0x93 };
  return Uint8Array.from([...text].map((character) => special[character] ?? character.charCodeAt(0)));
}

function utf16le(text: string): Uint8Array {
  const bytes = new Uint8Array(2 + text.length * 2);
  bytes.set([0xff, 0xfe]);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    bytes[2 + index * 2] = code & 0xff;
    bytes[3 + index * 2] = code >> 8;
  }
  return bytes;
}

function storedZip(entries: Array<{ name: string; data: Uint8Array; claimedSize?: number }>): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = utf8(entry.name);
    const local = new Uint8Array(30 + name.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint32(18, entry.data.length, true);
    view.setUint32(22, entry.claimedSize ?? entry.data.length, true);
    view.setUint16(26, name.length, true);
    local.set(name, 30);
    const header = new Uint8Array(46 + name.length);
    const headerView = new DataView(header.buffer);
    headerView.setUint32(0, 0x02014b50, true);
    headerView.setUint32(20, entry.data.length, true);
    headerView.setUint32(24, entry.claimedSize ?? entry.data.length, true);
    headerView.setUint16(28, name.length, true);
    headerView.setUint32(42, offset, true);
    header.set(name, 46);
    chunks.push(local, entry.data);
    central.push(header);
    offset += local.length + entry.data.length;
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  const all = [...chunks, ...central, end];
  const bytes = new Uint8Array(all.reduce((sum, item) => sum + item.length, 0));
  let position = 0;
  for (const item of all) {
    bytes.set(item, position);
    position += item.length;
  }
  return bytes;
}

async function workbookBytes(build: (workbook: ExcelJS.Workbook) => void): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  build(workbook);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

async function readOk(bytes: Uint8Array, options?: { fileName?: string; sheetName?: string }) {
  const result = await readSpreadsheet(bytes, options);
  if (!result.ok) throw new Error(`Unexpected failure ${result.code}`);
  return result;
}

describe("readSpreadsheet CSV", () => {
  it("reads a comma separated UTF-8 file with quoted delimiters, quotes and line breaks", async () => {
    const result = await readOk(
      utf8('Name,Notes,Amount\r\n"Müller, Anna","She said ""hi""\nthen left",12\r\nBob,,3\r\n'),
      { fileName: "contacts.csv" },
    );
    expect(result.format).toBe("csv");
    expect(result.table).toEqual({
      sheetName: "contacts",
      headers: ["Name", "Notes", "Amount"],
      rows: [
        { rowNumber: 2, cells: ["Müller, Anna", 'She said "hi"\nthen left', "12"] },
        { rowNumber: 3, cells: ["Bob", null, "3"] },
      ],
    });
  });

  it("sniffs semicolons behind a UTF-8 byte order mark", async () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...utf8("Firma;Umsatz\nÄpfel GmbH;1.234,56\n")]);
    const { table } = await readOk(bytes);
    expect(table.headers).toEqual(["Firma", "Umsatz"]);
    expect(table.rows[0].cells).toEqual(["Äpfel GmbH", "1.234,56"]);
  });

  it("falls back to Windows-1252 when the bytes are not valid UTF-8", async () => {
    const { table } = await readOk(windows1252("Name;Preis\nGrüße „Test“;5 €\n"));
    expect(table.rows[0].cells).toEqual(["Grüße „Test“", "5 €"]);
  });

  it("reads tab separated UTF-16 exports and honours a sep directive", async () => {
    expect((await readOk(utf16le("A\tB\n1\t2\n"))).table.rows[0].cells).toEqual(["1", "2"]);
    const directed = await readOk(utf8("sep=|\nA|B\nx,y|z\n"));
    expect(directed.table.headers).toEqual(["A", "B"]);
    expect(directed.table.rows).toEqual([{ rowNumber: 3, cells: ["x,y", "z"] }]);
  });

  it("deduplicates and fills headers, skips empty rows and keeps source row numbers", async () => {
    const { table } = await readOk(utf8("Name;name;;Email\n\nAda;A;x;ada@example.com\n;;;\nBob;;;\n"));
    expect(table.headers).toEqual(["Name", "name (2)", "Column 3", "Email"]);
    expect(table.rows.map((row) => row.rowNumber)).toEqual([3, 5]);
    expect(table.rows[1].cells).toEqual(["Bob", null, null, null]);
  });

  it("keeps formula-looking text as inert data", async () => {
    const { table } = await readOk(utf8('Name,Formula\nEve,"=HYPERLINK(""http://evil"")"\n'));
    expect(table.rows[0].cells[1]).toBe('=HYPERLINK("http://evil")');
  });

  it("enforces size, row, column and cell limits", async () => {
    expect(await readSpreadsheet(new Uint8Array(SPREADSHEET_MAX_FILE_BYTES + 1))).toEqual({
      ok: false,
      code: "fileTooLarge",
    });
    const wide = Array.from({ length: SPREADSHEET_MAX_COLUMNS + 1 }, (_, index) => `C${index}`).join(",");
    expect(await readSpreadsheet(utf8(`${wide}\n`))).toEqual({ ok: false, code: "tooManyColumns" });
    const rows = Array.from({ length: SPREADSHEET_MAX_ROWS + 1 }, (_, index) => `r${index}`).join("\n");
    expect(await readSpreadsheet(utf8(`Name\n${rows}\n`))).toEqual({ ok: false, code: "tooManyRows" });
    expect(await readSpreadsheet(utf8(`Name\n${"x".repeat(SPREADSHEET_MAX_CELL_LENGTH + 1)}\n`))).toEqual({
      ok: false,
      code: "cellTooLong",
    });
    expect(await readSpreadsheet(utf8("\n\n"))).toEqual({ ok: false, code: "noHeader" });
    expect(await readSpreadsheet(new Uint8Array([0x00, 0x01, 0x02, 0x00]))).toEqual({
      ok: false,
      code: "unsupportedFormat",
    });
  });
});

describe("readSpreadsheet XLSX", () => {
  it("reads typed cells and uses cached formula results only", async () => {
    const bytes = await workbookBytes((workbook) => {
      const sheet = workbook.addWorksheet("Contacts");
      sheet.addRow(["Name", "Amount", "Since", "Seen", "Active", "Double", "Site"]);
      sheet.addRow([
        { richText: [{ text: "Ada " }, { text: "Lovelace" }] },
        1234.5,
        new Date(Date.UTC(2026, 11, 31)),
        new Date(Date.UTC(2026, 6, 1, 14, 30)),
        true,
        { formula: "B2*2", result: 2469 },
        { text: "Site", hyperlink: "https://example.com" },
      ]);
      sheet.addRow(["Bob", null, null, null, false, { formula: "B3*2" }, null]);
    });
    const result = await readOk(bytes, { fileName: "export.xlsx" });
    expect(result.format).toBe("xlsx");
    expect(result.formulaCellsWithoutValue).toBe(1);
    expect(result.table.rows).toEqual([
      { rowNumber: 2, cells: ["Ada Lovelace", 1234.5, "2026-12-31", "2026-07-01T14:30:00", true, 2469, "Site"] },
      { rowNumber: 3, cells: ["Bob", null, null, null, false, null, null] },
    ]);
  });

  it("selects the first visible sheet or a named one", async () => {
    const bytes = await workbookBytes((workbook) => {
      workbook.addWorksheet("Hidden", { state: "hidden" }).addRow(["Secret"]);
      workbook.addWorksheet("Deals").addRow(["Deal"]);
      workbook.addWorksheet("Orgs").addRow(["Organization"]);
    });
    const first = await readOk(bytes);
    expect(first.sheetNames).toEqual(["Hidden", "Deals", "Orgs"]);
    expect(first.table.headers).toEqual(["Deal"]);
    expect((await readOk(bytes, { sheetName: "Orgs" })).table.headers).toEqual(["Organization"]);
    expect(await readSpreadsheet(bytes, { sheetName: "Missing" })).toEqual({ ok: false, code: "sheetNotFound" });
  });

  it("rejects macro workbooks, legacy formats, zip bombs and broken archives", async () => {
    const macro = storedZip([
      { name: "[Content_Types].xml", data: utf8("<Types/>") },
      { name: "xl/vbaProject.bin", data: utf8("macro") },
    ]);
    expect(await readSpreadsheet(macro)).toEqual({ ok: false, code: "macroWorkbook" });
    expect(await readSpreadsheet(utf8("Name\nx\n"), { fileName: "book.xlsm" })).toEqual({
      ok: false,
      code: "macroWorkbook",
    });
    expect(await readSpreadsheet(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]))).toEqual({
      ok: false,
      code: "unsupportedFormat",
    });
    const bomb = storedZip([{ name: "xl/worksheets/sheet1.xml", data: utf8("<x/>"), claimedSize: 60 * 1024 * 1024 }]);
    expect(await readSpreadsheet(bomb)).toEqual({ ok: false, code: "fileTooLarge" });
    expect(await readSpreadsheet(storedZip([{ name: "word/document.xml", data: utf8("<x/>") }]))).toEqual({
      ok: false,
      code: "unsupportedFormat",
    });
    expect(await readSpreadsheet(storedZip([{ name: "xl/workbook.xml", data: utf8("<broken") }]))).toEqual({
      ok: false,
      code: "unreadableFile",
    });
    expect(await readSpreadsheet(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]))).toEqual({
      ok: false,
      code: "unreadableFile",
    });
  });

  it("enforces the column limit on worksheets", async () => {
    const bytes = await workbookBytes((workbook) => {
      workbook
        .addWorksheet("Wide")
        .addRow(Array.from({ length: SPREADSHEET_MAX_COLUMNS + 1 }, (_, index) => `C${index}`));
    });
    expect(await readSpreadsheet(bytes)).toEqual({ ok: false, code: "tooManyColumns" });
  });
});
