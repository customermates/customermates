import type { RecordAddress, RecordScalar } from "./record-model.schema";

export const RECORD_ADDRESS_PARTS = ["street", "line2", "postalCode", "city", "region", "countryCode"] as const;
export type RecordAddressPart = (typeof RECORD_ADDRESS_PARTS)[number];
export const RECORD_ADDRESS_PART_LIMITS = { street: 200, line2: 200, postalCode: 20, city: 200, region: 200 } as const;

export const UNVERIFIED_ADDRESS: RecordAddress["verification"] = {
  status: "unverified",
  provider: null,
  checkedAt: null,
};

export function unverifiedAddressScalar(parts: Partial<Record<RecordAddressPart, string | null>>): RecordScalar | null {
  if (!RECORD_ADDRESS_PARTS.some((part) => parts[part])) return null;
  return {
    kind: "address",
    value: {
      street: parts.street ?? null,
      line2: parts.line2 ?? null,
      postalCode: parts.postalCode ?? null,
      city: parts.city ?? null,
      region: parts.region ?? null,
      countryCode: parts.countryCode ?? null,
      formatted: "",
      location: null,
      verification: UNVERIFIED_ADDRESS,
    },
  };
}

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
