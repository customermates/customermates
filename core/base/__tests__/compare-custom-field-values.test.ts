import { describe, expect, it } from "vitest";

import { compareCustomFieldValues, compareSortValues } from "../base-query-builder";

describe("compareCustomFieldValues", () => {
  const de = new Intl.Collator("de-DE");
  const en = new Intl.Collator("en-US");
  const fr = new Intl.Collator("fr-FR");

  it("uses the explicit formatting locale for string collation", () => {
    expect(compareCustomFieldValues("ä", "z", "asc", "plain", de)).toBeLessThan(0);
    expect(compareCustomFieldValues("ä", "z", "desc", "plain", de)).toBeGreaterThan(0);
  });

  it("keeps missing values last in both directions", () => {
    expect(compareCustomFieldValues(null, "value", "asc", "plain", en)).toBeGreaterThan(0);
    expect(compareCustomFieldValues(null, "value", "desc", "plain", en)).toBeGreaterThan(0);
  });

  it("sorts numeric and date values independently of locale", () => {
    expect(compareCustomFieldValues("2", "10", "asc", "currency", de)).toBeLessThan(0);
    expect(compareCustomFieldValues("2025-01-01", "2026-01-01", "asc", "date", fr)).toBeLessThan(0);
  });

  describe("single selects", () => {
    const high = "f3a1c0de-0000-4000-8000-000000000001";
    const medium = "0b7e5a11-0000-4000-8000-000000000002";
    const low = "9c2d4e33-0000-4000-8000-000000000003";
    const optionRank = new Map([
      [high, 0],
      [medium, 1],
      [low, 2],
    ]);
    const sorted = (values: Array<string | null>, direction: "asc" | "desc") =>
      [...values].sort((a, b) => compareCustomFieldValues(a, b, direction, "singleSelect", en, optionRank));

    it("follows the option order, not the order of the stored option ids", () => {
      expect([high, medium, low].sort()).not.toEqual([high, medium, low]);
      expect(sorted([low, null, high, medium], "asc")).toEqual([high, medium, low, null]);
    });

    it("reverses the option order when descending and still keeps missing values last", () => {
      expect(sorted([low, null, high, medium], "desc")).toEqual([low, medium, high, null]);
    });

    it("puts a stored value that is no longer an option after the known options", () => {
      expect(sorted(["retired-option", low, high], "asc")).toEqual([high, low, "retired-option"]);
    });
  });
});

describe("compareSortValues", () => {
  const de = new Intl.Collator("de-DE");
  const sorted = (rows: unknown[][], direction: "asc" | "desc") =>
    [...rows].sort((a, b) => compareSortValues(a, b, direction, de));

  it("compares text with the locale collator instead of byte order", () => {
    const names = [["CRM"], ["Change"], ["Überprüfung"], ["Umzug"], ["Zahlung"], ["SThree"], ["Siemens"]];

    expect(sorted(names, "asc").flat()).toEqual([
      "Change",
      "CRM",
      "Siemens",
      "SThree",
      "Überprüfung",
      "Umzug",
      "Zahlung",
    ]);
  });

  it("falls through to the next field on a tie, like first name then last name", () => {
    const people = [
      ["Anna", "Zeller"],
      ["Anna", "Ämmer"],
      ["Bert", "Adler"],
    ];

    expect(sorted(people, "asc")).toEqual([
      ["Anna", "Ämmer"],
      ["Anna", "Zeller"],
      ["Bert", "Adler"],
    ]);
  });

  it("keeps empty values last in both directions", () => {
    const rows = [[""], ["Beta"], [null], ["Alpha"]];

    expect(sorted(rows, "asc").flat()).toEqual(["Alpha", "Beta", "", null]);
    expect(sorted(rows, "desc").flat()).toEqual(["Beta", "Alpha", "", null]);
  });

  it("orders booleans and dates by value, so custom roles list before the system role", () => {
    expect(
      sorted(
        [
          [true, "Admin"],
          [false, "Sales"],
          [false, "Customer Success"],
        ],
        "asc",
      ),
    ).toEqual([
      [false, "Customer Success"],
      [false, "Sales"],
      [true, "Admin"],
    ]);
    expect(compareSortValues([new Date("2026-01-01")], [new Date("2025-01-01")], "asc", de)).toBeGreaterThan(0);
  });
});
