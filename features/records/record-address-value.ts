import type { RecordAddress } from "./record-model.schema";

export const UNVERIFIED_ADDRESS: RecordAddress["verification"] = {
  status: "unverified",
  provider: null,
  checkedAt: null,
};

export function cleanAddressPart(value: string | null | undefined, limit: number): string | null {
  const text = value?.replace(/\s+/g, " ").trim().slice(0, limit).trim();
  return text ? text : null;
}

export function addressFromText(text: string): RecordAddress | null {
  const formatted = cleanAddressPart(text, 500);
  if (!formatted) return null;
  return {
    street: null,
    line2: null,
    postalCode: null,
    city: null,
    region: null,
    countryCode: null,
    formatted,
    location: null,
    verification: UNVERIFIED_ADDRESS,
  };
}

export function addressCountryLabel(countryCode: string, locale: string): string {
  return new Intl.DisplayNames([locale], { type: "region" }).of(countryCode.toUpperCase()) ?? countryCode.toUpperCase();
}

export function addressDisplayText(address: RecordAddress, locale: string): string {
  const country = address.countryCode ? addressCountryLabel(address.countryCode, locale) : null;
  return [address.formatted, country].filter(Boolean).join(", ");
}
