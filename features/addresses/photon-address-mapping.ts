import { z } from "zod";

import type { AddressLookupMatch } from "./address-lookup-provider";
import type { RecordAddress } from "@/features/records/record-model.schema";

import { COUNTRY_CODES } from "@/constants/countries";
import { formatAddressStreet, verifiedRecordAddress } from "@/features/records/record-address";

export const PHOTON_PROVIDER_ID = "photon";

const COARSE_TYPES = new Set(["country", "state", "county"]);
const PLACE_TYPES = new Set(["city", "locality", "district"]);
const NAMED_PLACE_TYPES = new Set(["house", "other"]);

const PhotonFeatureSchema = z.object({
  geometry: z.object({ coordinates: z.array(z.number()) }).nullish(),
  properties: z.record(z.string(), z.unknown()),
});

export const PhotonResponseSchema = z.object({ features: z.array(z.unknown()) });

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/\s+/gu, " ").trim();
  return cleaned || null;
}

function countryCodeOf(value: unknown): string | null {
  const code = text(value)?.toLowerCase();
  return code && COUNTRY_CODES.some((known) => known === code) ? code : null;
}

function postalCodeOf(value: unknown): string | null {
  const code = text(value)?.split(/[;,]/u, 1)[0].trim();
  return code && code.length <= 20 ? code : null;
}

function locationOf(coordinates: number[] | undefined): RecordAddress["location"] {
  const [lon, lat] = coordinates ?? [];
  if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

export function photonMatch(feature: unknown, checkedAt: string): AddressLookupMatch | null {
  const parsed = PhotonFeatureSchema.safeParse(feature);
  if (!parsed.success) return null;
  const properties = parsed.data.properties;
  const type = text(properties.type) ?? "other";
  if (COARSE_TYPES.has(type)) return null;
  const name = text(properties.name);
  const countryCode = countryCodeOf(properties.countrycode);
  const houseNumber = text(properties.housenumber);
  const locality = text(properties.locality) ?? text(properties.district);
  const city = text(properties.city) ?? (PLACE_TYPES.has(type) ? name : null) ?? locality;
  const road = text(properties.street) ?? (type === "street" ? name : null);
  const namedPlace = NAMED_PLACE_TYPES.has(type) ? name : null;
  const base = road ?? namedPlace ?? (houseNumber ? (locality ?? city) : null);
  const street = base ? formatAddressStreet(base, houseNumber, countryCode) : null;
  const postalCode = postalCodeOf(properties.postcode);
  if (!street && !postalCode && !city) return null;
  return {
    name: namedPlace && namedPlace !== base && namedPlace !== street ? namedPlace : null,
    address: verifiedRecordAddress(
      { street, line2: null, postalCode, city, region: text(properties.state), countryCode },
      { provider: PHOTON_PROVIDER_ID, checkedAt, location: locationOf(parsed.data.geometry?.coordinates) },
    ),
  };
}

export function photonMatches(body: unknown, checkedAt: string): AddressLookupMatch[] | null {
  const parsed = PhotonResponseSchema.safeParse(body);
  if (!parsed.success) return null;
  const seen = new Set<string>();
  return parsed.data.features.flatMap((feature) => {
    const match = photonMatch(feature, checkedAt);
    if (!match) return [];
    const key = JSON.stringify([match.name, match.address.formatted, match.address.countryCode]);
    if (seen.has(key)) return [];
    seen.add(key);
    return [match];
  });
}
