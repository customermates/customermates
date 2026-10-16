import { COUNTRY_CODES } from "@/constants/countries";
import { REGISTERED_LOCALES } from "@/i18n/locale-registry";

import { comparableName } from "./address-region";

const CODES = new Set<string>(COUNTRY_CODES);
const ALIASES: Readonly<Record<string, string>> = {
  usa: "us",
  "united states of america": "us",
  uk: "gb",
  "great britain": "gb",
  england: "gb",
  scotland: "gb",
  wales: "gb",
  "northern ireland": "gb",
  holland: "nl",
};

let names: ReadonlyMap<string, string> | null = null;

function countryNames(): ReadonlyMap<string, string> {
  if (names) return names;
  const found = new Map<string, string>();
  for (const locale of REGISTERED_LOCALES) {
    const display = new Intl.DisplayNames([locale], { type: "region" });
    for (const code of COUNTRY_CODES) {
      const name = display.of(code.toUpperCase());
      if (name) found.set(comparableName(name), code);
    }
  }
  for (const [alias, code] of Object.entries(ALIASES)) found.set(comparableName(alias), code);
  names = found;
  return found;
}

export function countryCodeFromText(text: string): string | null {
  const value = text.trim();
  if (!value) return null;
  if (/^[A-Za-z]{2}$/u.test(value)) {
    const code = value.toLowerCase();
    return CODES.has(code) ? code : null;
  }
  return countryNames().get(comparableName(value)) ?? null;
}
