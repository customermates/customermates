import { describe, expect, it } from "vitest";

import {
  denormalizeNeutralizedFormula,
  fromWorkbookCell,
  fromWorkbookCellAsText,
  neutralizeFormula,
  toWorkbookCell,
} from "../workbook-cell";

describe("neutralizeFormula", () => {
  it.each(["=1+1", '=HYPERLINK("http://evil.example")', "=cmd|'/c calc'!A1"])(
    "prefixes %j so no converter can evaluate it",
    (raw) => {
      expect(neutralizeFormula(raw)).toBe(`'${raw}`);
    },
  );

  it.each(["+4915112345678", "-250.5", "@ada_lovelace", "Acme GmbH", "max@example.com", "", "1+1", "a=b"])(
    "leaves %j untouched, because it is ordinary CRM data and xlsx types the cell as text",
    (raw) => {
      expect(neutralizeFormula(raw)).toBe(raw);
    },
  );
});

describe("toWorkbookCell", () => {
  it("passes numbers, booleans and dates through untouched so the reader formats them", () => {
    const date = new Date("2026-11-04T00:00:00.000Z");

    expect(toWorkbookCell(12500.5)).toBe(12500.5);
    expect(toWorkbookCell(0)).toBe(0);
    expect(toWorkbookCell(false)).toBe(false);
    expect(toWorkbookCell(date)).toBe(date);
  });

  it("collapses undefined and null to a single empty representation", () => {
    expect(toWorkbookCell(undefined)).toBeNull();
    expect(toWorkbookCell(null)).toBeNull();
  });

  it("neutralizes a string that would otherwise read as a formula", () => {
    expect(toWorkbookCell('=HYPERLINK("http://evil.example")')).toBe('\'=HYPERLINK("http://evil.example")');
  });
});

describe("denormalizeNeutralizedFormula", () => {
  it("restores a value this exporter neutralized so a round trip is lossless", () => {
    expect(denormalizeNeutralizedFormula("'=1+1")).toBe("=1+1");
  });

  it("keeps an apostrophe that belongs to the data", () => {
    expect(denormalizeNeutralizedFormula("'tis a name")).toBe("'tis a name");
    expect(denormalizeNeutralizedFormula("O'Brien")).toBe("O'Brien");
    expect(denormalizeNeutralizedFormula("'+4915112345678")).toBe("'+4915112345678");
  });
});

describe("fromWorkbookCell", () => {
  it("normalizes the shapes exceljs returns instead of stringifying an object", () => {
    expect(fromWorkbookCell({ formula: "A1+A2", result: 42 })).toBe(42);
    expect(fromWorkbookCell({ richText: [{ text: "Acme" }, { text: " GmbH" }] })).toBe("Acme GmbH");
    expect(fromWorkbookCell({ text: "site", hyperlink: "https://example.com" })).toBe("site");
    expect(fromWorkbookCell({ error: "#REF!" })).toBeNull();
  });

  it("returns null for a formula with no cached result rather than leaking the expression", () => {
    expect(fromWorkbookCell({ formula: "A1+A2" })).toBeNull();
  });

  it("preserves primitives", () => {
    const date = new Date("2026-11-04T00:00:00.000Z");

    expect(fromWorkbookCell(date)).toBe(date);
    expect(fromWorkbookCell(7)).toBe(7);
    expect(fromWorkbookCell(true)).toBe(true);
    expect(fromWorkbookCell(null)).toBeNull();
    expect(fromWorkbookCell(undefined)).toBeNull();
  });
});

describe("fromWorkbookCellAsText", () => {
  it("never produces the string form of an object", () => {
    expect(fromWorkbookCellAsText({ richText: [{ text: "Acme" }] })).toBe("Acme");
    expect(fromWorkbookCellAsText({ formula: "A1", result: null })).toBe("");
    expect(fromWorkbookCellAsText(42)).toBe("42");
    expect(fromWorkbookCellAsText(new Date("2026-11-04T00:00:00.000Z"))).toBe("2026-11-04T00:00:00.000Z");
  });
});
