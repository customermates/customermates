import * as addressFormatterModule from "@fragaria/address-formatter";

import type { RecordAddress } from "./record-model.schema";
import type { RecordAddressParts } from "./record-address-lines";

import {
  cleanAddressPart,
  RECORD_ADDRESS_PART_LIMITS,
  RECORD_ADDRESS_PARTS,
  UNVERIFIED_ADDRESS,
} from "./record-address-value";
import { addressFormatterOf, recordAddressLines, recordAddressStreetLine } from "./record-address-lines";

const addressFormatter = addressFormatterOf(addressFormatterModule);

export function addressParts(address: Partial<RecordAddressParts>): RecordAddressParts {
  return {
    street: cleanAddressPart(address.street, RECORD_ADDRESS_PART_LIMITS.street),
    line2: cleanAddressPart(address.line2, RECORD_ADDRESS_PART_LIMITS.line2),
    postalCode: cleanAddressPart(address.postalCode, RECORD_ADDRESS_PART_LIMITS.postalCode),
    city: cleanAddressPart(address.city, RECORD_ADDRESS_PART_LIMITS.city),
    region: cleanAddressPart(address.region, RECORD_ADDRESS_PART_LIMITS.region),
    countryCode: address.countryCode ?? null,
  };
}

function hasParts(parts: RecordAddressParts): boolean {
  return Object.values(parts).some(Boolean);
}

export function formatRecordAddress(address: RecordAddressParts): string {
  const parts = addressParts(address);
  if (!hasParts({ ...parts, countryCode: null })) return "";
  return recordAddressLines(addressFormatter, parts).join(", ").slice(0, 500).trim();
}

export function formatAddressStreet(road: string, houseNumber: string | null, countryCode: string | null): string {
  return recordAddressStreetLine(addressFormatter, road, houseNumber, countryCode);
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
  address: RecordAddressParts,
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
  if (RECORD_ADDRESS_PARTS.some((key) => a[key] !== b[key])) return false;
  return hasParts(a) || cleanAddressPart(left.formatted, 500) === cleanAddressPart(right.formatted, 500);
}
