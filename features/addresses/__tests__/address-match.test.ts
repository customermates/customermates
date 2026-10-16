import { describe, expect, it } from "vitest";

import type { RecordAddressParts } from "@/features/records/record-address-lines";

import { verifiedRecordAddress } from "@/features/records/record-address";
import { addressMatchesInput, addressWords, bestAddressMatch } from "../address-match";

function candidate(parts: Partial<RecordAddressParts>) {
  return verifiedRecordAddress(
    { street: null, line2: null, postalCode: null, city: null, region: null, countryCode: null, ...parts },
    { provider: "photon", checkedAt: "2026-10-15T08:00:00.000Z", location: null },
  );
}

function input(parts: Partial<RecordAddressParts>): RecordAddressParts {
  return { street: null, line2: null, postalCode: null, city: null, region: null, countryCode: null, ...parts };
}

const MANNHEIM = candidate({ street: "Hauptstraße 5", postalCode: "68259", city: "Mannheim", countryCode: "de" });

describe("address check matching", () => {
  it("normalizes case, accents, street abbreviations and house number spacing", () => {
    expect(addressWords("Hauptstr. 5 a")).toEqual(["hauptstrasse", "5a"]);
    expect(addressWords("Berliner Str. 12")).toEqual(["berliner", "strasse", "12"]);
    expect(addressWords("C/ Mayor, 3")).toEqual(["calle", "mayor", "3"]);
    expect(addressWords("Rue de l'Église")).toEqual(["rue", "de", "l", "eglise"]);
  });

  it("matches the same postal code, city and street with house number", () => {
    expect(
      addressMatchesInput(
        input({ street: "hauptstr. 5", postalCode: "68259", city: "MANNHEIM", countryCode: "de" }),
        MANNHEIM,
      ),
    ).toBe(true);
    expect(addressMatchesInput(input({ street: "5 Hauptstraße", postalCode: "68259" }), MANNHEIM)).toBe(true);
    expect(addressMatchesInput(input({ street: "Hauptstraße 5", city: "Mannheim" }), MANNHEIM)).toBe(true);
    expect(
      addressMatchesInput(
        input({ street: "221B Baker Street", postalCode: "nw16xe", city: "London" }),
        candidate({ street: "221B Baker Street", postalCode: "NW1 6XE", city: "London" }),
      ),
    ).toBe(true);
    expect(
      addressMatchesInput(
        input({ street: "Kaiserstraße 1", postalCode: "60311", city: "Frankfurt" }),
        candidate({ street: "Kaiserstraße 1", postalCode: "60311", city: "Frankfurt am Main" }),
      ),
    ).toBe(true);
  });

  it("refuses another house number, postal code, city or country and too little input", () => {
    expect(addressMatchesInput(input({ street: "Hauptstraße 7", postalCode: "68259" }), MANNHEIM)).toBe(false);
    expect(addressMatchesInput(input({ street: "Hauptstraße 5", postalCode: "68159" }), MANNHEIM)).toBe(false);
    expect(addressMatchesInput(input({ street: "Hauptstraße 5", city: "Heidelberg" }), MANNHEIM)).toBe(false);
    expect(
      addressMatchesInput(input({ street: "Hauptstraße 5", postalCode: "68259", countryCode: "at" }), MANNHEIM),
    ).toBe(false);
    expect(addressMatchesInput(input({ street: "Hauptstraße 5" }), MANNHEIM)).toBe(false);
  });

  it("never adds a street the input did not have", () => {
    expect(addressMatchesInput(input({ postalCode: "68259", city: "Mannheim" }), MANNHEIM)).toBe(false);
    expect(
      addressMatchesInput(
        input({ postalCode: "68259", city: "Mannheim" }),
        candidate({ postalCode: "68259", city: "Mannheim" }),
      ),
    ).toBe(true);
  });

  it("picks the first candidate that matches", () => {
    const other = candidate({ street: "Hauptstraße 5", postalCode: "77694", city: "Kehl", countryCode: "de" });
    expect(
      bestAddressMatch(input({ street: "Hauptstraße 5", postalCode: "68259" }), [
        { name: null, address: other },
        { name: null, address: MANNHEIM },
      ])?.address,
    ).toEqual(MANNHEIM);
    expect(
      bestAddressMatch(input({ street: "Hauptstraße 9", postalCode: "68259" }), [{ name: null, address: MANNHEIM }]),
    ).toBeNull();
  });
});
