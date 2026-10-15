import { describe, expect, it } from "vitest";

import { photonMatch, photonMatches } from "../photon-address-mapping";

const CHECKED_AT = "2026-10-15T08:00:00.000Z";

function feature(properties: Record<string, unknown>, coordinates: number[] | null = [8.5370071, 49.4857901]) {
  return {
    type: "Feature",
    properties,
    ...(coordinates ? { geometry: { type: "Point", coordinates } } : {}),
  };
}

const MANNHEIM_HOUSE = feature({
  osm_type: "W",
  osm_id: 226294726,
  osm_key: "building",
  osm_value: "apartments",
  type: "house",
  housenumber: "5",
  street: "Hauptstraße",
  locality: "Feudenheim",
  district: "Feudenheim",
  city: "Mannheim",
  state: "Baden-Württemberg",
  country: "Deutschland",
  postcode: "68259",
  countrycode: "DE",
});

describe("Photon results", () => {
  it("maps a German street address into a verified address with the country's street order", () => {
    expect(photonMatch(MANNHEIM_HOUSE, CHECKED_AT)).toEqual({
      name: null,
      address: {
        street: "Hauptstraße 5",
        line2: null,
        postalCode: "68259",
        city: "Mannheim",
        region: "Baden-Württemberg",
        countryCode: "de",
        formatted: "Hauptstraße 5, 68259 Mannheim",
        location: { lat: 49.4857901, lon: 8.5370071 },
        verification: { status: "verified", provider: "photon", checkedAt: CHECKED_AT },
      },
    });
  });

  it("maps a US address with its state and leading house number", () => {
    const match = photonMatch(
      feature(
        {
          type: "house",
          housenumber: "1600",
          street: "Amphitheatre Parkway",
          city: "Mountain View",
          county: "Santa Clara County",
          state: "California",
          postcode: "94043",
          countrycode: "US",
        },
        [-122.0842499, 37.4224764],
      ),
      CHECKED_AT,
    );
    expect(match?.address).toMatchObject({
      street: "1600 Amphitheatre Parkway",
      city: "Mountain View",
      region: "California",
      postalCode: "94043",
      countryCode: "us",
      formatted: "1600 Amphitheatre Parkway, Mountain View, CA 94043",
      location: { lat: 37.4224764, lon: -122.0842499 },
    });
  });

  it("keeps the name of a point of interest next to its postal address", () => {
    const match = photonMatch(
      feature({
        osm_key: "shop",
        osm_value: "gold_buyer",
        type: "house",
        housenumber: "55",
        name: "Mannheim Gold Collection",
        street: "Hauptstraße",
        district: "Sundheim",
        city: "Kehl",
        county: "Ortenaukreis",
        state: "Baden-Württemberg",
        postcode: "77694",
        countrycode: "DE",
      }),
      CHECKED_AT,
    );
    expect(match?.name).toBe("Mannheim Gold Collection");
    expect(match?.address).toMatchObject({ street: "Hauptstraße 55", line2: null, city: "Kehl", postalCode: "77694" });
  });

  it("uses the locality as the city of a village address", () => {
    const match = photonMatch(
      feature({
        type: "house",
        housenumber: "3",
        street: "Dorfstraße",
        locality: "Kleindorf",
        county: "Landkreis Rostock",
        state: "Mecklenburg-Vorpommern",
        postcode: "18198",
        countrycode: "DE",
      }),
      CHECKED_AT,
    );
    expect(match?.address).toMatchObject({
      street: "Dorfstraße 3",
      city: "Kleindorf",
      formatted: "Dorfstraße 3, 18198 Kleindorf",
    });
  });

  it("keeps a street without a house number and a named place without a street", () => {
    expect(
      photonMatch(
        feature({ type: "street", name: "Hauptstraße", city: "Mannheim", postcode: "68159", countrycode: "DE" }),
        CHECKED_AT,
      )?.address,
    ).toMatchObject({ street: "Hauptstraße", postalCode: "68159", city: "Mannheim" });
    const hut = photonMatch(
      feature({
        type: "house",
        name: "Kärlingerhaus",
        city: "Schönau am Königssee",
        postcode: "83471",
        countrycode: "DE",
      }),
      CHECKED_AT,
    );
    expect(hut).toMatchObject({ name: null, address: { street: "Kärlingerhaus", city: "Schönau am Königssee" } });
  });

  it("maps a city result to a city without a street", () => {
    expect(
      photonMatch(
        feature({ type: "city", name: "Mannheim", state: "Baden-Württemberg", countrycode: "DE" }),
        CHECKED_AT,
      ),
    ).toMatchObject({
      name: null,
      address: { street: null, city: "Mannheim", formatted: "Mannheim, Baden-Württemberg" },
    });
  });

  it("skips results coarser than a city and features without usable parts", () => {
    for (const type of ["country", "state", "county"])
      expect(photonMatch(feature({ type, name: "Bayern", countrycode: "DE" }), CHECKED_AT)).toBeNull();
    expect(photonMatch(feature({ type: "other", countrycode: "DE" }), CHECKED_AT)).toBeNull();
    expect(photonMatch({ properties: "not an object" }, CHECKED_AT)).toBeNull();
    expect(photonMatch(null, CHECKED_AT)).toBeNull();
  });

  it("drops unknown countries, extra postal codes and impossible coordinates", () => {
    const match = photonMatch(
      feature(
        {
          type: "house",
          street: "Rruga",
          housenumber: "5",
          city: "Pristina",
          postcode: "10000;10010",
          countrycode: "ZZ",
        },
        [500, 95],
      ),
      CHECKED_AT,
    );
    expect(match?.address).toMatchObject({ countryCode: null, postalCode: "10000", location: null });
  });

  it("reads a collection, removes duplicates and refuses a body that is not one", () => {
    expect(
      photonMatches({ type: "FeatureCollection", features: [MANNHEIM_HOUSE, MANNHEIM_HOUSE] }, CHECKED_AT),
    ).toHaveLength(1);
    expect(photonMatches({ features: "nope" }, CHECKED_AT)).toBeNull();
    expect(photonMatches("<html>", CHECKED_AT)).toBeNull();
  });
});
