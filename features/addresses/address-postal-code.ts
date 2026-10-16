import type { AddressCountryFormat } from "./address-country-format";

export type PostalCodeCheck = { value: string; status: "valid" | "invalid" | "unchecked" };

const LEGACY_PREFIXES: Readonly<Record<string, readonly string[]>> = {
  ad: ["AND"],
  at: ["A"],
  be: ["B"],
  bg: ["BG"],
  ch: ["CH"],
  cy: ["CY"],
  cz: ["CZ"],
  de: ["D"],
  dk: ["DK"],
  ee: ["EST"],
  es: ["E"],
  fi: ["FIN", "SF"],
  fr: ["F"],
  gb: ["GB", "UK"],
  gr: ["GR"],
  hr: ["HR"],
  hu: ["H"],
  ie: ["IRL"],
  is: ["IS"],
  it: ["I"],
  li: ["FL"],
  lt: ["LT"],
  lu: ["L"],
  lv: ["LV"],
  mc: ["MC"],
  mt: ["M"],
  nl: ["NL"],
  no: ["N"],
  pl: ["PL"],
  pt: ["P"],
  ro: ["RO"],
  se: ["S"],
  si: ["SLO"],
  sk: ["SK"],
  sm: ["RSM"],
  tr: ["TR"],
  va: ["V"],
};

const patterns = new WeakMap<AddressCountryFormat, RegExp>();

function patternOf(format: AddressCountryFormat): RegExp | null {
  if (!format.postalCode) return null;
  let pattern = patterns.get(format);
  if (!pattern) {
    pattern = new RegExp(`^(?:${format.postalCode.pattern})$`, "iu");
    patterns.set(format, pattern);
  }
  return pattern;
}

function compact(value: string): string {
  return value.replace(/[\s-]+/gu, "");
}

function shape(value: string): string {
  return value.replace(/\p{L}/gu, "A").replace(/\p{N}/gu, "9");
}

function layoutOf(example: string): string {
  return example.replace(/[^\s-]/gu, "x");
}

function withLayout(bare: string, layout: string): string {
  let index = 0;
  let candidate = "";
  for (const character of layout) candidate += character === "x" ? (bare[index++] ?? "") : character;
  return candidate;
}

function spaced(value: string, examples: readonly string[]): string[] {
  const bare = compact(value);
  const separated = examples.filter(
    (example) => compact(example) !== example && compact(example).length === bare.length,
  );
  const exact = separated.filter((example) => shape(compact(example)) === shape(bare));
  const layouts = new Set((exact.length ? exact : separated).map(layoutOf));
  if (!exact.length && layouts.size !== 1) return [];
  return [...layouts].map((layout) => withLayout(bare, layout));
}

export function cleanPostalCode(value: string): string {
  return value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[‐-―−]/gu, "-")
    .replace(/\s+/gu, " ")
    .replace(/\s*-\s*/gu, "-")
    .trim();
}

export function postalCodeKey(value: string): string {
  return cleanPostalCode(value).replace(/[^\p{L}\p{N}]+/gu, "");
}

function prefixes(format: AddressCountryFormat): string[] {
  const country = format.countryCode?.toUpperCase();
  const codes = [
    ...(format.postalCode?.prefix ? [format.postalCode.prefix.trim().replace(/-$/u, "")] : []),
    ...(country ? [country] : []),
    ...(format.countryCode ? (LEGACY_PREFIXES[format.countryCode] ?? []) : []),
  ];
  return [...new Set(codes.filter(Boolean))].sort((left, right) => right.length - left.length);
}

function strippedOf(value: string, format: AddressCountryFormat): string[] {
  return prefixes(format).flatMap((prefix) => {
    const match = new RegExp(
      `^${prefix.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}(?:-|\\s)\\s*(?=\\p{N}|\\p{L})`,
      "u",
    ).exec(value);
    return match ? [value.slice(match[0].length)] : [];
  });
}

export function normalizePostalCode(format: AddressCountryFormat, input: string): PostalCodeCheck {
  const value = cleanPostalCode(input);
  const pattern = patternOf(format);
  if (!pattern || !format.postalCode || !value) return { value, status: "unchecked" };
  const examples = format.postalCode.examples;
  const valid = (candidate: string) => pattern.test(candidate);
  const accept = (candidate: string): PostalCodeCheck | null => {
    const layouts = spaced(candidate, examples).filter(valid);
    if (candidate === compact(candidate) && layouts[0]) return { value: layouts[0], status: "valid" };
    if (valid(candidate)) {
      const sameLayout = layouts.find(
        (layout) => layoutOf(layout).replace(/-/gu, " ") === layoutOf(candidate).replace(/-/gu, " "),
      );
      return { value: sameLayout ?? candidate, status: "valid" };
    }
    return layouts[0] ? { value: layouts[0], status: "valid" } : null;
  };
  const direct = accept(value);
  if (direct) return direct;
  for (const stripped of strippedOf(value, format)) {
    const result = accept(stripped);
    if (result) return result;
  }
  const country = format.countryCode?.toUpperCase();
  if (country) {
    const prefixed = accept(`${country}-${value}`);
    if (prefixed) return prefixed;
  }
  return { value, status: "invalid" };
}

export function postalCodeExample(format: AddressCountryFormat): string | null {
  return format.postalCode?.examples[0] ?? null;
}
