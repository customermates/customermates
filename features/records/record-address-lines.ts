import type { format } from "@fragaria/address-formatter";
import type { RecordAddress } from "./record-model.schema";

export type AddressFormatter = { format: typeof format };

export type RecordAddressParts = Pick<
  RecordAddress,
  "street" | "line2" | "postalCode" | "city" | "region" | "countryCode"
>;

const FORMAT_OPTIONS = {
  output: "array",
  abbreviate: false,
  appendCountry: false,
  cleanupPostcode: false,
} as const;

export function addressFormatterOf(module: unknown): AddressFormatter {
  return ((module as { default?: AddressFormatter }).default ?? module) as AddressFormatter;
}

export function recordAddressLines(formatter: AddressFormatter, parts: RecordAddressParts): string[] {
  const lines = formatter.format(
    {
      ...(parts.street ? { road: parts.street } : {}),
      ...(parts.postalCode ? { postcode: parts.postalCode } : {}),
      ...(parts.city ? { city: parts.city } : {}),
      ...(parts.region ? { state: parts.region } : {}),
      ...(parts.countryCode ? { countryCode: parts.countryCode.toUpperCase() } : {}),
    },
    FORMAT_OPTIONS,
  );
  const street = parts.street;
  if (parts.line2) lines.splice((street ? lines.findIndex((line) => line.includes(street)) : -1) + 1, 0, parts.line2);
  return lines;
}

export function recordAddressStreetLine(
  formatter: AddressFormatter,
  road: string,
  houseNumber: string | null,
  countryCode: string | null,
): string {
  if (!houseNumber) return road;
  const [line] = formatter.format(
    { road, houseNumber, ...(countryCode ? { countryCode: countryCode.toUpperCase() } : {}) },
    FORMAT_OPTIONS,
  );
  return line?.includes(road) && line.includes(houseNumber) ? line : `${road} ${houseNumber}`;
}
