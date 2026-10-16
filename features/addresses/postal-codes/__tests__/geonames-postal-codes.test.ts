import { describe, expect, it } from "vitest";

import type { GeoNamesPostalCode } from "../geonames-postal-codes";

import { addressFormatOf } from "../../address-metadata";
import { parseGeoNamesPostalCodes, postalCodeRows, validPostalCodeShare } from "../geonames-postal-codes";
import { isPostalCodeDataError } from "../postal-code-zip";
import { geonamesLine } from "./zip-fixture";

function rows(country: string, lines: string[], region: string | null = null) {
  return { rows: parseGeoNamesPostalCodes(lines.join("\n"), region ?? country), region };
}

function transformed(country: string, lines: string[]) {
  return postalCodeRows([rows(country, lines)], addressFormatOf(country)).map(
    ({ postalKey, ordinal, city, region }) => ({
      postalKey,
      ordinal,
      city,
      region,
    }),
  );
}

function failure(text: string, country: string): unknown {
  try {
    parseGeoNamesPostalCodes(text, country);
  } catch (error) {
    return error;
  }
  return null;
}

describe("GeoNames postal code files", () => {
  it("parses the twelve tab-separated columns", () => {
    const parsed = parseGeoNamesPostalCodes(
      `${geonamesLine("DE", "68259", "Mannheim", { name1: "Baden-Württemberg", code1: "BW", name3: "Mannheim" }, 49.4903, 8.5339)}\n`,
      "de",
    );
    expect(parsed).toEqual<GeoNamesPostalCode[]>([
      {
        countryCode: "DE",
        postalCode: "68259",
        place: "Mannheim",
        admin1Name: "Baden-Württemberg",
        admin1Code: "BW",
        admin2Name: "",
        admin2Code: "",
        admin3Name: "Mannheim",
        admin3Code: "",
        latitude: 49.4903,
        longitude: 8.5339,
        accuracy: 4,
      },
    ]);
  });

  it("refuses lines with missing columns, another country, a bad code or a bad coordinate", () => {
    expect(isPostalCodeDataError(failure("DE\t68259\tMannheim", "de"))).toBe(true);
    expect(isPostalCodeDataError(failure(geonamesLine("AT", "1010", "Wien"), "de"))).toBe(true);
    expect(isPostalCodeDataError(failure(geonamesLine("DE", "", "Mannheim"), "de"))).toBe(true);
    expect(isPostalCodeDataError(failure(geonamesLine("DE", "68259", "Mannheim", {}, 91, 8), "de"))).toBe(true);
    expect(isPostalCodeDataError(failure(geonamesLine("DE", "68259", "Mannheim", {}, 49, 8, "9"), "de"))).toBe(true);
  });

  it("keeps the places of a German code and turns a large customer's code into its city", () => {
    expect(
      transformed("de", [
        geonamesLine("DE", "01945", "Tettau", { name3: "Landkreis Oberspreewald-Lausitz" }),
        geonamesLine("DE", "01945", "Ruhland", { name3: "Landkreis Oberspreewald-Lausitz" }),
        geonamesLine(
          "DE",
          "01945",
          "Sparkasse Niederlausitz",
          { name3: "Landkreis Oberspreewald-Lausitz" },
          51,
          13,
          "",
        ),
        geonamesLine(
          "DE",
          "44126",
          "Hülpert Shared Service GmbH",
          { name3: "Kreisfreie Stadt Dortmund" },
          51.5,
          7.48,
          "",
        ),
        geonamesLine("DE", "44126", "HDI Service AG", { name3: "Kreisfreie Stadt Dortmund" }, 51.5, 7.48, ""),
        geonamesLine("DE", "54469", "Amtsgericht", { name3: "Landkreis Bernkastel-Wittlich" }, 49.9, 7.1, ""),
      ]),
    ).toEqual([
      { postalKey: "01945", ordinal: 0, city: "Tettau", region: null },
      { postalKey: "01945", ordinal: 1, city: "Ruhland", region: null },
      { postalKey: "44126", ordinal: 0, city: "Dortmund", region: null },
      { postalKey: "54469", ordinal: 0, city: null, region: null },
    ]);
  });

  it("ranks the municipality first and merges spellings and office numbers of one place", () => {
    expect(
      transformed("at", [
        geonamesLine("AT", "6020", "Mühlau", { name3: "Innsbruck" }),
        geonamesLine("AT", "6020", "Innsbruck", { name3: "Innsbruck" }),
        geonamesLine("AT", "6020", "Natters", { name3: "Natters" }),
      ]),
    ).toEqual([
      { postalKey: "6020", ordinal: 0, city: "Innsbruck", region: null },
      { postalKey: "6020", ordinal: 1, city: "Natters", region: null },
      { postalKey: "6020", ordinal: 2, city: "Mühlau", region: null },
    ]);
    expect(
      transformed("fr", [
        geonamesLine("FR", "75001", "Paris", { name3: "Paris" }),
        geonamesLine("FR", "75001", "Paris 01", { name3: "Paris" }),
        geonamesLine("FR", "75021 CEDEX 01", "Paris 01", { name3: "Paris" }),
      ]),
    ).toEqual([
      { postalKey: "75001", ordinal: 0, city: "Paris", region: null },
      { postalKey: "75021", ordinal: 0, city: "Paris", region: null },
    ]);
    expect(
      transformed("ch", [geonamesLine("CH", "3000", "Bern 22"), geonamesLine("CH", "3000", "Bern 65 SBB")]),
    ).toEqual([{ postalKey: "3000", ordinal: 0, city: "Bern", region: null }]);
  });

  it("maps admin areas onto the country's regions by name before trusting their codes", () => {
    expect(
      transformed("us", [
        geonamesLine("US", "95014", "Cupertino", { name1: "California", code1: "CA" }),
        geonamesLine("US", "10118", "New York", { name1: "New York", code1: "NY" }),
      ]),
    ).toEqual([
      { postalKey: "10118", ordinal: 0, city: "New York", region: "NY" },
      { postalKey: "95014", ordinal: 0, city: "Cupertino", region: "CA" },
    ]);
    expect(
      transformed("it", [
        geonamesLine("IT", "20121", "Milano", { name1: "Lombardia", code1: "09", name2: "Milano", code2: "MI" }),
      ]),
    ).toEqual([{ postalKey: "20121", ordinal: 0, city: "Milano", region: "MI" }]);
    expect(
      transformed("jp", [
        geonamesLine("JP", "100-0001", "Chiyoda", { name1: "Tokyo To", code1: "40", name2: "Chiyoda Ku" }),
      ]),
    ).toEqual([{ postalKey: "1000001", ordinal: 0, city: "Chiyoda-ku", region: "東京都" }]);
    expect(
      transformed("mx", [
        geonamesLine("MX", "58000", "Centro", { name1: "Michoacán de Ocampo", code1: "16", name2: "Morelia" }),
        geonamesLine("MX", "58000", "Chapultepec", { name1: "Michoacán de Ocampo", code1: "16", name2: "Morelia" }),
      ]),
    ).toEqual([{ postalKey: "58000", ordinal: 0, city: "Morelia", region: "Mich." }]);
  });

  it("puts London post towns on London outward codes", () => {
    expect(
      transformed("gb", [
        geonamesLine("GB", "E1", "Shadwell", { name1: "England", code1: "ENG", name2: "Greater London" }),
        geonamesLine("GB", "E1", "Wapping", { name1: "England", code1: "ENG", name2: "Greater London" }),
        geonamesLine("GB", "M1", "Manchester", { name1: "England", code1: "ENG", name2: "Greater Manchester" }),
      ]),
    ).toEqual([
      { postalKey: "E1", ordinal: 0, city: "London", region: null },
      { postalKey: "M1", ordinal: 0, city: "Manchester", region: null },
    ]);
  });

  it("aggregates full Canadian codes to their area and keeps its main cities", () => {
    const lines = [
      ...Array.from({ length: 18 }, (_, index) =>
        geonamesLine("CA", `K1A 0B${index % 10}`, "Ottawa", { name1: "Ontario", code1: "ON" }, 45.42, -75.69, "6"),
      ),
      geonamesLine("CA", "K1A 0C1", "Gatineau", { name1: "Ontario", code1: "ON" }, 45.48, -75.7, "6"),
      geonamesLine("CA", "K1A 0C2", "Gatineau", { name1: "Ontario", code1: "ON" }, 45.48, -75.7, "6"),
      geonamesLine("CA", "K1A 0C3", "Vanier", { name1: "Ontario", code1: "ON" }, 45.44, -75.66, "6"),
    ];
    expect(transformed("ca", lines)).toEqual([
      { postalKey: "K1A", ordinal: 0, city: "Ottawa", region: "ON" },
      { postalKey: "K1A", ordinal: 1, city: "Gatineau", region: "ON" },
    ]);
  });

  it("files territory codes under the parent country's region", () => {
    const format = addressFormatOf("us");
    const result = postalCodeRows(
      [
        rows("us", [geonamesLine("US", "95014", "Cupertino", { name1: "California", code1: "CA" })]),
        rows("us", [geonamesLine("PR", "00601", "Adjuntas", { name1: "Adjuntas", code1: "001" })], "PR"),
      ],
      format,
    );
    expect(result.map((row) => [row.postalCode, row.city, row.region])).toEqual([
      ["00601", "Adjuntas", "PR"],
      ["95014", "Cupertino", "CA"],
    ]);
  });

  it("measures how many codes fit the country's format", () => {
    const format = addressFormatOf("de");
    const result = postalCodeRows(
      [rows("de", [geonamesLine("DE", "68259", "Mannheim"), geonamesLine("DE", "1234", "Nowhere")])],
      format,
    );
    expect(validPostalCodeShare(result, format)).toBe(0.5);
  });
});
