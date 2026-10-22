import { postalCodeKey } from "../address-postal-code";

type PostalCodeSource = { file: string; entry: string; required: boolean; region: string | null };

const TERRITORIES: Readonly<Record<string, readonly string[]>> = {
  au: ["CX", "CC", "NF"],
  dk: ["FO", "GL"],
  fi: ["AX"],
  fr: ["RE", "GP", "MQ", "GF", "YT", "PM", "WF", "PF", "NC"],
  gb: ["JE", "GG", "IM"],
  no: ["SJ"],
  us: ["PR", "GU", "VI", "AS", "MP", "MH", "FM", "PW"],
};

const FULL_FILES: Readonly<Record<string, string>> = { ca: "CA_full.csv" };

const ZERO_FILLED_CODES = new Set(["br", "cl", "cn"]);
const PREFIX_CODES = new Set(["ca", "gb", "ie", "mt", "nl"]);
const WITHOUT_CITY_CHECK = new Set(["ca", "gb"]);

export const POSTAL_CODE_LOADER_VERSION = 1;

type PostalCodeLookupKeys = { keys: string[]; exact: ReadonlySet<string> };

export function postalCodeSources(countryCode: string): PostalCodeSource[] {
  const country = countryCode.toUpperCase();
  const full = FULL_FILES[countryCode];
  return [
    full
      ? { file: `${full}.zip`, entry: `${full.replace(/\.csv$/u, "")}.txt`, required: true, region: null }
      : { file: `${country}.zip`, entry: `${country}.txt`, required: true, region: null },
    ...(TERRITORIES[countryCode] ?? []).map((territory) => ({
      file: `${territory}.zip`,
      entry: `${territory}.txt`,
      required: false,
      region: territory,
    })),
  ];
}

export function postalCodeFormatCheckable(countryCode: string): boolean {
  return !PREFIX_CODES.has(countryCode);
}

export function postalCodeCityChecked(countryCode: string): boolean {
  return !WITHOUT_CITY_CHECK.has(countryCode);
}

function areaKey(countryCode: string, key: string): string | null {
  switch (countryCode) {
    case "us":
      return /^\d{9}$/u.test(key) ? key.slice(0, 5) : null;
    case "nl":
      return /^\d{4}[A-Z]{2}$/u.test(key) ? key.slice(0, 4) : null;
    case "ca":
    case "ie":
      return key.length > 3 ? key.slice(0, 3) : null;
    case "gb":
      return key.length >= 5 ? key.slice(0, -3) : null;
    case "mt":
      return /^[A-Z]{3}\d+$/u.test(key) ? key.slice(0, 3) : null;
    case "ar":
      return /\d{4}/u.exec(key)?.[0] ?? null;
    default:
      return null;
  }
}

export function postalCodeLookupKeys(countryCode: string, postalCode: string): PostalCodeLookupKeys {
  const key = postalCodeKey(postalCode);
  if (!key) return { keys: [], exact: new Set() };
  const area = areaKey(countryCode, key);
  const exact = new Set([key, ...(area ? [area] : [])]);
  const keys = [...exact];
  if (ZERO_FILLED_CODES.has(countryCode)) {
    const digits = /\d*$/u.exec(key)?.[0].length ?? 0;
    for (let zeros = 1; zeros <= Math.min(digits, key.length - 2); zeros += 1)
      keys.push(`${key.slice(0, key.length - zeros)}${"0".repeat(zeros)}`);
  }
  for (let length = key.length - 1; length >= 2; length -= 1) keys.push(key.slice(0, length));
  return { keys: [...new Set(keys)], exact };
}
