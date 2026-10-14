import { describe, expect, it } from "vitest";

import type { SpreadsheetTable } from "../spreadsheet.schema";

import { profileSpreadsheet, spreadsheetPreview } from "../spreadsheet-profile";

const table: SpreadsheetTable = {
  sheetName: "Export",
  headers: ["Name", "Umsatz", "Betrag", "Gegründet", "Termin", "Aktiv", "Status", "E-Mail", "Telefon", "Web", "Leer"],
  rows: [
    [
      "Alpha GmbH",
      "1.234,56",
      "1.000 €",
      "31.12.2026",
      "31.12.2026 14:30",
      "ja",
      "Lead",
      "a@alpha.de; b@alpha.de",
      "+49 30 1234567",
      "alpha.de",
      null,
    ],
    [
      "Beta AG",
      "99,5",
      "EUR 20",
      "01.01.2025",
      "01.01.2025 08:00",
      "nein",
      "Kunde",
      "info@beta.de",
      "030 7654321",
      "https://beta.de",
      null,
    ],
    [
      "Gamma KG",
      "7",
      "5,50 €",
      "15.06.2024",
      "15.06.2024 09:15",
      "ja",
      "Lead",
      "hello@gamma.de",
      "+49 40 111222",
      "www.gamma.de",
      null,
    ],
    ["Delta", "12.000", "3 €", "02.02.2023", null, "nein", "Lead", "x@delta.de", "+49 89 999888", "delta.io", null],
  ].map((cells, index) => ({ rowNumber: index + 2, cells })),
};

describe("profileSpreadsheet", () => {
  it("infers record value types, fill rates and distinct values deterministically", () => {
    const profiles = profileSpreadsheet(table, "de");
    expect(Object.fromEntries(profiles.map((profile) => [profile.column, profile.inferredType]))).toEqual({
      Name: "text",
      Umsatz: "number",
      Betrag: "currency",
      Gegründet: "date",
      Termin: "dateTime",
      Aktiv: "boolean",
      Status: "select",
      "E-Mail": "email",
      Telefon: "phone",
      Web: "url",
      Leer: null,
    });
    const byColumn = new Map(profiles.map((profile) => [profile.column, profile]));
    expect(byColumn.get("Termin")).toMatchObject({ filled: 3, fillRate: 0.75, dateOrder: "dmy" });
    expect(byColumn.get("Betrag")?.currencies).toEqual(["EUR"]);
    expect(byColumn.get("Status")?.distinctValues).toEqual([
      { value: "Lead", count: 3 },
      { value: "Kunde", count: 1 },
    ]);
    expect(byColumn.get("E-Mail")?.multipleValues).toBe(true);
    expect(byColumn.get("Leer")).toMatchObject({ filled: 0, fillRate: 0, distinctCount: 0 });
    expect(profileSpreadsheet(table, "de")).toEqual(profiles);
  });

  it("reads the same digits differently per locale", () => {
    const amounts: SpreadsheetTable = {
      sheetName: "S",
      headers: ["Amount", "Date"],
      rows: [
        { rowNumber: 2, cells: ["1,234.50", "12/31/2026"] },
        { rowNumber: 3, cells: ["2,000.00", "1/2/2026"] },
      ],
    };
    const english = profileSpreadsheet(amounts, "en");
    expect(english.map((profile) => profile.inferredType)).toEqual(["number", "date"]);
    expect(english[1].dateOrder).toBe("mdy");
    expect(profileSpreadsheet(amounts, "de")[0].inferredType).toBe("text");
  });
});

describe("spreadsheetPreview", () => {
  it("bounds the sample a model sees", () => {
    const long: SpreadsheetTable = {
      sheetName: "S",
      headers: ["Notes"],
      rows: Array.from({ length: 30 }, (_, index) => ({ rowNumber: index + 2, cells: ["x".repeat(500)] })),
    };
    const preview = spreadsheetPreview(long);
    expect(preview.rowCount).toBe(30);
    expect(preview.sample).toHaveLength(10);
    expect(preview.sample[0].cells[0]).toHaveLength(201);
  });
});
