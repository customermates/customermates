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
  for (let size = 1; size <= Math.min(2, words.length); size += 1) {
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
  const index = rest.length - (rest.length >= 3 && localityOf(rest.at(-2) ?? "", countryCode)?.place === "" ? 2 : 1);
  const locality = localityOf(rest[index] ?? "", countryCode);
  if (!locality || index < 1) return addressFromText(text);
  const cityAfter = !locality.place && index < rest.length - 1;
  const cityBefore = !locality.place && !cityAfter;
  const placeIsRegion =
    locality.trailing &&
    Boolean(locality.place) &&
    rest.length >= 3 &&
    findAddressRegion(addressFormatOf(countryCode), locality.place) !== null;
  const lines = rest.slice(0, placeIsRegion || cityBefore ? index - 1 : index);
  if (!lines.length) return addressFromText(text);
  const city = cityAfter ? rest[index + 1] : cityBefore || placeIsRegion ? rest[index - 1] : locality.place;
  return unverifiedRecordAddress({
    street: cleanAddressPart(lines[0], RECORD_ADDRESS_PART_LIMITS.street),
    line2: cleanAddressPart(lines.slice(1).join(", "), RECORD_ADDRESS_PART_LIMITS.line2),
    postalCode: locality.postalCode,
    city,
    region: placeIsRegion ? locality.place : null,
    countryCode,
    formatted: "",
    location: null,
    verification: UNVERIFIED_ADDRESS,
  });
}
