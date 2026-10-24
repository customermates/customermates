import type { AddressCountryFormat } from "../address-country-format";

import { cityWords } from "../address-check";
import { cleanPostalCode, normalizePostalCode, postalCodeKey } from "../address-postal-code";
import { comparableName, findAddressRegion } from "../address-region";
import { postalCodeDataError } from "./postal-code-zip";

export type GeoNamesPostalCode = {
  countryCode: string;
  postalCode: string;
  place: string;
  admin1Name: string;
  admin1Code: string;
  admin2Name: string;
  admin2Code: string;
  admin3Name: string;
  admin3Code: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

export type PostalCodeRow = {
  postalKey: string;
  postalCode: string;
  ordinal: number;
  city: string | null;
  region: string | null;
  latitude: number;
  longitude: number;
};

export type PostalCodeSourceRows = { rows: Iterable<GeoNamesPostalCode>; region: string | null };

type CitySource = "place" | "admin2" | "admin3" | "none";
type CountryRule = {
  city?: CitySource;
  cityName?: (name: string) => string;
  prepare?: (rows: readonly GeoNamesPostalCode[]) => GeoNamesPostalCode[];
  aggregateKeyLength?: number;
};

export const MAX_ROWS_PER_CODE = 40;
const MIN_AGGREGATE_SHARE = 0.05;
const MAX_AGGREGATE_CITIES = 5;
const MIN_REGION_MATCH_RATE = 0.5;
const NUMBERED_VARIANT = /^(.+?)\s+\d+(?:\s+[\p{L}]+)?$/u;

function districtCity(name: string): string | null {
  const city = name
    .replace(/^(?:Kreisfreie Stadt|Stadtkreis|Landeshauptstadt|Stadt)\s+/u, "")
    .replace(/,\s*(?:Stadt|Freie und Hansestadt|Hansestadt|Landeshauptstadt)$/u, "")
    .trim();
  if (!city || /^(?:Landkreis|Kreis|Region|Regionalverband)\b/u.test(city) || /kreis$/iu.test(city)) return null;
  return city;
}

function germanRows(rows: readonly GeoNamesPostalCode[]): GeoNamesPostalCode[] {
  const placed = new Set(rows.filter((row) => row.accuracy !== null).map((row) => row.postalCode));
  const seen = new Set<string>();
  return rows.flatMap((row) => {
    if (row.accuracy !== null) return [row];
    if (placed.has(row.postalCode) || seen.has(row.postalCode)) return [];
    seen.add(row.postalCode);
    return [{ ...row, place: districtCity(row.admin3Name) ?? "" }];
  });
}

function britishRows(rows: readonly GeoNamesPostalCode[]): GeoNamesPostalCode[] {
  return rows.map((row) => (row.admin2Name === "Greater London" ? { ...row, place: "London" } : row));
}

function withoutOfficeNumber(name: string): string {
  return name.replace(/^(.+?)\s+\d+(?:\s+\p{Lu}{2,4})?$/u, "$1");
}

function japaneseCity(name: string): string {
  return name.replace(/\s+(Shi|Ku|Gun|Machi|Cho|Mura|Son)$/u, (_suffix, kind: string) => `-${kind.toLowerCase()}`);
}

const COUNTRY_RULES: Readonly<Record<string, CountryRule>> = {
  ca: { aggregateKeyLength: 3 },
  ch: { cityName: withoutOfficeNumber },
  de: { prepare: germanRows },
  es: { city: "admin3" },
  fr: { cityName: withoutOfficeNumber },
  gb: { prepare: britishRows },
  id: { city: "none" },
  in: { city: "admin2" },
  jp: { city: "admin2", cityName: japaneseCity },
  mx: { city: "admin2" },
  pe: { city: "admin3" },
  sg: { city: "none" },
  tr: { city: "admin2" },
};

function coordinate(value: string, limit: number, line: number): number {
  const parsed = Number(value);
  if (!value.trim() || !Number.isFinite(parsed) || Math.abs(parsed) > limit)
    throw postalCodeDataError(`Line ${line} has an invalid coordinate ${value}`);
  return parsed;
}

function parsedLine(line: string, expected: string, number: number): GeoNamesPostalCode {
  const columns = line.split("\t");
  if (columns.length !== 12) throw postalCodeDataError(`Line ${number} has ${columns.length} columns`);
  const [countryCode, postalCode, place, admin1Name, admin1Code, admin2Name, admin2Code, admin3Name, admin3Code] =
    columns.map((column) => column.trim());
  if (countryCode !== expected) throw postalCodeDataError(`Line ${number} belongs to ${countryCode}`);
  if (!postalCode || postalCode.length > 20) throw postalCodeDataError(`Line ${number} has an invalid postal code`);
  if (place.length > 180) throw postalCodeDataError(`Line ${number} has an overlong place name`);
  const accuracy = columns[11].trim();
  if (accuracy && !/^[1-6]$/u.test(accuracy)) throw postalCodeDataError(`Line ${number} has an invalid accuracy`);
  return {
    countryCode,
    postalCode,
    place,
    admin1Name,
    admin1Code,
    admin2Name,
    admin2Code,
    admin3Name,
    admin3Code,
    latitude: coordinate(columns[9], 90, number),
    longitude: coordinate(columns[10], 180, number),
    accuracy: accuracy ? Number(accuracy) : null,
  };
}

function* geoNamesPostalCodes(text: string, country: string): Generator<GeoNamesPostalCode> {
  const expected = country.toUpperCase();
  let start = 0;
  for (let number = 1; start < text.length; number += 1) {
    const newline = text.indexOf("\n", start);
    const end = newline < 0 ? text.length : newline;
    const line = text.slice(start, text.charCodeAt(end - 1) === 13 ? end - 1 : end);
    start = end + 1;
    if (line.trim()) yield parsedLine(line, expected, number);
  }
}

export function geoNamesPostalCodeRows(text: string, country: string): Iterable<GeoNamesPostalCode> {
  return { [Symbol.iterator]: () => geoNamesPostalCodes(text, country) };
}

type RegionLookup = (row: GeoNamesPostalCode, level: 1 | 2) => string | null;

function regionLookup(format: AddressCountryFormat): RegionLookup {
  const cache = new Map<string, string | null>();
  return (row, level) => {
    const [code, name] = level === 1 ? [row.admin1Code, row.admin1Name] : [row.admin2Code, row.admin2Name];
    const key = `${level}\u0000${code}\u0000${name}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    const byName = name ? findAddressRegion(format, name)?.key : null;
    const region = byName ?? (code && !/^\d+$/u.test(code) ? findAddressRegion(format, code)?.key : null) ?? null;
    cache.set(key, region);
    return region;
  };
}

function regionLevel(
  format: AddressCountryFormat,
  rows: Iterable<GeoNamesPostalCode>,
  regionOf: RegionLookup,
): 1 | 2 | null {
  if (!format.regions.length) return null;
  let total = 0;
  let first = 0;
  let second = 0;
  for (const row of rows) {
    total += 1;
    if (regionOf(row, 1)) first += 1;
    if (regionOf(row, 2)) second += 1;
  }
  if (!total) return null;
  const best = first >= second ? 1 : 2;
  return Math.max(first, second) / total >= MIN_REGION_MATCH_RATE ? best : null;
}

function cityOf(row: GeoNamesPostalCode, rule: CountryRule): string | null {
  const source = rule.city ?? "place";
  const raw =
    source === "none"
      ? ""
      : source === "admin2"
        ? row.admin2Name || row.place
        : source === "admin3"
          ? row.admin3Name || row.place
          : row.place;
  const cleaned = raw.replace(/\s+/gu, " ").trim();
  if (!cleaned) return null;
  return rule.cityName ? rule.cityName(cleaned) : cleaned;
}

function municipal(row: GeoNamesPostalCode, city: string): boolean {
  const name = comparableName(city);
  return [row.admin3Name, row.admin2Name].some((admin) => admin && comparableName(admin) === name);
}

type Group = {
  city: string | null;
  region: string | null;
  count: number;
  latitude: number;
  longitude: number;
  first: number;
  municipal: boolean;
};

function round(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

function withoutNumberedVariants(groups: Group[]): Group[] {
  const names = new Set(groups.flatMap((group) => (group.city ? [cityWords(group.city).join(" ")] : [])));
  return groups.filter((group) => {
    const base = group.city ? NUMBERED_VARIANT.exec(group.city)?.[1] : undefined;
    return !base || !names.has(cityWords(base).join(" "));
  });
}

function ranked(groups: Group[], aggregate: boolean): Group[] {
  const sorted = withoutNumberedVariants(groups).sort(
    (left, right) =>
      Number(right.municipal) - Number(left.municipal) || right.count - left.count || left.first - right.first,
  );
  if (!aggregate) return sorted.slice(0, MAX_ROWS_PER_CODE);
  const total = sorted.reduce((sum, group) => sum + group.count, 0);
  const kept = sorted.filter((group, index) => index === 0 || group.count / total >= MIN_AGGREGATE_SHARE);
  return kept.slice(0, MAX_AGGREGATE_CITIES);
}

export function postalCodeRows(
  sources: readonly PostalCodeSourceRows[],
  format: AddressCountryFormat,
): PostalCodeRow[] {
  const rule = (format.countryCode && COUNTRY_RULES[format.countryCode]) || {};
  const codes = new Map<string, { postalCode: string; groups: Map<string, Group> }>();
  const regionOf = regionLookup(format);
  let order = 0;
  for (const source of sources) {
    const rows = rule.prepare ? rule.prepare([...source.rows]) : source.rows;
    const level = source.region ? null : regionLevel(format, rows, regionOf);
    const fixedRegion =
      source.region && format.regions.some((region) => region.key === source.region) ? source.region : null;
    for (const row of rows) {
      const normalized = normalizePostalCode(format, row.postalCode.replace(/\s+CEDEX(?:\s+\d+)?$/iu, ""));
      const display =
        normalized.status === "valid"
          ? normalized.value
          : cleanPostalCode(row.postalCode).replace(/\s+CEDEX(?:\s+\d+)?$/u, "");
      const fullKey = postalCodeKey(display);
      const postalKey = rule.aggregateKeyLength ? fullKey.slice(0, rule.aggregateKeyLength) : fullKey;
      if (!postalKey) continue;
      const city = cityOf(row, rule);
      const region = fixedRegion ?? (level ? regionOf(row, level) : null);
      const code = codes.get(postalKey) ?? {
        postalCode: rule.aggregateKeyLength ? postalKey : display,
        groups: new Map<string, Group>(),
      };
      codes.set(postalKey, code);
      const key = JSON.stringify([city ? cityWords(city).join(" ") : "", region]);
      const group = code.groups.get(key);
      if (group) {
        group.count += 1;
        group.latitude += row.latitude;
        group.longitude += row.longitude;
        group.municipal ||= Boolean(city && municipal(row, city));
      } else {
        code.groups.set(key, {
          city,
          region,
          count: 1,
          latitude: row.latitude,
          longitude: row.longitude,
          first: order,
          municipal: Boolean(city && municipal(row, city)),
        });
      }
      order += 1;
    }
  }
  const result: PostalCodeRow[] = [];
  for (const [postalKey, code] of [...codes.entries()].sort(([left], [right]) => (left < right ? -1 : 1))) {
    for (const [ordinal, group] of ranked([...code.groups.values()], Boolean(rule.aggregateKeyLength)).entries()) {
      result.push({
        postalKey,
        postalCode: code.postalCode,
        ordinal,
        city: group.city,
        region: group.region,
        latitude: round(group.latitude / group.count),
        longitude: round(group.longitude / group.count),
      });
    }
  }
  return result;
}

export function validPostalCodeShare(rows: readonly PostalCodeRow[], format: AddressCountryFormat): number {
  const keys = new Map(rows.map((row) => [row.postalKey, row.postalCode]));
  if (!keys.size) return 0;
  const valid = [...keys.values()].filter((code) => normalizePostalCode(format, code).status === "valid").length;
  return valid / keys.size;
}
