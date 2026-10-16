import { describe, expect, it } from "vitest";

import type { RecordAddressParts } from "@/features/records/record-address-lines";
import type { PostalCodePlace, PostalCodePlaces } from "../address-check";

import { checkAddressFormat, checkAddressPlaces, sameCityName } from "../address-check";
import { addressFormatOf, isKnownAddressCountry } from "../address-metadata";

function parts(values: Partial<RecordAddressParts>): RecordAddressParts {
  return { street: null, line2: null, postalCode: null, city: null, region: null, countryCode: null, ...values };
}

function format(values: Partial<RecordAddressParts>) {
  return checkAddressFormat(parts(values), addressFormatOf, isKnownAddressCountry);
}

function place(
  city: string | null,
  latitude: number,
  longitude: number,
  region: string | null = null,
): PostalCodePlace {
  return { city, region, latitude, longitude };
}

function exact(places: PostalCodePlace[]): PostalCodePlaces {
  return { match: "exact", cityChecked: true, places };
}

describe("address format check", () => {
  it("normalises a complete German address without issues", () => {
    expect(format({ street: "Hauptstraße 5", postalCode: "D-68259", city: "Mannheim", countryCode: "de" })).toEqual({
      parts: parts({ street: "Hauptstraße 5", postalCode: "68259", city: "Mannheim", countryCode: "de" }),
      issues: [],
    });
  });

  it("blocks an unknown country, a postal code in the wrong format and an unknown region code", () => {
    expect(format({ city: "Atlantis", countryCode: "zz" }).issues).toEqual([
      { code: "countryUnknown", severity: "error", part: "countryCode" },
    ]);
    expect(format({ street: "Hauptstraße 5", postalCode: "6825", city: "Mannheim", countryCode: "de" }).issues).toEqual(
      [{ code: "postalCodeInvalid", severity: "error", part: "postalCode", example: "26133" }],
    );
    for (const region of ["XX", "US-ZZ", "zz"]) {
      expect(
        format({ street: "1 Infinite Loop", postalCode: "95014", city: "Cupertino", region, countryCode: "us" }).issues,
        region,
      ).toEqual([{ code: "regionInvalid", severity: "error", part: "region" }]);
    }
    expect(
      format({ street: "Via Roma 1", postalCode: "20121", city: "Milano", region: "XY", countryCode: "it" }).issues,
    ).toEqual([{ code: "regionInvalid", severity: "error", part: "region" }]);
  });

  it("warns about parts the postal format needs once a street makes it a postal address", () => {
    expect(format({ street: "Hauptstraße 5", city: "Mannheim", countryCode: "de" }).issues).toEqual([
      { code: "partMissing", severity: "warning", part: "postalCode" },
    ]);
    expect(format({ street: "1 Infinite Loop", postalCode: "95014", countryCode: "us" }).issues).toEqual([
      { code: "partMissing", severity: "warning", part: "city" },
      { code: "partMissing", severity: "warning", part: "region" },
    ]);
    expect(format({ city: "Mannheim", countryCode: "de" }).issues).toEqual([]);
    expect(format({ region: "CA", countryCode: "us" }).issues).toEqual([]);
  });

  it("warns about region names the country does not have instead of refusing them", () => {
    for (const region of ["Calif", "Fla", "Ill."]) {
      expect(
        format({ street: "1 Infinite Loop", postalCode: "95014", city: "Cupertino", region, countryCode: "us" }).issues,
        region,
      ).toEqual([{ code: "regionUnknown", severity: "warning", part: "region" }]);
    }
    expect(
      format({ street: "Calle Mayor 1", postalCode: "28013", city: "Madrid", region: "Mad", countryCode: "es" }).issues,
    ).toEqual([{ code: "regionUnknown", severity: "warning", part: "region" }]);
    expect(
      format({ street: "1 Infinite Loop", postalCode: "95014", city: "Cupertino", region: "DE-BY", countryCode: "us" })
        .issues,
    ).toEqual([{ code: "regionUnknown", severity: "warning", part: "region" }]);
  });

  it("warns that a postal code or region without a country could not be checked", () => {
    expect(format({ postalCode: " 68259 ", city: "Mannheim" })).toEqual({
      parts: parts({ postalCode: "68259", city: "Mannheim" }),
      issues: [{ code: "countryMissing", severity: "warning", part: "countryCode" }],
    });
    expect(format({ region: "Bavaria" }).issues).toEqual([
      { code: "countryMissing", severity: "warning", part: "countryCode" },
    ]);
    expect(format({ city: "Mannheim" }).issues).toEqual([]);
    expect(format({ street: "Somewhere 1" }).issues).toEqual([]);
  });

  it("warns when a postal code belongs to another region", () => {
    const checked = format({
      street: "350 5th Avenue",
      postalCode: "10118",
      city: "New York",
      region: "California",
      countryCode: "us",
    });
    expect(checked.parts.region).toBe("CA");
    expect(checked.issues).toEqual([
      { code: "postalCodeRegionMismatch", severity: "warning", part: "region", expected: ["NY"] },
    ]);
  });
});

describe("address check against postal codes", () => {
  const de = addressFormatOf("de");

  it("places a matching address at its postal code and needs no warning", () => {
    const address = parts({ street: "Hauptstraße 5", postalCode: "68259", city: "Mannheim", countryCode: "de" });
    expect(checkAddressPlaces(address, exact([place("Mannheim", 49.4903, 8.5339)]), de)).toEqual({
      issues: [],
      location: { lat: 49.4903, lon: 8.5339, precision: "postcode" },
    });
  });

  it("warns about a city that does not belong to the postal code and names the expected ones", () => {
    const address = parts({ postalCode: "01945", city: "Dresden", countryCode: "de" });
    const lookup = exact([
      place("Ruhland", 51.4576, 13.8664),
      place("Tettau", 51.4333, 13.7333),
      place("ruhland", 51.45, 13.87),
    ]);
    expect(checkAddressPlaces(address, lookup, de)).toEqual({
      issues: [{ code: "cityMismatch", severity: "warning", part: "city", expected: ["Ruhland", "Tettau"] }],
      location: { lat: 51.44697, lon: 13.82323, precision: "postcode" },
    });
  });

  it("uses the coordinates of the matching place when a postal code has several", () => {
    const address = parts({ postalCode: "01945", city: "Tettau", countryCode: "de" });
    const lookup = exact([place("Ruhland", 51.4576, 13.8664), place("Tettau", 51.4333, 13.7333)]);
    expect(checkAddressPlaces(address, lookup, de)).toEqual({
      issues: [],
      location: { lat: 51.4333, lon: 13.7333, precision: "postcode" },
    });
  });

  it("neither warns nor places an address whose postal code the directory only knows by its area", () => {
    const address = parts({ postalCode: "68299", city: "Heidelberg", countryCode: "de" });
    const area = { match: "area" as const, cityChecked: true, places: [place("Mannheim", 49.49, 8.53)] };
    expect(checkAddressPlaces(address, area, de)).toEqual({ issues: [], location: null });
    expect(checkAddressPlaces(address, { match: "none", cityChecked: true, places: [] }, de)).toEqual({
      issues: [],
      location: null,
    });
    expect(checkAddressPlaces(address, null, de)).toEqual({ issues: [], location: null });
  });

  it("places but does not judge the city where the directory lists localities or only an area's main towns", () => {
    const address = parts({ postalCode: "T0A 0A0", city: "Abee", countryCode: "ca" });
    const lookup = { match: "exact" as const, cityChecked: false, places: [place("Sturgeon County", 53.79, -113.42)] };
    expect(checkAddressPlaces(address, lookup, addressFormatOf("ca"))).toEqual({
      issues: [],
      location: { lat: 53.79, lon: -113.42, precision: "postcode" },
    });
  });

  it("compares regions by key, whatever script they are written in", () => {
    const jp = addressFormatOf("jp");
    const tokyo = parts({ postalCode: "100-0001", city: "Chiyoda-ku", region: "Tokyo", countryCode: "jp" });
    const lookup = exact([place("Chiyoda-ku", 35.6841, 139.7521, "東京都")]);
    expect(checkAddressPlaces(tokyo, lookup, jp).issues).toEqual([]);
    expect(checkAddressPlaces({ ...tokyo, region: "Osaka" }, lookup, jp).issues).toEqual([
      { code: "postalCodeRegionMismatch", severity: "warning", part: "region", expected: ["東京都"] },
    ]);
  });

  it("skips the city comparison when the known names use another script", () => {
    const kr = addressFormatOf("kr");
    const address = parts({ postalCode: "04524", city: "Seoul", countryCode: "kr" });
    expect(checkAddressPlaces(address, exact([place("중구", 37.56, 126.98)]), kr).issues).toEqual([]);
  });

  it("matches city names across case, accents, umlaut spellings, saints and district suffixes", () => {
    expect(sameCityName("Muenchen", "München")).toBe(true);
    expect(sameCityName("Frankfurt", "Frankfurt am Main")).toBe(true);
    expect(sameCityName("Frankfurt a. M.", "Frankfurt am Main")).toBe(true);
    expect(sameCityName("St. Gallen", "Sankt Gallen")).toBe(true);
    expect(sameCityName("Saint-Étienne", "St Etienne")).toBe(true);
    expect(sameCityName("Paris", "Paris 01")).toBe(true);
    expect(sameCityName("Mannheim", "Heidelberg")).toBe(false);
    expect(sameCityName("Bad Homburg", "Bad Kreuznach")).toBe(false);
  });
});
