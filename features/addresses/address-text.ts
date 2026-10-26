import type { RecordAddress } from "@/features/records/record-model.schema";

import {
  addressFromText,
  cleanAddressPart,
  RECORD_ADDRESS_PART_LIMITS,
  UNVERIFIED_ADDRESS,
} from "@/features/records/record-address-value";
import { unverifiedRecordAddress } from "@/features/records/record-address";
import { countryCodeFromText } from "./address-country-name";
import { addressFormatOf, isKnownAddressCountry } from "./address-metadata";
import { normalizePostalCode } from "./address-postal-code";
import { findAddressRegion } from "./address-region";

type Locality = { postalCode: string; place: string; trailing: boolean };

function localityOf(segment: string, countryCode: string): Locality | null {
  const format = addressFormatOf(countryCode);
  const words = segment.split(" ");
  for (let size = 1; size <= Math.min(2, words.length - 1); size += 1) {
    const splits = [
      { code: words.slice(0, size), place: words.slice(size), trailing: false },
      { code: words.slice(-size), place: words.slice(0, -size), trailing: true },
    ];
    for (const split of splits) {
      const postalCode = normalizePostalCode(format, split.code.join(" "));
      if (postalCode.status === "valid")
        return { postalCode: postalCode.value, place: split.place.join(" "), trailing: split.trailing };
    }
  }
  return null;
}

export function addressFromImportText(text: string): RecordAddress | null {
  const segments = text
    .split(/[,\n]/u)
    .map((segment) => segment.replace(/\s+/gu, " ").trim())
    .filter(Boolean);
  const countryCode = segments.length >= 3 ? countryCodeFromText(segments.at(-1) ?? "") : null;
  if (!countryCode || !isKnownAddressCountry(countryCode)) return addressFromText(text);
  const rest = segments.slice(0, -1);
  const locality = localityOf(rest.at(-1) ?? "", countryCode);
  if (!locality || !locality.place || rest.length < 2) return addressFromText(text);
  const placeIsRegion =
    locality.trailing && rest.length >= 3 && findAddressRegion(addressFormatOf(countryCode), locality.place) !== null;
  const lines = rest.slice(0, placeIsRegion ? -2 : -1);
  return unverifiedRecordAddress({
    street: cleanAddressPart(lines[0], RECORD_ADDRESS_PART_LIMITS.street),
    line2: cleanAddressPart(lines.slice(1).join(", "), RECORD_ADDRESS_PART_LIMITS.line2),
    postalCode: locality.postalCode,
    city: placeIsRegion ? (rest.at(-2) ?? null) : locality.place,
    region: placeIsRegion ? locality.place : null,
    countryCode,
    formatted: "",
    location: null,
    verification: UNVERIFIED_ADDRESS,
  });
}
