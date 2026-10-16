import { describe, expect, it } from "vitest";

import {
  postalCodeCityChecked,
  postalCodeFormatCheckable,
  postalCodeLookupKeys,
  postalCodeSources,
} from "../postal-code-sources";

describe("postal code sources", () => {
  it("loads a country's own file and the territories that use its postal system", () => {
    expect(postalCodeSources("de")).toEqual([{ file: "DE.zip", entry: "DE.txt", required: true, region: null }]);
    expect(postalCodeSources("ca")).toEqual([
      { file: "CA_full.csv.zip", entry: "CA_full.txt", required: true, region: null },
    ]);
    expect(postalCodeSources("us").map((source) => [source.file, source.required, source.region])).toEqual([
      ["US.zip", true, null],
      ["PR.zip", false, "PR"],
      ["GU.zip", false, "GU"],
      ["VI.zip", false, "VI"],
      ["AS.zip", false, "AS"],
      ["MP.zip", false, "MP"],
      ["MH.zip", false, "MH"],
      ["FM.zip", false, "FM"],
      ["PW.zip", false, "PW"],
    ]);
    expect(postalCodeSources("fr").map((source) => source.file)).toContain("RE.zip");
  });

  it("looks a code up by itself first, then by shorter prefixes", () => {
    expect(postalCodeLookupKeys("de", "68259")).toEqual({
      keys: ["68259", "6825", "682", "68"],
      exact: new Set(["68259"]),
    });
    expect(postalCodeLookupKeys("de", "")).toEqual({ keys: [], exact: new Set() });
  });

  it("counts the area a country's data lists as an exact match", () => {
    expect(postalCodeLookupKeys("gb", "SW1A 1AA")).toEqual({
      keys: ["SW1A1AA", "SW1A", "SW1A1A", "SW1A1", "SW1", "SW"],
      exact: new Set(["SW1A1AA", "SW1A"]),
    });
    expect(postalCodeLookupKeys("us", "95014-1234").exact).toEqual(new Set(["950141234", "95014"]));
    expect(postalCodeLookupKeys("us", "95014").exact).toEqual(new Set(["95014"]));
    expect(postalCodeLookupKeys("nl", "1012 AB").exact).toEqual(new Set(["1012AB", "1012"]));
    expect(postalCodeLookupKeys("ca", "K1A 0B1").exact).toEqual(new Set(["K1A0B1", "K1A"]));
    expect(postalCodeLookupKeys("ie", "D02 X285").exact).toEqual(new Set(["D02X285", "D02"]));
    expect(postalCodeLookupKeys("mt", "VLT 1117").exact).toEqual(new Set(["VLT1117", "VLT"]));
    expect(postalCodeLookupKeys("ar", "C1425ABC").exact).toEqual(new Set(["C1425ABC", "1425"]));
  });

  it("tries zero-filled codes where the data only has rounded codes, as an approximate area", () => {
    const chile = postalCodeLookupKeys("cl", "8340518");
    expect(chile.keys.slice(0, 6)).toEqual(["8340518", "8340510", "8340500", "8340000", "8300000", "834051"]);
    expect(chile.exact).toEqual(new Set(["8340518"]));
  });

  it("knows which countries list only areas and where the places are too coarse to judge a city", () => {
    expect(postalCodeFormatCheckable("de")).toBe(true);
    expect(postalCodeFormatCheckable("gb")).toBe(false);
    expect(postalCodeFormatCheckable("nl")).toBe(false);
    expect(postalCodeCityChecked("de")).toBe(true);
    expect(postalCodeCityChecked("nl")).toBe(true);
    expect(postalCodeCityChecked("gb")).toBe(false);
    expect(postalCodeCityChecked("ca")).toBe(false);
  });
});
