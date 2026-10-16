import { describe, expect, it } from "vitest";

import { addressFormatOf } from "../address-metadata";
import { checkAddressRegion, findAddressRegion, matchAddressRegion } from "../address-region";

function check(country: string, value: string) {
  const result = checkAddressRegion(addressFormatOf(country), value);
  return { status: result.status, value: result.value };
}

describe("address regions", () => {
  it("resolves codes, names, ISO codes and other spellings to the country's region key", () => {
    for (const value of ["CA", "ca", "California", "california", "US-CA"])
      expect(check("us", value), value).toEqual({ status: "matched", value: "CA" });
    expect(check("it", "Milano")).toEqual({ status: "matched", value: "MI" });
    expect(check("es", "Almeria")).toEqual({ status: "matched", value: "AL" });
    expect(check("es", "Alacant")).toEqual({ status: "matched", value: "A" });
    expect(check("ca", "Colombie-Britannique")).toEqual({ status: "matched", value: "BC" });
    expect(check("mx", "Michoacán de Ocampo")).toEqual({ status: "matched", value: "Mich." });
    expect(check("tr", "34")).toEqual({ status: "matched", value: "İstanbul" });
    expect(check("au", "New South Wales")).toEqual({ status: "matched", value: "NSW" });
    expect(check("br", "São Paulo")).toEqual({ status: "matched", value: "SP" });
  });

  it("keeps the Latin name when a country's keys use another script and the input is Latin", () => {
    expect(check("jp", "Tokyo")).toEqual({ status: "matched", value: "Tokyo" });
    expect(check("jp", "Tokyo To")).toEqual({ status: "matched", value: "Tokyo" });
    expect(check("jp", "東京都")).toEqual({ status: "matched", value: "東京都" });
    expect(findAddressRegion(addressFormatOf("jp"), "Tokyo")?.key).toBe("東京都");
    expect(findAddressRegion(addressFormatOf("ru"), "Башкортостан Республика")?.key).toBe("Республика Башкортостан");
  });

  it("refuses an unknown region code, warns about an unknown name and keeps ambiguous names", () => {
    expect(check("us", "XX")).toEqual({ status: "invalidCode", value: "XX" });
    expect(check("us", "US-ZZ")).toEqual({ status: "invalidCode", value: "US-ZZ" });
    expect(check("us", "Calif")).toEqual({ status: "unknown", value: "Calif" });
    expect(check("pe", "Lima")).toEqual({ status: "ambiguous", value: "Lima" });
    expect(matchAddressRegion(addressFormatOf("pe"), "Lima")).toBe("ambiguous");
  });

  it("leaves the region alone where the country has no list of regions", () => {
    expect(check("de", "Bayern")).toEqual({ status: "unchecked", value: "Bayern" });
    expect(check("gb", "  Greater   London ")).toEqual({ status: "unchecked", value: "Greater London" });
  });
});
