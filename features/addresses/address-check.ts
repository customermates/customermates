import type { AddressCountryFormat, AddressFormatPart, AddressFormatSource } from "./address-country-format";
import type { RecordAddress } from "@/features/records/record-model.schema";
import type { RecordAddressParts } from "@/features/records/record-address-lines";

import { checkAddressRegion, comparableName, findAddressRegion, isLatinText } from "./address-region";
import { cleanPostalCode, normalizePostalCode, postalCodeExample } from "./address-postal-code";

export const ADDRESS_ISSUE_CODES = [
  "countryUnknown",
  "postalCodeInvalid",
  "regionInvalid",
  "countryMissing",
  "partMissing",
  "regionUnknown",
  "postalCodeRegionMismatch",
  "cityMismatch",
] as const;
export type AddressIssueCode = (typeof ADDRESS_ISSUE_CODES)[number];
export type AddressIssuePart = AddressFormatPart | "countryCode";
export type AddressIssue = {
  code: AddressIssueCode;
  severity: "error" | "warning";
  part: AddressIssuePart;
  example?: string;
  expected?: string[];
};

export type PostalCodePlace = { city: string | null; region: string | null; latitude: number; longitude: number };
export type PostalCodePlaces = { match: "exact" | "area" | "none"; cityChecked: boolean; places: PostalCodePlace[] };
export type AddressFormatCheck = { parts: RecordAddressParts; issues: AddressIssue[] };

const BLOCKING: ReadonlySet<AddressIssueCode> = new Set(["countryUnknown", "postalCodeInvalid", "regionInvalid"]);
const MAX_EXPECTED = 5;

function issue(code: AddressIssueCode, part: AddressIssuePart, extra: Pick<AddressIssue, "example" | "expected"> = {}) {
  return { code, severity: BLOCKING.has(code) ? "error" : "warning", part, ...extra } satisfies AddressIssue;
}

export function isBlockingAddressIssue(candidate: AddressIssue): boolean {
  return candidate.severity === "error";
}

function present(parts: RecordAddressParts, part: AddressFormatPart): boolean {
  return Boolean(parts[part]?.trim());
}

function startsWith(longer: readonly string[], shorter: readonly string[]): boolean {
  return (
    shorter.length > 0 && shorter.length <= longer.length && shorter.every((word, index) => longer[index] === word)
  );
}

const CITY_WORDS: Readonly<Record<string, string>> = { saint: "st", sankt: "st", sainte: "ste" };

export function cityWords(value: string): string[] {
  return comparableName(value)
    .replace(/(?<=[a-z])(ae|oe|ue)/gu, (pair) => pair[0])
    .split(" ")
    .filter(Boolean)
    .map((word) => CITY_WORDS[word] ?? word);
}

export function sameCityName(left: string, right: string): boolean {
  const a = cityWords(left);
  const b = cityWords(right);
  if (!a.length || !b.length) return false;
  if (startsWith(a, b) || startsWith(b, a)) return true;
  return a[0] === b[0] && a[0].length >= 4;
}

export function checkAddressFormat(
  input: RecordAddressParts,
  formatOf: AddressFormatSource,
  isKnownCountry: (countryCode: string) => boolean,
): AddressFormatCheck {
  const parts: RecordAddressParts = { ...input };
  const issues: AddressIssue[] = [];
  const countryCode = parts.countryCode;
  if (countryCode && !isKnownCountry(countryCode)) return { parts, issues: [issue("countryUnknown", "countryCode")] };
  if (!countryCode) {
    if (parts.postalCode) parts.postalCode = cleanPostalCode(parts.postalCode) || null;
    const checkable = present(parts, "postalCode") || present(parts, "region");
    return { parts, issues: checkable ? [issue("countryMissing", "countryCode")] : [] };
  }
  const format = formatOf(countryCode);
  let postalCodeValid = false;
  if (parts.postalCode) {
    const postalCode = normalizePostalCode(format, parts.postalCode);
    parts.postalCode = postalCode.value;
    postalCodeValid = postalCode.status === "valid";
    if (postalCode.status === "invalid") {
      const example = postalCodeExample(format);
      issues.push(issue("postalCodeInvalid", "postalCode", example ? { example } : {}));
    }
  }
  if (parts.region) {
    const region = checkAddressRegion(format, parts.region);
    parts.region = region.value;
    if (region.status === "invalidCode") issues.push(issue("regionInvalid", "region"));
    if (region.status === "unknown") issues.push(issue("regionUnknown", "region"));
    if (region.status === "matched" && region.region.zip && postalCodeValid && parts.postalCode) {
      if (!new RegExp(`^(?:${region.region.zip})`, "iu").test(parts.postalCode)) {
        const expected = format.regions
          .filter(
            (candidate) => candidate.zip && new RegExp(`^(?:${candidate.zip})`, "iu").test(parts.postalCode ?? ""),
          )
          .map((candidate) => candidate.key)
          .slice(0, MAX_EXPECTED);
        issues.push(issue("postalCodeRegionMismatch", "region", expected.length ? { expected } : {}));
      }
    }
  }
  if (present(parts, "street")) {
    for (const part of format.required) {
      if (!present(parts, part) && !(part === "postalCode" && !format.postalCode))
        issues.push(issue("partMissing", part));
    }
  }
  return { parts, issues };
}

function mean(places: readonly PostalCodePlace[]): RecordAddress["location"] {
  if (!places.length) return null;
  const lat = places.reduce((sum, place) => sum + place.latitude, 0) / places.length;
  const lon = places.reduce((sum, place) => sum + place.longitude, 0) / places.length;
  return { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5, precision: "postcode" };
}

export function distinctCities(places: readonly PostalCodePlace[]): string[] {
  const seen = new Set<string>();
  const cities: string[] = [];
  for (const place of places) {
    if (!place.city) continue;
    const key = cityWords(place.city).join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    cities.push(place.city);
  }
  return cities;
}

export function distinctRegions(places: readonly PostalCodePlace[]): string[] {
  return [...new Set(places.flatMap((place) => (place.region ? [place.region] : [])))];
}

export function checkAddressPlaces(
  parts: RecordAddressParts,
  lookup: PostalCodePlaces | null,
  format: AddressCountryFormat,
  formatIssues: readonly AddressIssue[] = [],
): { issues: AddressIssue[]; location: RecordAddress["location"] } {
  if (
    !lookup ||
    lookup.match !== "exact" ||
    !lookup.places.length ||
    !parts.postalCode ||
    formatIssues.some((candidate) => candidate.code === "postalCodeInvalid")
  )
    return { issues: [], location: null };
  const { places } = lookup;
  const issues: AddressIssue[] = [];
  const city = parts.city?.trim();
  const named = places.filter((place) => place.city);
  const matching = city ? named.filter((place) => place.city && sameCityName(city, place.city)) : [];
  const comparable = city && (!isLatinText(city) || named.some((place) => place.city && isLatinText(place.city)));
  if (lookup.cityChecked && city && named.length && !matching.length && comparable)
    issues.push(issue("cityMismatch", "city", { expected: distinctCities(named).slice(0, MAX_EXPECTED) }));
  const regions = distinctRegions(places);
  const region = parts.region?.trim() ? findAddressRegion(format, parts.region) : null;
  if (
    region &&
    regions.length &&
    !regions.includes(region.key) &&
    !formatIssues.some((candidate) => candidate.part === "region")
  )
    issues.push(issue("postalCodeRegionMismatch", "region", { expected: regions.slice(0, MAX_EXPECTED) }));
  return { issues, location: mean(matching.length ? matching : places) };
}
