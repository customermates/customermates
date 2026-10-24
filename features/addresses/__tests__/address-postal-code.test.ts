import { describe, expect, it } from "vitest";

import { addressFormatOf } from "../address-metadata";
import { cleanPostalCode, normalizePostalCode, postalCodeKey } from "../address-postal-code";

function normalized(country: string, value: string) {
  return normalizePostalCode(addressFormatOf(country), value);
}

describe("postal code normalisation", () => {
  it("accepts codes in the country's format and uppercases them", () => {
    expect(normalized("de", " 68259 ")).toEqual({ value: "68259", status: "valid" });
    expect(normalized("gb", "ec1a 1bb")).toEqual({ value: "EC1A 1BB", status: "valid" });
    expect(normalized("ca", "k1a 0b1")).toEqual({ value: "K1A 0B1", status: "valid" });
    expect(normalized("us", "95014")).toEqual({ value: "95014", status: "valid" });
    expect(normalized("se", "114 55")).toEqual({ value: "114 55", status: "valid" });
    expect(normalized("se", "11455")).toEqual({ value: "11455", status: "valid" });
  });

  it("adds the separator a country writes when it is missing", () => {
    expect(normalized("nl", "1012ab")).toEqual({ value: "1012 AB", status: "valid" });
    expect(normalized("gb", "SW1A1AA")).toEqual({ value: "SW1A 1AA", status: "valid" });
    expect(normalized("gb", "m11ae")).toEqual({ value: "M1 1AE", status: "valid" });
    expect(normalized("ca", "K1A0B1")).toEqual({ value: "K1A 0B1", status: "valid" });
    expect(normalized("jp", "1000001")).toEqual({ value: "100-0001", status: "valid" });
    expect(normalized("pl", "00950")).toEqual({ value: "00-950", status: "valid" });
    expect(normalized("pt", "3750011")).toEqual({ value: "3750-011", status: "valid" });
    expect(normalized("br", "01310100")).toEqual({ value: "01310-100", status: "valid" });
    expect(normalized("cz", "11000")).toEqual({ value: "110 00", status: "valid" });
    expect(normalized("ie", "d02x285")).toEqual({ value: "D02 X285", status: "valid" });
    expect(normalized("us", "95014 1234")).toEqual({ value: "95014-1234", status: "valid" });
    expect(normalized("us", "950141234")).toEqual({ value: "95014-1234", status: "valid" });
    expect(normalized("nl", "1012-AB")).toEqual({ value: "1012 AB", status: "valid" });
  });

  it("drops country prefixes in front of a code", () => {
    expect(normalized("de", "D-68259")).toEqual({ value: "68259", status: "valid" });
    expect(normalized("de", "DE 68259")).toEqual({ value: "68259", status: "valid" });
    expect(normalized("ch", "CH-8001")).toEqual({ value: "8001", status: "valid" });
    expect(normalized("lu", "L-4968")).toEqual({ value: "4968", status: "valid" });
    expect(normalized("at", "A-1010")).toEqual({ value: "1010", status: "valid" });
    expect(normalized("lv", "1010")).toEqual({ value: "LV-1010", status: "valid" });
    expect(normalized("lv", "lv1010")).toEqual({ value: "LV-1010", status: "valid" });
  });

  it("flags a code that does not fit the country's format", () => {
    expect(normalized("de", "6825")).toEqual({ value: "6825", status: "invalid" });
    expect(normalized("de", "682591")).toEqual({ value: "682591", status: "invalid" });
    expect(normalized("us", "9501")).toEqual({ value: "9501", status: "invalid" });
    expect(normalized("gb", "SW1A")).toEqual({ value: "SW1A", status: "invalid" });
    expect(normalized("nl", "0123 AB")).toEqual({ value: "0123 AB", status: "invalid" });
    expect(normalized("ca", "D1A 0B1")).toEqual({ value: "D1A 0B1", status: "invalid" });
    expect(normalized("de", "F-68259")).toEqual({ value: "F-68259", status: "invalid" });
  });

  it("leaves codes unchecked where the country uses none", () => {
    expect(normalized("ae", "12345")).toEqual({ value: "12345", status: "unchecked" });
    expect(normalizePostalCode(addressFormatOf(null), "abc")).toEqual({ value: "ABC", status: "unchecked" });
  });

  it("builds lookup keys from letters and digits only", () => {
    expect(cleanPostalCode(" sw1a  1aa ")).toBe("SW1A 1AA");
    expect(cleanPostalCode("100 – 0001")).toBe("100-0001");
    expect(postalCodeKey("SW1A 1AA")).toBe("SW1A1AA");
    expect(postalCodeKey("100-0001")).toBe("1000001");
  });
});
