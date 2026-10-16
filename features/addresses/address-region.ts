import type { AddressCountryFormat, AddressRegionMetadata } from "./address-country-format";

export type RegionCheck =
  | { status: "matched"; value: string; region: AddressRegionMetadata }
  | { status: "unknown" | "invalidCode" | "ambiguous" | "unchecked"; value: string };

export type RegionMatch = AddressRegionMetadata | "ambiguous" | null;

type RegionIndex = {
  tiers: Array<Map<string, AddressRegionMetadata | null>>;
  tokens: Array<{ tokens: string[]; region: AddressRegionMetadata }>;
};

const ADMINISTRATIVE_WORDS = new Set([
  "autonomous",
  "avtonomnaya",
  "avtonomnyy",
  "canton",
  "city",
  "co",
  "county",
  "de",
  "del",
  "department",
  "departamento",
  "district",
  "do",
  "el",
  "emirate",
  "estado",
  "fu",
  "governorate",
  "island",
  "islands",
  "kanton",
  "ken",
  "krai",
  "kray",
  "la",
  "maakond",
  "municipality",
  "of",
  "oblast",
  "okrug",
  "parish",
  "prefecture",
  "province",
  "provincia",
  "region",
  "regione",
  "republic",
  "respublika",
  "sheng",
  "shi",
  "state",
  "territory",
  "the",
  "to",
  "voblasts",
  "zizhiqu",
  "автономная",
  "автономный",
  "край",
  "область",
  "округ",
  "республика",
]);

const LETTER_FOLDS: Readonly<Record<string, string>> = {
  ß: "ss",
  ı: "i",
  ł: "l",
  ø: "o",
  æ: "ae",
  œ: "oe",
  đ: "d",
  ð: "d",
  þ: "th",
};

export function comparableName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[ßıłøæœđðþ]/gu, (letter) => LETTER_FOLDS[letter] ?? letter)
    .replace(/['’`.]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function significant(value: string): string[] {
  const words = comparableName(value).split(" ").filter(Boolean);
  const kept = words.filter((word) => !ADMINISTRATIVE_WORDS.has(word));
  return kept.length ? kept : words;
}

const indexes = new WeakMap<AddressCountryFormat, RegionIndex>();

function looksLikeCode(value: string): boolean {
  return /^[\p{L}\p{N}]{1,3}$/u.test(value) || /^[A-Za-z]{2}-[\p{L}\p{N}]{1,3}$/u.test(value);
}

function regionNames(format: AddressCountryFormat, region: AddressRegionMetadata): string[] {
  const country = format.countryCode?.toUpperCase();
  return [
    region.key,
    region.name,
    region.latin,
    region.iso,
    region.iso && country ? `${country}-${region.iso}` : undefined,
    country && /^[A-Z0-9]{1,3}$/u.test(region.key) ? `${country}-${region.key}` : undefined,
    ...(region.aliases ?? []),
  ].filter((name): name is string => Boolean(name));
}

function indexOf(format: AddressCountryFormat): RegionIndex {
  const cached = indexes.get(format);
  if (cached) return cached;
  const tiers = [0, 1, 2].map(() => new Map<string, AddressRegionMetadata | null>());
  const tokens: RegionIndex["tokens"] = [];
  const add = (tier: number, alias: string, region: AddressRegionMetadata) => {
    if (!alias) return;
    const known = tiers[tier].get(alias);
    tiers[tier].set(alias, known === undefined || known === region ? region : null);
  };
  for (const region of format.regions) {
    for (const name of regionNames(format, region)) {
      add(0, comparableName(name), region);
      if (looksLikeCode(name)) continue;
      const words = significant(name);
      add(1, words.join(" "), region);
      add(2, [...words].sort().join(" "), region);
      tokens.push({ tokens: words, region });
    }
  }
  const index = { tiers, tokens };
  indexes.set(format, index);
  return index;
}

function startsWithTokens(longer: readonly string[], shorter: readonly string[]): boolean {
  return (
    shorter.length > 0 && shorter.length < longer.length && shorter.every((token, index) => longer[index] === token)
  );
}

export function matchAddressRegion(format: AddressCountryFormat, input: string): RegionMatch {
  const value = input.trim();
  if (!format.regions.length || !value) return null;
  const index = indexOf(format);
  const exact = index.tiers[0].get(comparableName(value));
  if (exact === null) return "ambiguous";
  if (exact || looksLikeCode(value)) return exact ?? null;
  const words = significant(value);
  for (const [tier, alias] of [words.join(" "), [...words].sort().join(" ")].entries()) {
    const region = index.tiers[tier + 1].get(alias);
    if (region) return region;
    if (region === null) return "ambiguous";
  }
  if (words.join("").length < 4) return null;
  const prefixed = new Set(
    index.tokens
      .filter(({ tokens }) => startsWithTokens(words, tokens) || startsWithTokens(tokens, words))
      .map(({ region }) => region),
  );
  if (prefixed.size > 1) return "ambiguous";
  if (prefixed.size === 1) return [...prefixed][0];
  return index.tokens.some(({ tokens }) => words.every((word) => tokens.includes(word))) ? "ambiguous" : null;
}

export function findAddressRegion(format: AddressCountryFormat, input: string): AddressRegionMetadata | null {
  const match = matchAddressRegion(format, input);
  return match === "ambiguous" ? null : match;
}

export function isLatinText(value: string): boolean {
  return !/[^\p{Script=Latin}\p{N}\p{P}\p{Z}\p{S}\p{M}]/u.test(value);
}

export function regionValue(region: AddressRegionMetadata, input: string): string {
  return region.latin && isLatinText(input) && !isLatinText(region.key) ? region.latin : region.key;
}

function codeShape(value: string): string {
  return value.toUpperCase().replace(/\p{L}/gu, "A").replace(/\p{N}/gu, "9");
}

const codeShapes = new WeakMap<AddressCountryFormat, ReadonlySet<string>>();

function codeShapesOf(format: AddressCountryFormat): ReadonlySet<string> {
  const cached = codeShapes.get(format);
  if (cached) return cached;
  const shapes = new Set(
    format.regions
      .flatMap((region) => [region.key, region.iso])
      .filter((code): code is string => Boolean(code) && /^[A-Za-z0-9]{1,3}$/u.test(code ?? ""))
      .map(codeShape),
  );
  codeShapes.set(format, shapes);
  return shapes;
}

function shapedLikeRegionCode(format: AddressCountryFormat, value: string): boolean {
  const country = format.countryCode?.toUpperCase();
  const iso = /^([A-Za-z]{2})-([A-Za-z0-9]{1,3})$/u.exec(value);
  if (iso) return iso[1].toUpperCase() === country;
  return /^[A-Za-z0-9]{1,3}$/u.test(value) && codeShapesOf(format).has(codeShape(value));
}

export function checkAddressRegion(format: AddressCountryFormat, input: string): RegionCheck {
  const value = input.replace(/\s+/gu, " ").trim();
  if (!format.regions.length || !value) return { status: "unchecked", value };
  const region = matchAddressRegion(format, value);
  if (region === "ambiguous") return { status: "ambiguous", value };
  if (region) return { status: "matched", value: regionValue(region, value), region };
  return { status: shapedLikeRegionCode(format, value) ? "invalidCode" : "unknown", value };
}

export function addressRegionLabel(region: AddressRegionMetadata, latin: boolean): string {
  const local = region.name ?? region.key;
  return latin && region.latin && !isLatinText(local) ? region.latin : local;
}
