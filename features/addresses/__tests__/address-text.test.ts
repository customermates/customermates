import { describe, expect, it } from "vitest";

import { addressFromImportText } from "../address-text";

describe("addresses read from import text", () => {
  it("splits street, postal code, city and country so the postal code directory can place them", () => {
    expect(addressFromImportText("Hauptstraße 5, 68159 Mannheim, Germany")).toMatchObject({
      street: "Hauptstraße 5",
      line2: null,
      postalCode: "68159",
      city: "Mannheim",
      region: null,
      countryCode: "de",
      formatted: "Hauptstraße 5, 68159 Mannheim",
      location: null,
      verification: { status: "unverified" },
    });
    expect(addressFromImportText("10 Downing Street, London SW1A 2AA, United Kingdom")).toMatchObject({
      street: "10 Downing Street",
      postalCode: "SW1A 2AA",
      city: "London",
      countryCode: "gb",
    });
    expect(addressFromImportText("1 Main St, Suite 4, Austin, TX 78701, USA")).toMatchObject({
      street: "1 Main St",
      line2: "Suite 4",
      postalCode: "78701",
      city: "Austin",
      region: "TX",
      countryCode: "us",
    });
  });

  it("reads a postal code written as its own part before or after the city", () => {
    expect(addressFromImportText("210 Market Street, 94105, San Francisco, United States")).toMatchObject({
      street: "210 Market Street",
      postalCode: "94105",
      city: "San Francisco",
      countryCode: "us",
    });
    expect(addressFromImportText("Hauptstraße 5, Mannheim, 68159, Germany")).toMatchObject({
      street: "Hauptstraße 5",
      postalCode: "68159",
      city: "Mannheim",
      countryCode: "de",
    });
  });

  it("keeps text it cannot read as an address given only as text", () => {
    for (const text of ["Hauptstraße 5, Mannheim", "Hauptstraße 5, 1234567 Mannheim, Germany", "Somewhere, Atlantis"])
      expect(addressFromImportText(text)).toMatchObject({ postalCode: null, countryCode: null, formatted: text });
  });
});
