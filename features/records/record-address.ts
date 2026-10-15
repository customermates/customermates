import * as addressFormatterModule from "@fragaria/address-formatter";

import type { RecordAddress } from "./record-model.schema";

import { cleanAddressPart, UNVERIFIED_ADDRESS } from "./record-address-value";

type AddressFormatter = Pick<typeof addressFormatterModule, "format">;

const addressFormatter: AddressFormatter =
  (addressFormatterModule as { default?: AddressFormatter }).default ?? addressFormatterModule;

type AddressParts = Pick<RecordAddress, "street" | "line2" | "postalCode" | "city" | "region" | "countryCode">;

const PART_LIMITS = {
  street: 200,
  line2: 200,
  postalCode: 20,
  city: 200,
  region: 200,
} as const;

function addressParts(address: AddressParts): AddressParts {
  return {
    street: cleanAddressPart(address.street, PART_LIMITS.street),
    line2: cleanAddressPart(address.line2, PART_LIMITS.line2),
    postalCode: cleanAddressPart(address.postalCode, PART_LIMITS.postalCode),
    city: cleanAddressPart(address.city, PART_LIMITS.city),
    region: cleanAddressPart(address.region, PART_LIMITS.region),
    countryCode: address.countryCode,
  };
}

function hasParts(parts: AddressParts): boolean {
  return Object.values(parts).some(Boolean);
}

export function formatRecordAddress(address: AddressParts): string {
  const parts = addressParts(address);
  if (!hasParts({ ...parts, countryCode: null })) return "";
  const lines = addressFormatter.format(
    {
      ...(parts.street ? { road: parts.street } : {}),
      ...(parts.postalCode ? { postcode: parts.postalCode } : {}),
      ...(parts.city ? { city: parts.city } : {}),
      ...(parts.region ? { state: parts.region } : {}),
      ...(parts.countryCode ? { countryCode: parts.countryCode.toUpperCase() } : {}),
    },
    {
      output: "array",
      abbreviate: false,
      appendCountry: false,
      cleanupPostcode: false,
    },
  );
  const street = parts.street;
  if (parts.line2) lines.splice((street ? lines.findIndex((line) => line.includes(street)) : -1) + 1, 0, parts.line2);
  return lines.join(", ").slice(0, 500).trim();
}

export function unverifiedRecordAddress(address: RecordAddress): RecordAddress | null {
  const parts = addressParts(address);
  const formatted = hasParts(parts) ? formatRecordAddress(parts) : (cleanAddressPart(address.formatted, 500) ?? "");
  if (!formatted && !hasParts(parts)) return null;
  return {
    ...parts,
    formatted,
    location: null,
    verification: UNVERIFIED_ADDRESS,
  };
}

export function verifiedRecordAddress(
  address: AddressParts,
  verification: {
    provider: string;
    checkedAt: string;
    location: RecordAddress["location"];
  },
): RecordAddress {
  const parts = addressParts(address);
  return {
    ...parts,
    formatted: formatRecordAddress(parts),
    location: verification.location,
    verification: {
      status: "verified",
      provider: verification.provider,
      checkedAt: verification.checkedAt,
    },
  };
}

export function sameAddressParts(left: RecordAddress, right: RecordAddress): boolean {
  const a = addressParts(left);
  const b = addressParts(right);
  const keys = ["street", "line2", "postalCode", "city", "region", "countryCode"] as const;
  if (keys.some((key) => a[key] !== b[key])) return false;
  return hasParts(a) || cleanAddressPart(left.formatted, 500) === cleanAddressPart(right.formatted, 500);
}
