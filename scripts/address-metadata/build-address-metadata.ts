import type {
  AddressCityLabel,
  AddressCountryMetadata,
  AddressFormatPart,
  AddressMetadata,
  AddressPostalCodeLabel,
  AddressRegionLabel,
  AddressRegionMetadata,
} from "@/features/addresses/address-country-format";

import {
  ADDRESS_CITY_LABELS,
  ADDRESS_FORMAT_PARTS,
  ADDRESS_POSTAL_CODE_LABELS,
  ADDRESS_REGION_LABELS,
} from "@/features/addresses/address-country-format";

export type LibaddressinputEntry = Readonly<Record<string, string>>;

export type LibaddressinputSnapshot = {
  license: string;
  retrievedOn: string;
  url: string;
  entries: Readonly<Record<string, LibaddressinputEntry>>;
};

const PART_TOKENS: Readonly<Record<string, AddressFormatPart>> = {
  A: "street",
  C: "city",
  S: "region",
  Z: "postalCode",
};
const POSTAL_CODE_LABELS = new Set<string>(ADDRESS_POSTAL_CODE_LABELS);
const CITY_LABELS = new Set<string>(ADDRESS_CITY_LABELS);
const REGION_LABELS = new Set<string>(ADDRESS_REGION_LABELS);

function list(value: string | undefined): string[] {
  return value === undefined || value === "" ? [] : value.split("~");
}

function parts(value: string | undefined): AddressFormatPart[] {
  const found = new Set<AddressFormatPart>();
  for (const token of value ?? "") {
    const part = PART_TOKENS[token];
    if (part) found.add(part);
  }
  return ADDRESS_FORMAT_PARTS.filter((part) => found.has(part));
}

function formatLines(format: string): AddressFormatPart[][] {
  return format
    .split("%n")
    .map((line) =>
      [...line.matchAll(/%([A-Z])/gu)].flatMap(([, token]) => (PART_TOKENS[token] ? [PART_TOKENS[token]] : [])),
    )
    .map((line) => line.filter((part, index) => line.indexOf(part) === index))
    .filter((line) => line.length > 0);
}

function placeMissing(lines: AddressFormatPart[][], part: AddressFormatPart): AddressFormatPart[][] {
  if (lines.some((line) => line.includes(part))) return lines;
  if (part === "city") {
    const region = lines.findIndex((line) => line.includes("region"));
    if (region >= 0) return [...lines.slice(0, region + 1), ["city"], ...lines.slice(region + 1)];
    const postal = lines.findIndex((line) => line.includes("postalCode"));
    if (postal >= 0) return [...lines.slice(0, postal), ["city"], ...lines.slice(postal)];
  }
  return [...lines, [part]];
}

function label<T extends string>(value: string | undefined, allowed: ReadonlySet<string>, key: string): T | undefined {
  if (value === undefined) return undefined;
  if (!allowed.has(value)) throw new Error(`${key}: unknown name type ${value}`);
  return value as T;
}

function compiled(pattern: string, key: string, anchor: "full" | "prefix"): RegExp {
  try {
    return new RegExp(anchor === "full" ? `^(?:${pattern})$` : `^(?:${pattern})`, "iu");
  } catch (error) {
    throw new Error(`${key}: postal code pattern ${pattern} does not compile`, { cause: error });
  }
}

function comparable(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function variantIndex(
  variant: LibaddressinputEntry,
  keys: readonly string[],
  iso: readonly string[],
): Map<number, number> | null {
  const variantKeys = list(variant.sub_keys);
  const variantIso = list(variant.sub_isoids);
  if (variantKeys.length !== keys.length) return null;
  const byIso = iso.length && variantIso.length === keys.length && iso.every(Boolean) && variantIso.every(Boolean);
  const own = byIso ? iso : keys;
  const theirs = byIso ? variantIso : variantKeys;
  const positions = new Map(theirs.map((value, position) => [value, position]));
  if (positions.size !== theirs.length || own.some((value) => !positions.has(value))) return null;
  return new Map(own.map((value, index) => [index, positions.get(value) ?? -1]));
}

function regionsOf(
  entry: LibaddressinputEntry,
  variants: readonly LibaddressinputEntry[],
  key: string,
): AddressRegionMetadata[] | undefined {
  const keys = list(entry.sub_keys);
  if (!keys.length) return undefined;
  const names = list(entry.sub_names);
  const latin = list(entry.sub_lnames);
  const iso = list(entry.sub_isoids);
  const zips = list(entry.sub_zips);
  for (const column of [names, latin, iso, zips])
    if (column.length && column.length !== keys.length) throw new Error(`${key}: subdivision columns differ in length`);
  const aligned = variants.map((variant) => variantIndex(variant, keys, iso));
  return keys.map((regionKey, index) => {
    const name = names[index] || regionKey;
    const known = new Set([regionKey, name, latin[index] ?? ""].filter(Boolean).map(comparable));
    const aliases: string[] = [];
    for (const [position, variant] of variants.entries()) {
      const variantPosition = aligned[position]?.get(index);
      if (variantPosition === undefined) continue;
      for (const candidate of [
        list(variant.sub_names)[variantPosition],
        list(variant.sub_keys)[variantPosition],
        list(variant.sub_lnames)[variantPosition],
      ]) {
        if (!candidate || known.has(comparable(candidate))) continue;
        known.add(comparable(candidate));
        aliases.push(candidate);
      }
    }
    const zip = zips[index];
    if (zip) compiled(zip, `${key}/${regionKey}`, "prefix");
    return {
      ...(aliases.length ? { aliases } : {}),
      ...(iso[index] && iso[index] !== regionKey ? { iso: iso[index] } : {}),
      key: regionKey,
      ...(latin[index] ? { latin: latin[index] } : {}),
      ...(name !== regionKey ? { name } : {}),
      ...(zip ? { zip } : {}),
    };
  });
}

function sameParts(left: readonly AddressFormatPart[], right: readonly AddressFormatPart[]): boolean {
  return left.length === right.length && left.every((part, index) => part === right[index]);
}

function countryMetadata(
  entry: LibaddressinputEntry,
  defaults: AddressMetadata["defaults"],
  variants: readonly LibaddressinputEntry[],
  key: string,
): AddressCountryMetadata {
  const pattern = entry.zip;
  const examples = list(entry.zipex?.replaceAll(",", "~")).filter(Boolean);
  if (pattern) {
    const regex = compiled(pattern, key, "full");
    for (const example of examples)
      if (!regex.test(example)) throw new Error(`${key}: example ${example} does not match ${pattern}`);
  }
  const regions = regionsOf(entry, variants, key);
  let lines = entry.fmt ? formatLines(entry.fmt) : defaults.lines;
  if (pattern) lines = placeMissing(lines, "postalCode");
  if (regions) lines = placeMissing(lines, "region");
  lines = placeMissing(lines, "city");
  const required = entry.require === undefined ? undefined : parts(entry.require);
  const upper = entry.upper === undefined ? undefined : parts(entry.upper);
  const cityLabel = label<AddressCityLabel>(entry.locality_name_type, CITY_LABELS, key);
  const postalCodeLabel = label<AddressPostalCodeLabel>(entry.zip_name_type, POSTAL_CODE_LABELS, key);
  const regionLabel = label<AddressRegionLabel>(entry.state_name_type, REGION_LABELS, key);
  return {
    ...(cityLabel && cityLabel !== defaults.cityLabel ? { cityLabel } : {}),
    lines,
    ...(pattern
      ? { postalCode: { examples, pattern, ...(entry.postprefix ? { prefix: entry.postprefix } : {}) } }
      : {}),
    ...(postalCodeLabel && postalCodeLabel !== defaults.postalCodeLabel ? { postalCodeLabel } : {}),
    ...(regionLabel && regionLabel !== defaults.regionLabel ? { regionLabel } : {}),
    ...(regions ? { regions } : {}),
    ...(required && !sameParts(required, defaults.required) ? { required } : {}),
    ...(upper && !sameParts(upper, defaults.upper) ? { upper } : {}),
  };
}

function defaultsOf(entry: LibaddressinputEntry): AddressMetadata["defaults"] {
  return {
    cityLabel: label<AddressCityLabel>(entry.locality_name_type, CITY_LABELS, "ZZ") ?? "city",
    lines: formatLines(entry.fmt ?? "%A%n%C"),
    postalCodeLabel: label<AddressPostalCodeLabel>(entry.zip_name_type, POSTAL_CODE_LABELS, "ZZ") ?? "postal",
    regionLabel: label<AddressRegionLabel>(entry.state_name_type, REGION_LABELS, "ZZ") ?? "province",
    required: parts(entry.require ?? "AC"),
    upper: parts(entry.upper ?? ""),
  };
}

export function buildAddressMetadata(snapshot: LibaddressinputSnapshot): AddressMetadata {
  const zz = snapshot.entries["data/ZZ"];
  if (!zz) throw new Error("The snapshot has no data/ZZ defaults");
  const defaults = defaultsOf(zz);
  const ids = Object.keys(snapshot.entries).sort();
  const countries: Record<string, AddressCountryMetadata> = {};
  for (const id of ids) {
    if (!/^data\/[A-Z]{2}$/u.test(id) || id === "data/ZZ") continue;
    const entry = snapshot.entries[id];
    const key = id.slice("data/".length);
    if (entry.key !== key) throw new Error(`${id}: key ${entry.key} does not match`);
    const variants = ids.filter((candidate) => candidate.startsWith(`${id}--`)).map((candidate) => snapshot.entries[candidate]);
    countries[key.toLowerCase()] = countryMetadata(entry, defaults, variants, key);
  }
  if (Object.keys(countries).length < 200) throw new Error("The snapshot lists fewer than 200 countries");
  return {
    countries,
    defaults,
    source: { license: snapshot.license, retrievedOn: snapshot.retrievedOn, url: snapshot.url },
  };
}

function byKey([left]: [string, unknown], [right]: [string, unknown]): number {
  const a = left.toLowerCase();
  const b = right.toLowerCase();
  return a < b ? -1 : a > b ? 1 : 0;
}

function sortedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedKeys);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(byKey)
      .map(([key, item]) => [key, sortedKeys(item)]),
  );
}

export function addressMetadataJson(metadata: AddressMetadata): string {
  return `${JSON.stringify(sortedKeys(metadata))}\n`;
}
