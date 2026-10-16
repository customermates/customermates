import { describe, expect, it } from "vitest";

import type { AddressCheckResult } from "../address-check.schema";
import type { AddressFormParts } from "../address-form-layout";

import { addressFormatOf } from "../address-metadata";
import { addressAutofill, addressFormRows, addressPlaceChoices } from "../address-form-layout";

function parts(values: Partial<AddressFormParts>): AddressFormParts {
  return { street: null, line2: null, postalCode: null, city: null, region: null, countryCode: null, ...values };
}

function checked(
  places: Array<{ city: string | null; region?: string | null }>,
  match: "exact" | "area" | "none" = "exact",
): AddressCheckResult {
  return {
    address: {
      street: null,
      line2: null,
      postalCode: "01945",
      city: null,
      region: null,
      countryCode: "de",
      formatted: "01945",
      location: null,
      verification: { status: "unverified", provider: null, checkedAt: null },
    },
    issues: [],
    postalCode: {
      status: "ready",
      match,
      places: places.map((place) => ({
        city: place.city,
        region: place.region ?? null,
        location: { lat: 51, lon: 13, precision: "postcode" as const },
      })),
    },
    attribution: places.length ? "Postal codes: GeoNames (geonames.org), CC BY 4.0" : null,
  };
}

describe("address form layout", () => {
  it("orders the parts the way the country writes them and keeps line 2 after the street", () => {
    expect(addressFormRows(addressFormatOf("de"), parts({ countryCode: "de" }))).toEqual([
      ["street"],
      ["line2"],
      ["postalCode", "city"],
    ]);
    expect(addressFormRows(addressFormatOf("us"), parts({ countryCode: "us" }))).toEqual([
      ["street"],
      ["line2"],
      ["city", "region", "postalCode"],
    ]);
    expect(addressFormRows(addressFormatOf("jp"), parts({ countryCode: "jp" }))).toEqual([
      ["postalCode"],
      ["region"],
      ["city"],
      ["street"],
      ["line2"],
    ]);
  });

  it("shows every part without a country and keeps a filled part the country does not use", () => {
    expect(addressFormRows(null, parts({}))).toEqual([["street"], ["line2"], ["postalCode", "city"], ["region"]]);
    expect(addressFormRows(addressFormatOf(null), parts({}))).toEqual([
      ["street"],
      ["line2"],
      ["postalCode", "city"],
      ["region"],
    ]);
    expect(addressFormRows(addressFormatOf("de"), parts({ countryCode: "de", region: "Bayern" }))).toEqual([
      ["street"],
      ["line2"],
      ["postalCode", "city"],
      ["region"],
    ]);
  });
});

describe("postal code suggestions", () => {
  const de = addressFormatOf("de");
  const us = addressFormatOf("us");

  it("fills an empty city, and the region where the country has regions, from a single exact place", () => {
    expect(
      addressAutofill(checked([{ city: "Mannheim" }]), parts({ postalCode: "68259", countryCode: "de" }), de),
    ).toEqual({
      city: "Mannheim",
    });
    expect(
      addressAutofill(
        checked([{ city: "Cupertino", region: "CA" }]),
        parts({ postalCode: "95014", countryCode: "us" }),
        us,
      ),
    ).toEqual({ city: "Cupertino", region: "CA" });
    expect(
      addressAutofill(
        checked([{ city: "Cupertino", region: "CA" }]),
        parts({ postalCode: "95014", region: "NY", countryCode: "us" }),
        us,
      ),
    ).toEqual({ city: "Cupertino" });
  });

  it("never overwrites a city and never guesses between several places or from an approximate area", () => {
    const address = parts({ postalCode: "01945", countryCode: "de" });
    expect(addressAutofill(checked([{ city: "Mannheim" }]), { ...address, city: "Heidelberg" }, de)).toBeNull();
    expect(addressAutofill(checked([{ city: "Ruhland" }, { city: "Tettau" }]), address, de)).toBeNull();
    expect(addressAutofill(checked([{ city: "Mannheim" }], "area"), address, de)).toBeNull();
    expect(addressAutofill(checked([]), address, de)).toBeNull();
  });

  it("offers each city of a postal code once, most likely first", () => {
    expect(
      addressPlaceChoices(checked([{ city: "Ruhland" }, { city: "Tettau" }, { city: "ruhland" }, { city: null }])),
    ).toEqual([
      { city: "Ruhland", region: null },
      { city: "Tettau", region: null },
    ]);
    expect(
      addressPlaceChoices({
        ...checked([{ city: "Mannheim" }]),
        postalCode: { status: "loading", match: null, places: [] },
      }),
    ).toEqual([]);
  });
});
