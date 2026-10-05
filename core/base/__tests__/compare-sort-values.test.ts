import { describe, expect, it } from "vitest";

import { compareSortValues } from "../base-query-builder";

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
