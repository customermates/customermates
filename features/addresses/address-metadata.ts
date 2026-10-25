import type { AddressMetadata } from "./address-country-format";

import { COUNTRY_CODES } from "@/constants/countries";
import metadata from "./address-metadata.json";
import { addressFormatSource } from "./address-country-format";

export const ADDRESS_METADATA = metadata as AddressMetadata;
export const addressFormatOf = addressFormatSource(ADDRESS_METADATA);

const KNOWN_COUNTRIES = new Set<string>(COUNTRY_CODES);

export function isKnownAddressCountry(countryCode: string): boolean {
  return KNOWN_COUNTRIES.has(countryCode);
}
